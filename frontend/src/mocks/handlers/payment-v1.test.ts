import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureHttp, isApiError, orderApi, paymentApi } from '@/shared/api';
import type { ApiError } from '@/shared/api';
import type { CreatePaymentInput } from '@/shared/api/payment';
import type { OrderDetail } from '@/shared/types';
import { db, nowNaive, resetDb } from '../db';
import { mockConfig, url } from '../utils';
import { handlers } from './index';
import { mockAccessToken, resetAuthMock } from './identity';

/** Kiểm thử MSW của POST /payments và GET /payments/{id} (SmartAPI v1), đi qua API client 2A-2 như UI sẽ gọi. */

const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());

const A = 'u-customer';
const B = 'u-customer2';
const STAFF = 'u-staff';

let token: string | null = null;
const as = (userId: string | null) => {
  token = userId ? mockAccessToken(userId) : null;
};
let seq = 0;
const key = () => `idem-${++seq}`;

beforeEach(() => {
  resetDb();
  resetAuthMock();
  mockConfig.latencyMs = 0;
  mockConfig.enforceAuth = false;
  configureHttp({ getToken: () => token, onUnauthorized: undefined, refresh: undefined });
  as(A);
});
afterEach(() => server.resetHandlers());

/** Tạo đơn Online qua đúng luồng v1 (giỏ → POST /orders). mockPaymentMethod=null ⇒ đơn COD (Pending, không chờ thanh toán). */
async function placeOnlineOrder(userId: string, mockPaymentMethod: string | null = 'VNPay'): Promise<OrderDetail> {
  as(userId);
  const ctx = { source: 'Online', fulfillmentType: 'Pickup' } as const;
  const cart = await orderApi.ensureCart(ctx, 1);
  await orderApi.addCartItem(ctx, { variantId: 12, quantity: 2, options: [{ optionId: 101 }, { optionId: 104 }] });
  return orderApi.createOnlineOrder(
    { cartId: cart.id, fulfillmentType: 'Pickup', branchId: 1 },
    { idempotencyKey: key(), ...(mockPaymentMethod !== null ? { mockPaymentMethod } : {}) },
  );
}

const returnUrlOf = (o: OrderDetail) => `http://localhost:5173/payment/${o.id}/return`;
const payInput = (o: OrderDetail, over: Partial<CreatePaymentInput> = {}): CreatePaymentInput => ({
  branchId: 1,
  paymentMethod: 'VNPay',
  allocations: [{ orderId: o.id, allocatedAmount: o.finalAmount }],
  returnUrl: returnUrlOf(o),
  ...over,
});

