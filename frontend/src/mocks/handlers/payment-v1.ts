import { http } from 'msw';
import type { OrderDetail, Payment, PaymentOrderAllocation } from '@/shared/types';
import { db } from '../db';
import {
  assertCounterPayable, assertOnlinePayable, createGatewayPayment, isGatewayMethod, livePendingPaymentOf, reconcilePayment,
} from '../payment-service';
import { fail, guardedV1, ok, readJson, url, envelopeError } from '../utils';
import { MOCK_BRANCH } from './branch';
import { accountFromRequest, type MockAccount } from './identity';

/**
 * Handler SmartAPI v1 cho thanh toán Online (Bearer, envelope { success, data, meta, trace_id }, snake_case):
 *  - POST /payments       — tạo giao dịch VNPay/Momo (Pending) cho 1..N đơn Online của chính user; trả payment_url giả.
 *  - GET  /payments/{id}  — trạng thái giao dịch (polling sau khi quay về từ cổng); chỉ chủ giao dịch đọc được.
 *
 * Tách khỏi handler Dine-in (`/payment/payments*` trong ./payment.ts): hai nhóm route khác tiền tố nên không đè nhau,
 * nhưng dùng chung db.payments/allocations. Giao dịch tạo ở đây được chốt bằng IPN giả CÓ SẴN của mock
 * (POST /payment/payments/:id/simulate) — API client thật không có endpoint simulate.
 */

const H_IDEMPOTENCY = 'Idempotency-Key';

type Loose = Record<string, unknown>;
const isRecord = (v: unknown): v is Loose => v !== null && typeof v === 'object' && !Array.isArray(v);

/** DECIMAL của server là chuỗi ("85000.00"): mock phát đúng dạng đó để mapper của client được chạy thật. */
const money = (n: number): string => n.toFixed(2);

// ── Xác thực ──────────────────────────────────────────────────────────
function authenticated(request: Request): MockAccount {
  const account = accountFromRequest(request);
  if (!account) fail(401, 'UNAUTHORIZED', 'Thiếu hoặc sai access token');
  return account;
}

function staffOf(request: Request): MockAccount {
  const account = authenticated(request);
  if (account.roleName !== 'Staff' && account.roleName !== 'Manager' && account.roleName !== 'Admin') fail(403, 'FORBIDDEN', 'Chỉ nhân viên mới được thao tác thanh toán tại quầy');
  return account;
}

// ── Body ──────────────────────────────────────────────────────────────
interface ParsedCreate {
  branchId: number;
  method: 'VNPay' | 'Momo';
  allocations: { orderId: number; amount: number }[];
  returnUrl: string;
}

interface ParsedCashCreate {
  branchId: number;
  method: 'Cash';
  allocations: { orderId: number; amount: number }[];
  cashierShiftId: number;
  cashReceived: number | null;
}

const asAmount = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

function parseCreate(body: unknown): ParsedCreate {
  if (!isRecord(body)) return fail(400, 'VALIDATION_ERROR', 'Body phải là một đối tượng JSON');

  const branchId = body.branch_id;
  if (typeof branchId !== 'number' || !Number.isInteger(branchId) || branchId < 1) fail(400, 'VALIDATION_ERROR', 'branch_id không hợp lệ');

  const method = body.payment_method;
  if (!isGatewayMethod(method)) fail(400, 'VALIDATION_ERROR', 'payment_method phải là VNPay hoặc Momo');

  const rawAllocations = body.allocations;
  if (!Array.isArray(rawAllocations) || rawAllocations.length === 0) fail(400, 'VALIDATION_ERROR', 'allocations phải là danh sách không rỗng');
  const allocations = rawAllocations.map((a: unknown) => {
    const row: Loose = isRecord(a) ? a : {};
    const orderId = row.order_id;
    const amount = asAmount(row.allocated_amount);
    if (typeof orderId !== 'number' || !Number.isInteger(orderId) || orderId < 1) fail(400, 'VALIDATION_ERROR', 'allocations[].order_id không hợp lệ');
    if (amount === null) fail(400, 'VALIDATION_ERROR', 'allocations[].allocated_amount phải là số dương');
    return { orderId, amount };
  });
  if (new Set(allocations.map((a) => a.orderId)).size !== allocations.length) fail(400, 'VALIDATION_ERROR', 'allocations bị trùng order_id');

  const returnUrl = body.return_url;
  if (typeof returnUrl !== 'string' || !isHttpUrl(returnUrl)) fail(400, 'VALIDATION_ERROR', 'return_url phải là URL http(s) tuyệt đối');

  return { branchId, method, allocations, returnUrl };
}

