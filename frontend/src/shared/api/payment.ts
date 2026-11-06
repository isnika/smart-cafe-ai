import type {
  CashMovement,
  CashMovementInput,
  CashierShift,
  CloseCashierShiftInput,
  CreateRefundInput,
  InvoiceDetail,
  OpenCashierShiftInput,
  Invoice,
  Payment,
  PaymentGatewayStatus,
  PaymentMethod,
  PaymentOrderAllocation,
  PayOrdersInput,
  PayResult,
  Refund,
  SimulatePaymentInput,
} from '@/shared/types';
import { HEADER_IDEMPOTENCY_KEY } from './guest';
import { http } from './http';

const P = '/payment';

/** Khách guest quét QR bàn chứng minh quyền với đơn Dine-in của mình bằng sessionCode của phiên bàn. */
export interface PaymentCallOptions {
  sessionCode?: string | null;
  signal?: AbortSignal;
}

const callOptions = (o?: PaymentCallOptions) => ({
  ...(o?.sessionCode ? { headers: { 'X-Table-Session-Code': o.sessionCode } } : {}),
  ...(o?.signal ? { signal: o.signal } : {}),
});

/** 1..N đơn; VNPay/Momo trả `redirectUrl`. */
export const payOrders = (input: PayOrdersInput, opts?: PaymentCallOptions) =>
  http.post<PayResult>(`${P}/payments`, input, callOptions(opts));

/** Trạng thái một giao dịch (polling của trang cổng thanh toán). */
export const getPayment = (id: number, opts?: PaymentCallOptions) => http.get<PayResult>(`${P}/payments/${id}`, callOptions(opts));

// ── Spec v1: POST /payments, GET /payments/{id} (Bearer, envelope chuẩn) ──────────────
// Tách khỏi `payOrders`/`getPayment` ở trên (đường dẫn mock `/payment/payments`, dùng cho Dine-in).

export interface CreatePaymentAllocationInput {
  orderId: number;
  /** Số tiền do CALLER truyền (lấy từ đơn/server); client này không tự tính. */
  allocatedAmount: number;
}

/** Body spec: {branch_id, payment_method, allocations:[{order_id, allocated_amount}], return_url} (snake_case do `snake: true`). */
export interface CreatePaymentInput {
  branchId: number;
  paymentMethod: PaymentMethod;
  allocations: CreatePaymentAllocationInput[];
  returnUrl: string;
}

export interface CreatePaymentCtx {
  /** BẮT BUỘC: caller giữ nguyên key khi retry cùng một lần thanh toán, sinh key mới cho lần mới. */
  idempotencyKey: string;
  signal?: AbortSignal;
}

type Loose = Record<string, unknown>;

const isRecord = (v: unknown): v is Loose => v !== null && typeof v === 'object' && !Array.isArray(v);

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const numOr0 = (v: unknown): number => num(v) ?? 0;
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

function toPaymentAllocation(raw: unknown, fallbackPaymentId: number): PaymentOrderAllocation {
  const a: Loose = isRecord(raw) ? raw : {};
  return {
    id: numOr0(a.id),
    paymentId: num(a.paymentId) ?? fallbackPaymentId,
    orderId: numOr0(a.orderId),
    allocatedAmount: numOr0(a.allocatedAmount ?? a.amount),
    createdAt: str(a.createdAt) ?? '',
  };
}

function toPayment(raw: Loose): Payment {
  return {
    id: numOr0(raw.id ?? raw.paymentId),
    branchId: numOr0(raw.branchId),
    cashierShiftId: num(raw.cashierShiftId),
    idempotencyKey: str(raw.idempotencyKey),
    paymentMethod: (raw.paymentMethod ?? raw.method) as PaymentMethod,
    amount: numOr0(raw.amount ?? raw.totalAmount),
    refundedAmount: numOr0(raw.refundedAmount),
    cashReceived: num(raw.cashReceived),
    changeAmount: num(raw.changeAmount),
    collectedBy: str(raw.collectedBy),
    transactionId: str(raw.transactionId),
    status: raw.status as PaymentGatewayStatus,
    expiresAt: str(raw.expiresAt),
    paidAt: str(raw.paidAt),
    createdBy: str(raw.createdBy),
    createdAt: str(raw.createdAt) ?? '',
    updatedAt: str(raw.updatedAt) ?? str(raw.createdAt) ?? '',
  };
}