interface Wire { status: number; body: Record<string, unknown> }
async function raw(path: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}): Promise<Wire> {
  const res = await fetch(url(path), {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const data = (w: Wire) => w.body.data as Record<string, unknown>;
const errorOf = (w: Wire) => w.body.error as { code: string; message: string };
/** Route IPN giả cũ (/payment/payments/:id/simulate) giữ nguyên dạng lỗi Dine-in { message, code }, không envelope. */
const legacyCode = (w: Wire) => w.body.code;

const expectApiError = async (p: Promise<unknown>, status: number, code: string) => {
  const err = (await p.then(() => null, (e: unknown) => e)) as ApiError | null;
  expect(isApiError(err)).toBe(true);
  expect([err?.status, err?.code]).toEqual([status, code]);
};

const dbOrder = (id: number) => db.orders.find((o) => o.id === id)!;

describe('POST /payments', () => {
  it('tạo giao dịch Pending: envelope chuẩn, snake_case, DECIMAL dạng chuỗi, 201', async () => {
    const order = await placeOnlineOrder(A);
    const w = await raw('/payments', {
      method: 'POST',
      headers: { 'Idempotency-Key': key() },
      body: {
        branch_id: 1, payment_method: 'VNPay', return_url: returnUrlOf(order),
        allocations: [{ order_id: order.id, allocated_amount: order.finalAmount }],
      },
    });

    expect(w.status).toBe(201);
    expect(w.body).toMatchObject({ success: true, meta: null });
    expect(typeof w.body.trace_id).toBe('string');
    expect(data(w)).toMatchObject({
      payment_method: 'VNPay', status: 'Pending', branch_id: 1, amount: order.finalAmount.toFixed(2), refunded_amount: '0.00', paid_at: null,
    });
    expect(typeof data(w).expires_at).toBe('string');
    expect(data(w).allocations).toEqual([
      expect.objectContaining({ order_id: order.id, allocated_amount: order.finalAmount.toFixed(2) }),
    ]);
    // không lộ trường nội bộ
    expect(data(w)).not.toHaveProperty('idempotency_key');
    expect(data(w)).not.toHaveProperty('created_by');
  });

  it('API client 2A-2 map đúng; payment lưu theo user hiện tại; đơn chưa bị đụng tới', async () => {
    const order = await placeOnlineOrder(A);
    const r = await paymentApi.createPayment(payInput(order), { idempotencyKey: key() });

    expect(r.payment).toMatchObject({ paymentMethod: 'VNPay', status: 'Pending', amount: order.finalAmount, refundedAmount: 0, paidAt: null });
    expect(r.allocations).toEqual([expect.objectContaining({ paymentId: r.payment.id, orderId: order.id, allocatedAmount: order.finalAmount })]);
    expect(r.redirectUrl).toEqual(expect.any(String));

    const stored = db.payments.find((p) => p.id === r.payment.id)!;
    expect(stored.createdBy).toBe(A);
    expect(stored.idempotencyKey).toEqual(expect.any(String));
    expect(dbOrder(order.id)).toMatchObject({ status: 'Pending_Payment', paymentStatus: 'Unpaid' }); // chỉ IPN mới chốt đơn
  });

  it('payment_url giả: tuyệt đối, khác nhau theo VNPay/Momo, mang paymentId + gateway + returnUrl', async () => {
    const o1 = await placeOnlineOrder(A);
    const vnpay = await paymentApi.createPayment(payInput(o1, { paymentMethod: 'VNPay' }), { idempotencyKey: key() });
    const o2 = await placeOnlineOrder(A);
    const momo = await paymentApi.createPayment(payInput(o2, { paymentMethod: 'Momo' }), { idempotencyKey: key() });

    const v = new URL(vnpay.redirectUrl!);
    expect(v.origin).toBe('http://localhost:5173'); // cùng origin với return_url → dev server của app mở được
    expect(v.pathname).toBe(`/payment/${o1.id}`);
    expect(v.searchParams.get('paymentId')).toBe(String(vnpay.payment.id));
    expect(v.searchParams.get('gateway')).toBe('vnpay');
    expect(v.searchParams.get('returnUrl')).toBe(returnUrlOf(o1)); // mã hóa/giải mã không làm mất return_url

    const m = new URL(momo.redirectUrl!);
    expect(m.searchParams.get('gateway')).toBe('momo');
    expect(m.searchParams.get('paymentId')).toBe(String(momo.payment.id));
    expect(vnpay.redirectUrl).not.toBe(momo.redirectUrl);
  });

  it('lỗi dùng envelope lỗi và ném ApiError (status/code/traceId)', async () => {
    const order = await placeOnlineOrder(A);
    const w = await raw('/payments', {
      method: 'POST', headers: { 'Idempotency-Key': key() },
      body: { branch_id: 1, payment_method: 'COD', return_url: returnUrlOf(order), allocations: [{ order_id: order.id, allocated_amount: order.finalAmount }] },
    });
    expect(w.status).toBe(400);
    expect(w.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(typeof w.body.trace_id).toBe('string');

    const err = (await paymentApi.createPayment(payInput(order, { paymentMethod: 'Cash' }), { idempotencyKey: key() }).catch((e: unknown) => e)) as ApiError;
    expect(isApiError(err)).toBe(true);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(err.traceId).toEqual(expect.any(String));
  });

  it('kiểm tra đầu vào + nghiệp vụ, không ghi gì khi từ chối', async () => {
    const order = await placeOnlineOrder(A);
    const send = (body: unknown, headers: Record<string, string> = { 'Idempotency-Key': key() }) => raw('/payments', { method: 'POST', headers, body });
    const valid = { branch_id: 1, payment_method: 'VNPay', return_url: returnUrlOf(order), allocations: [{ order_id: order.id, allocated_amount: order.finalAmount }] };

    expect(errorOf(await send(valid, {})).code).toBe('VALIDATION_ERROR'); // thiếu Idempotency-Key
    expect(errorOf(await send({ ...valid, return_url: 'khong-phai-url' })).code).toBe('VALIDATION_ERROR');
    expect(errorOf(await send({ ...valid, allocations: [] })).code).toBe('VALIDATION_ERROR');
    expect(errorOf(await send({ ...valid, branch_id: 999 })).code).toBe('NOT_FOUND');

    // số tiền do server quyết định: lệch → 422
    const wrongAmount = await send({ ...valid, allocations: [{ order_id: order.id, allocated_amount: order.finalAmount - 1 }] });
    expect([wrongAmount.status, errorOf(wrongAmount).code]).toEqual([422, 'BUSINESS_RULE_VIOLATION']);

    // đơn COD (Pending, không chờ cổng) không thanh toán qua /payments
    const cod = await placeOnlineOrder(A, null);
    expect(cod.status).toBe('Pending');
    await expectApiError(paymentApi.createPayment(payInput(cod), { idempotencyKey: key() }), 409, 'ORDER_NOT_PAYABLE');

    // đơn Pending_Payment đã quá hạn
    dbOrder(order.id).expiresAt = nowNaive(-1_000);
    await expectApiError(paymentApi.createPayment(payInput(order), { idempotencyKey: key() }), 409, 'ORDER_NOT_PAYABLE');

    expect(db.payments).toHaveLength(0);
  });

  it('xác thực: thiếu token → 401; nhân viên → 403', async () => {
    const order = await placeOnlineOrder(A);
    as(null);
    await expectApiError(paymentApi.createPayment(payInput(order), { idempotencyKey: key() }), 401, 'UNAUTHORIZED');
    as(STAFF);
    await expectApiError(paymentApi.createPayment(payInput(order), { idempotencyKey: key() }), 403, 'FORBIDDEN');
    expect(db.payments).toHaveLength(0);
  });

  it('Idempotency-Key: cùng key → trả lại đúng giao dịch (200); khác đơn → 409; key mới cho đơn đang chờ → dùng lại', async () => {
    const order = await placeOnlineOrder(A);
    const first = await paymentApi.createPayment(payInput(order), { idempotencyKey: 'idem-fixed' });
    const again = await paymentApi.createPayment(payInput(order), { idempotencyKey: 'idem-fixed' });
    expect(again.payment.id).toBe(first.payment.id);
    expect(again.redirectUrl).toBe(first.redirectUrl);
    expect(db.payments).toHaveLength(1);

    const other = await placeOnlineOrder(A);
    await expectApiError(paymentApi.createPayment(payInput(other), { idempotencyKey: 'idem-fixed' }), 409, 'IDEMPOTENCY_KEY_REUSED');

    const newKey = await paymentApi.createPayment(payInput(order), { idempotencyKey: key() });
    expect(newKey.payment.id).toBe(first.payment.id); // bấm lặp không tạo thêm giao dịch Pending
    expect(db.payments).toHaveLength(1);
  });

  it('đơn của user khác → 404 như không tồn tại (không tạo giao dịch)', async () => {
    const orderOfB = await placeOnlineOrder(B);
    as(A);
    await expectApiError(paymentApi.createPayment(payInput(orderOfB), { idempotencyKey: key() }), 404, 'ORDER_NOT_FOUND');
    expect(db.payments).toHaveLength(0);
  });
});

describe('GET /payments/{id}', () => {
  it('trả { payment, allocations } đã lồng; Pending, không có payment_url; client map đúng', async () => {
    const order = await placeOnlineOrder(A);
    const created = await paymentApi.createPayment(payInput(order), { idempotencyKey: key() });

    const w = await raw(`/payments/${created.payment.id}`);
    expect(w.status).toBe(200);
    expect(w.body).toMatchObject({ success: true });
    expect(data(w).payment).toMatchObject({ id: created.payment.id, status: 'Pending', payment_method: 'VNPay', amount: order.finalAmount.toFixed(2) });
    expect(data(w).allocations).toEqual([expect.objectContaining({ order_id: order.id })]);
    expect(data(w)).not.toHaveProperty('payment_url');

    const r = await paymentApi.getPaymentById(created.payment.id);
    expect(r.payment).toMatchObject({ id: created.payment.id, status: 'Pending', amount: order.finalAmount });
    expect(r.allocations).toHaveLength(1);
    expect(r.redirectUrl).toBeNull();
  });

  it('id không tồn tại / không hợp lệ → 404 PAYMENT_NOT_FOUND', async () => {
    await expectApiError(paymentApi.getPaymentById(9_999), 404, 'PAYMENT_NOT_FOUND');
    expect(errorOf(await raw('/payments/abc')).code).toBe('PAYMENT_NOT_FOUND');
  });

  it('User A không đọc được payment của User B (và ngược lại); chưa đăng nhập → 401; nhân viên đọc được', async () => {
    const orderA = await placeOnlineOrder(A);
    const payA = await paymentApi.createPayment(payInput(orderA), { idempotencyKey: key() });
    const orderB = await placeOnlineOrder(B);
    const payB = await paymentApi.createPayment(payInput(orderB), { idempotencyKey: key() });

    as(B);
    await expectApiError(paymentApi.getPaymentById(payA.payment.id), 404, 'PAYMENT_NOT_FOUND');
    expect((await paymentApi.getPaymentById(payB.payment.id)).payment.id).toBe(payB.payment.id);

    as(A);
    await expectApiError(paymentApi.getPaymentById(payB.payment.id), 404, 'PAYMENT_NOT_FOUND');
    expect((await paymentApi.getPaymentById(payA.payment.id)).payment.id).toBe(payA.payment.id);

    as(null);
    await expectApiError(paymentApi.getPaymentById(payA.payment.id), 401, 'UNAUTHORIZED');

    as(STAFF);
    expect((await paymentApi.getPaymentById(payA.payment.id)).payment.id).toBe(payA.payment.id);
  });
});

describe('Trạng thái giao dịch qua IPN giả có sẵn (POST /payment/payments/:id/simulate)', () => {
  async function pending() {
    const order = await placeOnlineOrder(A);
    const created = await paymentApi.createPayment(payInput(order), { idempotencyKey: key() });
    return { order, id: created.payment.id };
  }
  const simulate = (id: number, result: string) => raw(`/payment/payments/${id}/simulate`, { method: 'POST', body: { result } });

  it('success → Success + paid_at; đơn Paid và chuyển Pending_Payment → Pending; polling GET thấy Success', async () => {
    const { order, id } = await pending();
    await paymentApi.simulatePayment(id, { result: 'success' });

    const r = await paymentApi.getPaymentById(id);
    expect(r.payment.status).toBe('Success');
    expect(r.payment.paidAt).toEqual(expect.any(String));
    expect(r.payment.transactionId).toEqual(expect.stringMatching(/^MOCK-VNPAY-/));
    expect(r.redirectUrl).toBeNull();
    expect(dbOrder(order.id)).toMatchObject({ status: 'Pending', paymentStatus: 'Paid', paidOnline: true, expiresAt: null });
    expect(dbOrder(order.id).statusHistory.at(-1)).toMatchObject({ fromStatus: 'Pending_Payment', status: 'Pending' });
    expect(db.invoices).toHaveLength(1);

    // replay cùng kết quả: 200, không thêm hóa đơn/lịch sử; khác kết quả: 409
    expect((await simulate(id, 'success')).status).toBe(200);
    expect(db.invoices).toHaveLength(1);
    expect(dbOrder(order.id).statusHistory.filter((h) => h.status === 'Pending')).toHaveLength(1); // replay không ghi thêm lịch sử
    expect(legacyCode(await simulate(id, 'failed'))).toBe('PAYMENT_ALREADY_SETTLED');

    // đã Success thì POST lại cho đơn đó bị chặn
    await expectApiError(paymentApi.createPayment(payInput(order), { idempotencyKey: key() }), 409, 'ORDER_ALREADY_PAID');
  });

  it('failed → Failed; đơn vẫn Pending_Payment/Unpaid; tạo lại được giao dịch mới', async () => {
    const { order, id } = await pending();
    await paymentApi.simulatePayment(id, { result: 'failed' });

    expect((await paymentApi.getPaymentById(id)).payment.status).toBe('Failed');
    expect(dbOrder(order.id)).toMatchObject({ status: 'Pending_Payment', paymentStatus: 'Unpaid' });
    expect(db.invoices).toHaveLength(0);

    const retry = await paymentApi.createPayment(payInput(order), { idempotencyKey: key() });
    expect(retry.payment.id).not.toBe(id);
    expect(retry.payment.status).toBe('Pending');
  });

  it('cancelled (chỉ có ở mock) → Cancelled; đơn không đổi', async () => {
    const { order, id } = await pending();
    expect((await simulate(id, 'cancelled')).status).toBe(200);

    expect((await paymentApi.getPaymentById(id)).payment.status).toBe('Cancelled');
    expect(dbOrder(order.id)).toMatchObject({ status: 'Pending_Payment', paymentStatus: 'Unpaid' });
    expect((await simulate(id, 'cancelled')).status).toBe(200); // replay
    expect(legacyCode(await simulate(id, 'success'))).toBe('PAYMENT_ALREADY_SETTLED');
  });

  it('expired: bằng IPN giả và bằng thời gian (hết hạn tính lúc đọc)', async () => {
    const a = await pending();
    await paymentApi.simulatePayment(a.id, { result: 'expired' });
    expect((await paymentApi.getPaymentById(a.id)).payment.status).toBe('Expired');

    const b = await pending();
    db.payments.find((p) => p.id === b.id)!.expiresAt = nowNaive(-1_000);
    expect((await paymentApi.getPaymentById(b.id)).payment.status).toBe('Expired');
    expect(dbOrder(b.order.id).paymentStatus).toBe('Unpaid');
  });

  it('IPN giả cũng không cho user khác chốt giao dịch của mình', async () => {
    const { id } = await pending();
    as(B);
    expect((await simulate(id, 'success')).status).toBe(404);
    as(A);
    expect((await paymentApi.getPaymentById(id)).payment.status).toBe('Pending');
  });
});