function parseCashCreate(body: Loose): ParsedCashCreate {
  const branchId = body.branch_id;
  const cashierShiftId = body.cashier_shift_id;
  if (!Number.isSafeInteger(branchId) || (branchId as number) < 1 || !Number.isSafeInteger(cashierShiftId) || (cashierShiftId as number) < 1) fail(400, 'VALIDATION_ERROR', 'branch_id và cashier_shift_id hợp lệ là bắt buộc');
  if (!Array.isArray(body.allocations) || body.allocations.length === 0) fail(400, 'VALIDATION_ERROR', 'allocations phải là danh sách không rỗng');
  const allocations = body.allocations.map((raw) => {
    const row: Loose = isRecord(raw) ? raw : {};
    if (!Number.isSafeInteger(row.order_id) || (row.order_id as number) < 1) fail(400, 'VALIDATION_ERROR', 'order_id không hợp lệ');
    const amount = asAmount(row.allocated_amount);
    if (amount === null) fail(400, 'VALIDATION_ERROR', 'allocated_amount phải là số dương');
    return { orderId: row.order_id as number, amount };
  });
  if (new Set(allocations.map((row) => row.orderId)).size !== allocations.length) fail(400, 'VALIDATION_ERROR', 'allocations bị trùng order_id');
  const received = body.cash_received;
  const cashReceived = received === undefined ? null : asAmount(received);
  if (received !== undefined && cashReceived === null) fail(400, 'VALIDATION_ERROR', 'cash_received phải là số dương');
  return { branchId: branchId as number, method: 'Cash', allocations, cashierShiftId: cashierShiftId as number, cashReceived };
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// ── View (wire) ───────────────────────────────────────────────────────
const allocationsOf = (payment: Payment): PaymentOrderAllocation[] => db.allocations.filter((a) => a.paymentId === payment.id);

const paymentView = (p: Payment) => ({
  id: p.id,
  branchId: p.branchId,
  cashierShiftId: p.cashierShiftId,
  paymentMethod: p.paymentMethod,
  amount: money(p.amount),
  refundedAmount: money(p.refundedAmount),
  cashReceived: p.cashReceived == null ? null : money(p.cashReceived),
  changeAmount: p.changeAmount == null ? null : money(p.changeAmount),
  status: p.status,
  transactionId: p.transactionId,
  expiresAt: p.expiresAt,
  paidAt: p.paidAt,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

const allocationView = (a: PaymentOrderAllocation) => ({
  id: a.id, paymentId: a.paymentId, orderId: a.orderId, allocatedAmount: money(a.allocatedAmount), createdAt: a.createdAt,
});

/**
 * payment_url GIẢ. Mock không có cổng ngoài nên trỏ về trang cổng giả lập của chính app (cùng origin với return_url),
 * mang đủ thông tin để trang đó chốt giao dịch rồi quay về return_url: paymentId, gateway (vnpay|momo), returnUrl.
 * Chỉ có khi giao dịch còn Pending — giao dịch đã chốt không còn gì để thanh toán.
 */
function fakePaymentUrl(payment: Payment, returnUrl: string): string | null {
  const first = allocationsOf(payment)[0];
  if (payment.status !== 'Pending' || !first) return null;
  const query = new URLSearchParams({ paymentId: String(payment.id), gateway: payment.paymentMethod.toLowerCase(), returnUrl });
  return `${new URL(returnUrl).origin}/payment/${first.orderId}?${query.toString()}`;
}

/** Response của POST: phẳng { ...payment, payment_url, allocations }. */
const createdView = (payment: Payment, returnUrl: string) => ({
  ...paymentView(payment),
  paymentUrl: payment.paymentMethod === 'Cash' ? null : fakePaymentUrl(payment, returnUrl),
  allocations: allocationsOf(payment).map(allocationView),
});

// ── Quyền đọc ─────────────────────────────────────────────────────────
/** Customer: chỉ giao dịch do chính mình tạo (của người khác → 404 như không tồn tại). Staff/Manager/Admin: không giới hạn thêm. */
function readablePayment(request: Request, rawId: unknown): Payment {
  const caller = authenticated(request);
  const id = Number(rawId);
  const payment = Number.isInteger(id) ? db.payments.find((p) => p.id === id) : undefined;
  if (!payment || (caller.roleName === 'Customer' && payment.createdBy !== caller.id)) {
    fail(404, 'PAYMENT_NOT_FOUND', `Không tìm thấy giao dịch ${String(rawId)}`);
  }
  return reconcilePayment(payment); // Pending quá hạn → Expired; đơn đã trả nơi khác → Cancelled
}

export const paymentV1Handlers = [
  // POST /payments — Idempotency-Key bắt buộc. Số tiền do server quyết định: allocated_amount chỉ để đối chiếu với đơn.
  http.post(
    url('/payments'),
    guardedV1(async ({ request }) => {
      const caller = authenticated(request);
      const key = request.headers.get(H_IDEMPOTENCY);
      if (!key) fail(400, 'VALIDATION_ERROR', 'Thiếu header Idempotency-Key');
      const body: unknown = await readJson(request);
      const cash = isRecord(body) && body.payment_method === 'Cash';
      const input = cash ? parseCashCreate(body) : parseCreate(body);
      if (cash ? !['Staff', 'Manager'].includes(caller.roleName) : caller.roleName !== 'Customer') fail(403, 'FORBIDDEN', 'Không có quyền tạo giao dịch này');
      // ── từ đây tới lúc ghi db KHÔNG có await: check-then-write là nguyên tử ──

      // Cùng key + cùng user → trả lại đúng giao dịch cũ (200), kể cả đã chốt. Khác đơn/phương thức → 409.
      const prior = db.payments.find((p) => p.idempotencyKey === key && (p.createdBy === caller.id || (cash && p.collectedBy === caller.id)));
      if (prior) {
        const sameOrders = allocationsOf(prior).map((a) => a.orderId).sort().join() === input.allocations.map((a) => a.orderId).sort().join();
        if (!sameOrders || prior.paymentMethod !== input.method || (cash && 'cashierShiftId' in input && prior.cashierShiftId !== input.cashierShiftId)) {
          fail(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key này đã dùng cho một giao dịch khác');
        }
        return ok(createdView(cash ? prior : reconcilePayment(prior), cash ? '' : ('returnUrl' in input ? input.returnUrl : '')), null, { status: 200 });
      }

      if (input.branchId !== MOCK_BRANCH.id) fail(404, 'NOT_FOUND', `Không có chi nhánh ${input.branchId}`);
      if (cash && 'cashierShiftId' in input && !db.cashierShifts.some((shift) => shift.id === input.cashierShiftId && shift.staffUserId === caller.id && shift.status === 'Open')) fail(409, 'INVALID_STATE_TRANSITION', 'Ca thu ngân không tồn tại hoặc đã đóng');
      // Đơn của user khác hoặc không tồn tại → cùng một 404 (không lộ sự tồn tại của đơn).
      const orders: OrderDetail[] = input.allocations.map(
        (a) => db.orders.find((o) => o.id === a.orderId && (cash && 'cashierShiftId' in input ? o.branchId === input.branchId : o.userId === caller.id)) ?? fail(404, 'ORDER_NOT_FOUND', `Không tìm thấy đơn ${a.orderId}`),
      );

      if (cash) {
        if (!('cashierShiftId' in input)) fail(400, 'VALIDATION_ERROR', 'Cash tại quầy bắt buộc cashier_shift_id');
        const shift = db.cashierShifts.find((entry) => entry.id === input.cashierShiftId && entry.staffUserId === caller.id && entry.status === 'Open');
        if (!shift) fail(409, 'INVALID_STATE_TRANSITION', 'Ca thu ngân không tồn tại hoặc đã đóng');
        orders.forEach((order, index) => {
          assertCounterPayable(order);
          if (order.finalAmount !== input.allocations[index]!.amount) fail(422, 'BUSINESS_RULE_VIOLATION', `allocated_amount của đơn ${order.orderCode} không khớp số tiền phải trả`);
        });
        const id = ++db.seq.payment;
        const at = new Date().toISOString().slice(0, 19);
        const payment: Payment = {
          id, branchId: input.branchId, cashierShiftId: input.cashierShiftId, idempotencyKey: key,
          paymentMethod: 'Cash', amount: orders.reduce((sum, order) => sum + order.finalAmount, 0), refundedAmount: 0,
          cashReceived: null, changeAmount: null, collectedBy: caller.id, transactionId: null,
          status: 'Pending', expiresAt: null, paidAt: null, createdBy: caller.id, createdAt: at, updatedAt: at,
        };
        db.payments.push(payment);
        db.allocations.push(...orders.map((order) => ({ id: ++db.seq.allocation, paymentId: id, orderId: order.id, allocatedAmount: order.finalAmount, createdAt: at })));
        return ok(createdView(payment, ''), null, { status: 201 });
      }

      // Đã có giao dịch cùng phương thức còn hiệu lực cho đơn (bấm lặp / key mới) → dùng lại, không tạo thêm.
      if (!cash && orders.length === 1) {
        const live = livePendingPaymentOf(orders[0]!.id, input.method);
        if (live) return ok(createdView(live, 'returnUrl' in input ? input.returnUrl : ''), null, { status: 200 });
      }

      orders.forEach(assertOnlinePayable);
      orders.forEach((o, i) => {
        if (o.branchId !== input.branchId) fail(422, 'BUSINESS_RULE_VIOLATION', `Đơn ${o.orderCode} không thuộc chi nhánh ${input.branchId}`);
        if (input.allocations[i]!.amount !== o.finalAmount) {
          fail(422, 'BUSINESS_RULE_VIOLATION', `allocated_amount của đơn ${o.orderCode} không khớp số tiền phải trả (${o.finalAmount})`);
        }
      });

      if (!('returnUrl' in input)) fail(400, 'VALIDATION_ERROR', 'return_url là bắt buộc với thanh toán online');
      const { payment } = createGatewayPayment({ orders, method: input.method, createdBy: caller.id, idempotencyKey: key });
      return ok(createdView(payment, input.returnUrl), null, { status: 201 });
    }),
  ),

  http.post(url('/payments/:id/confirm-cash'), guardedV1(async ({ request, params }) => {
    const caller = staffOf(request);
    const payment = db.payments.find((entry) => entry.id === Number(params.id));
    if (!payment) return envelopeError(404, 'PAYMENT_NOT_FOUND', 'Không tìm thấy giao dịch');
    const body: unknown = await readJson(request);
    if (!isRecord(body) || !Number.isSafeInteger(body.cashier_shift_id) || !Number.isSafeInteger(body.cash_received)) return envelopeError(400, 'VALIDATION_ERROR', 'cashier_shift_id và cash_received là bắt buộc');
    if (payment.paymentMethod !== 'Cash') return envelopeError(409, 'INVALID_STATE_TRANSITION', 'Chỉ giao dịch Cash mới xác nhận tại quầy');
    if (payment.status === 'Success') {
      if (payment.cashReceived !== body.cash_received) return envelopeError(409, 'IDEMPOTENCY_CONFLICT', 'Giao dịch đã được xác nhận với số tiền khác');
      return ok({ payment: paymentView(payment), allocations: allocationsOf(payment).map(allocationView) });
    }
    if (payment.status !== 'Pending' || (payment.createdBy !== caller.id && payment.collectedBy !== caller.id) || payment.cashierShiftId !== body.cashier_shift_id) return envelopeError(409, 'INVALID_STATE_TRANSITION', 'Giao dịch hoặc ca thu ngân không còn hợp lệ');
    const shift = db.cashierShifts.find((entry) => entry.id === body.cashier_shift_id && entry.staffUserId === caller.id && entry.status === 'Open');
    if (!shift) return envelopeError(409, 'INVALID_STATE_TRANSITION', 'Ca thu ngân không tồn tại hoặc đã đóng');
    if ((body.cash_received as number) < payment.amount) return envelopeError(400, 'INSUFFICIENT_CASH', 'Tiền khách đưa chưa đủ');
    const orders = allocationsOf(payment).map((allocation) => db.orders.find((order) => order.id === allocation.orderId)).filter((order): order is OrderDetail => !!order);
    payment.cashReceived = body.cash_received as number;
    payment.changeAmount = payment.cashReceived - payment.amount;
    payment.status = 'Success';
    payment.paidAt = new Date().toISOString().slice(0, 19);
    payment.updatedAt = payment.paidAt;
    shift.totalCashSales += payment.amount;
    shift.totalOrders += orders.length;
    orders.forEach((order) => { order.paymentStatus = 'Paid'; order.version += 1; order.updatedAt = payment.paidAt!; });
    return ok({ payment: paymentView(payment), allocations: allocationsOf(payment).map(allocationView) });
  })),

  http.get(url('/payments'), guardedV1(({ request }) => {
    const caller = authenticated(request);
    if (!['Staff', 'Manager', 'Admin'].includes(caller.roleName)) return envelopeError(403, 'FORBIDDEN', 'Không có quyền xem danh sách payment');
    const query = new URL(request.url).searchParams;
    const orderId = query.get('order_id');
    const status = query.get('status');
    const rows = db.payments.filter((payment) => {
      const allocations = allocationsOf(payment);
      return (!status || payment.status === status) && (!orderId || allocations.some((allocation) => allocation.orderId === Number(orderId)));
    }).map((payment) => ({ payment: paymentView(payment), allocations: allocationsOf(payment).map(allocationView) }));
    return ok(rows, { page: 1, size: rows.length, total: rows.length, totalPages: rows.length ? 1 : 0 });
  })),

  // GET /payments/{id} — { payment, allocations }. payment_url KHÔNG có ở đây (chỉ trả lúc tạo).
  http.get(
    url('/payments/:id'),
    guardedV1(({ request, params }) => {
      const payment = readablePayment(request, params.id);
      return ok({ payment: paymentView(payment), allocations: allocationsOf(payment).map(allocationView) });
    }),
  ),
];