/**
 * Mapper (data đã camelCase bởi http.ts): nhận cả hai dạng response
 *  - lồng:   { payment: {...}, allocations: [...], redirectUrl | paymentUrl }
 *  - phẳng:  { id, status, ..., allocations: [...], paymentUrl }  (payment_url → paymentUrl)
 * DECIMAL dạng chuỗi → number; thiếu mảng → []; `paymentUrl` được đưa về `redirectUrl` của `PayResult`.
 */
export function toPayResult(raw: unknown): PayResult {
  const r: Loose = isRecord(raw) ? raw : {};
  const payment = toPayment(isRecord(r.payment) ? r.payment : r);
  const rawAllocations = Array.isArray(r.allocations) ? r.allocations : [];
  const inner: Loose = isRecord(r.payment) ? r.payment : {};
  return {
    payment,
    allocations: rawAllocations.map((a) => toPaymentAllocation(a, payment.id)),
    redirectUrl: str(r.redirectUrl) ?? str(r.paymentUrl) ?? str(inner.redirectUrl) ?? str(inner.paymentUrl),
    invoice: isRecord(r.invoice) ? (r.invoice as unknown as Invoice) : null,
  };
}

/**
 * POST /payments. Bearer mặc định của http.ts (401 → refresh single-flight), envelope chuẩn.
 * Header Idempotency-Key BẮT BUỘC. Không gửi số tiền tổng/giá: chỉ allocations do caller cung cấp.
 * Lỗi (409 IDEMPOTENCY_KEY_REUSED, ORDER_ALREADY_PAID, ...) được ném dưới dạng `ApiError`.
 */
export const createPayment = async (input: CreatePaymentInput, ctx: CreatePaymentCtx): Promise<PayResult> =>
  toPayResult(
    await http.post<unknown>(
      '/payments',
      {
        branchId: input.branchId,
        paymentMethod: input.paymentMethod,
        allocations: input.allocations.map((a) => ({ orderId: a.orderId, allocatedAmount: a.allocatedAmount })),
        returnUrl: input.returnUrl,
      },
      {
        snake: true,
        headers: { [HEADER_IDEMPOTENCY_KEY]: ctx.idempotencyKey },
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      },
    ),
  );

/** GET /payments/{id}: trạng thái giao dịch (dùng cho polling sau khi quay về từ cổng). */
export const getPaymentById = async (id: number, opts?: { signal?: AbortSignal }): Promise<PayResult> =>
  toPayResult(await http.get<unknown>(`/payments/${id}`, opts?.signal ? { signal: opts.signal } : {}));

/** MOCK: đóng vai IPN của cổng thanh toán. Backend thật không có endpoint này. */
export const simulatePayment = (id: number, input: SimulatePaymentInput, opts?: PaymentCallOptions) =>
  http.post<PayResult>(`${P}/payments/${id}/simulate`, input, callOptions(opts));

/**
 * Hóa đơn điện tử của giao dịch thanh toán thành công của đơn. Chỉ đọc: không bao giờ tạo hóa đơn mới
 * (hóa đơn được phát hành đúng 1 lần cùng giao dịch). 404 ORDER_NOT_FOUND | INVOICE_NOT_FOUND,
 * 409 PAYMENT_NOT_COMPLETED khi đơn chưa có giao dịch thành công.
 */
export const getInvoiceByOrder = (orderId: number, signal?: AbortSignal) =>
  http.get<InvoiceDetail>(`${P}/invoices`, { query: { orderId }, signal });

// Cashier shift
export const getCurrentCashierShift = (branchId: number, registerCode?: string) =>
  http.get<CashierShift | null>(`${P}/cashier-shifts/current`, { query: { branchId, registerCode } });
export const openCashierShift = (input: OpenCashierShiftInput) => http.post<CashierShift>(`${P}/cashier-shifts`, input);
export const closeCashierShift = (id: number, input: CloseCashierShiftInput) =>
  http.post<CashierShift>(`${P}/cashier-shifts/${id}/close`, input);
export const listCashMovements = (shiftId: number) => http.get<CashMovement[]>(`${P}/cashier-shifts/${shiftId}/movements`);
export const addCashMovement = (shiftId: number, input: CashMovementInput) =>
  http.post<CashMovement>(`${P}/cashier-shifts/${shiftId}/movements`, input);

// Refund
export const createRefund = (input: CreateRefundInput) => http.post<Refund>(`${P}/refunds`, input);