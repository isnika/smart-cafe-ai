import { http as mswHttp, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, configureHttp } from './http';
import { createPayment, getPaymentById, toPayResult } from './payment';

// Chạy với VITE_API_BASE_URL=http://localhost/api (vite.config.ts → test.env)
const U = (p: string) => `http://localhost/api${p}`;
const server = setupServer();
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => configureHttp({ getToken: () => 'tok-1', onUnauthorized: undefined, refresh: undefined }));

const envelope = (data: unknown, status = 200) => HttpResponse.json({ success: true, data, meta: null, trace_id: 't-1' }, { status });
const errorEnvelope = (status: number, code: string, message: string) =>
  HttpResponse.json({ success: false, error: { code, message }, trace_id: 't-err' }, { status });

const wirePayment = {
  id: 9,
  branch_id: 1,
  payment_method: 'VNPay',
  amount: '85000.00',
  status: 'Pending',
  expires_at: '2026-11-05T10:15:00Z',
  created_at: '2026-11-05T10:00:00Z',
  updated_at: '2026-11-05T10:00:00Z',
  payment_url: 'https://pay.example/vnpay?x=1',
  allocations: [{ id: 3, order_id: 42, allocated_amount: '85000.00' }],
};

const input = {
  branchId: 1,
  paymentMethod: 'VNPay' as const,
  allocations: [{ orderId: 42, allocatedAmount: 85_000 }],
  returnUrl: 'http://localhost:5173/payment/42/return',
};

describe('createPayment (POST /payments)', () => {
  it('đúng path, body snake_case, Idempotency-Key + Bearer; map response phẳng', async () => {
    let seen: { method: string; path: string; headers: Headers; body: unknown } | null = null;
    server.use(
      mswHttp.post(U('/payments'), async ({ request }) => {
        seen = { method: request.method, path: new URL(request.url).pathname, headers: request.headers, body: await request.json() };
        return envelope(wirePayment, 201);
      }),
    );

    const r = await createPayment(input, { idempotencyKey: 'idem-1' });

    expect(seen).not.toBeNull();
    const s = seen as unknown as { method: string; path: string; headers: Headers; body: unknown };
    expect(s.method).toBe('POST');
    expect(s.path).toBe('/api/payments');
    expect(s.headers.get('Idempotency-Key')).toBe('idem-1');
    expect(s.headers.get('Authorization')).toBe('Bearer tok-1');
    expect(s.body).toEqual({
      branch_id: 1,
      payment_method: 'VNPay',
      allocations: [{ order_id: 42, allocated_amount: 85000 }],
      return_url: 'http://localhost:5173/payment/42/return',
    });
    expect(r.redirectUrl).toBe('https://pay.example/vnpay?x=1'); // payment_url → redirectUrl
    expect(r.payment).toMatchObject({ id: 9, paymentMethod: 'VNPay', amount: 85_000, status: 'Pending', refundedAmount: 0 });
    expect(r.allocations).toEqual([expect.objectContaining({ paymentId: 9, orderId: 42, allocatedAmount: 85_000 })]);
  });

  it('lỗi 409 được ném dưới dạng ApiError (status/code/message/traceId)', async () => {
    server.use(mswHttp.post(U('/payments'), () => errorEnvelope(409, 'ORDER_ALREADY_PAID', 'Đơn đã thanh toán')));
    const e = await createPayment(input, { idempotencyKey: 'idem-2' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 409, code: 'ORDER_ALREADY_PAID', message: 'Đơn đã thanh toán', traceId: 't-err' });
  });
});

describe('getPaymentById (GET /payments/{id})', () => {
  it('đúng path + Bearer; map response lồng {payment, allocations, payment_url}', async () => {
    let seen: { method: string; path: string; search: string; auth: string | null } | null = null;
    server.use(
      mswHttp.get(U('/payments/9'), ({ request }) => {
        const u = new URL(request.url);
        seen = { method: request.method, path: u.pathname, search: u.search, auth: request.headers.get('Authorization') };
        return envelope({
          payment: { ...wirePayment, status: 'Success', paid_at: '2026-11-05T10:02:00Z', payment_url: undefined, allocations: undefined },
          allocations: wirePayment.allocations,
        });
      }),
    );

    const r = await getPaymentById(9);

    expect(seen).toEqual({ method: 'GET', path: '/api/payments/9', search: '', auth: 'Bearer tok-1' });
    expect(r.payment).toMatchObject({ id: 9, status: 'Success' });
    expect(r.payment.paidAt).toBe('2026-11-05T10:02:00Z');
    expect(r.redirectUrl).toBeNull();
    expect(r.allocations).toHaveLength(1);
  });

  it('lỗi 404 được ném dưới dạng ApiError', async () => {
    server.use(mswHttp.get(U('/payments/404'), () => errorEnvelope(404, 'PAYMENT_NOT_FOUND', 'Không tìm thấy giao dịch')));
    const e = await getPaymentById(404).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 404, code: 'PAYMENT_NOT_FOUND' });
  });
});

describe('toPayResult', () => {
  it('chịu được dữ liệu thiếu/lệch nhẹ: thiếu allocations → [], nhận redirectUrl, số dạng chuỗi', () => {
    const r = toPayResult({ id: '7', branchId: 1, method: 'Momo', totalAmount: '1000', status: 'Pending', redirectUrl: 'https://m/x' });
    expect(r.allocations).toEqual([]);
    expect(r.redirectUrl).toBe('https://m/x');
    expect(r.payment).toMatchObject({ id: 7, paymentMethod: 'Momo', amount: 1000 });
  });
});
