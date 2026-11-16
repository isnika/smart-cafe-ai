import { http as mswHttp, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, configureHttp } from './http';
import { getMyOrder, getOrderHistory, listMyOrders } from './order-me';
import { INVALID_RESPONSE_CODE, VALIDATION_ERROR_CODE } from './order-me.types';

// Chạy với VITE_API_BASE_URL=http://localhost/api (vite.config.ts → test.env)
const U = (p: string) => `http://localhost/api${p}`;
const server = setupServer();
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => configureHttp({ getToken: () => 'tok-1', onUnauthorized: undefined, refresh: undefined }));

const ok = (data: unknown, meta: unknown = null) => HttpResponse.json({ success: true, data, meta, trace_id: 't-1' });
const fail = (status: number, code: string, message: string) =>
  HttpResponse.json({ success: false, error: { code, message }, trace_id: 't-err' }, { status });

const wireSummary = {
  id: 42,
  order_code: 'ORD-0042',
  branch_id: 1,
  order_source: 'Online',
  fulfillment_type: 'Delivery',
  status: 'Pending_Payment',
  payment_status: 'Unpaid',
  final_amount: '85000.00',
  delivery_fee: '15000.00',
  created_at: '2026-11-05 10:00:00', // naive → UTC
  expires_at: '2026-11-05T10:15:00',
  version: 1,
};

const wireDetail = {
  ...wireSummary,
  user_id: 'u-1',
  sub_total: '70000.00',
  item_discount_amount: '0',
  voucher_discount_amount: '0',
  vat_amount: '6296',
  updated_at: '2026-11-05T10:00:00Z',
  items: [
    {
      id: 7,
      product_id: 3,
      variant_id: 5,
      product_name: 'Cà phê sữa',
      variant_name: 'M',
      quantity: 2,
      unit_price: '30000.00',
      options_unit_total: '5000.00',
      line_total: '70000.00',
      options: [{ id: 1, option_id: 9, option_name: 'Thêm shot', quantity: 1, unit_price: '5000.00' }],
    },
  ],
  status_history: [
    { id: 2, order_id: 42, from_status: 'Pending_Payment', status: 'Pending', changed_by: null, note: null, created_at: '2026-11-05T10:05:00Z' },
    { id: 1, order_id: 42, from_status: null, status: 'Pending_Payment', changed_by: 'u-1', note: null, created_at: '2026-11-05 10:00:00' },
  ],
};

describe('listMyOrders (GET /orders/me)', () => {
  it('gửi Bearer, query snake_case, không header guest; trả items + meta', async () => {
    let seen: { path: string; search: URLSearchParams; headers: Headers } | null = null;
    server.use(
      mswHttp.get(U('/orders/me'), ({ request }) => {
        const url = new URL(request.url);
        seen = { path: url.pathname, search: url.searchParams, headers: request.headers };
        return ok([wireSummary], { page: 2, size: 10, total: 21 });
      }),
    );

    const r = await listMyOrders({
      status: 'Pending',
      paymentStatus: 'Paid',
      from: '2026-11-01T00:00:00Z',
      to: '2026-11-07T00:00:00Z',
      page: 2,
      size: 10,
      sort: 'created_at,desc',
    });

    const s = seen as unknown as { path: string; search: URLSearchParams; headers: Headers };
    expect(s.path).toBe('/api/orders/me');
    expect(Object.fromEntries(s.search)).toEqual({
      status: 'Pending',
      payment_status: 'Paid',
      from: '2026-11-01T00:00:00Z',
      to: '2026-11-07T00:00:00Z',
      page: '2',
      size: '10',
      sort: 'created_at,desc',
    });
    expect(s.headers.get('Authorization')).toBe('Bearer tok-1');
    expect(s.headers.get('X-Client-Key')).toBeNull();
    expect(s.headers.get('X-Table-Session-Code')).toBeNull();

    expect(r.meta).toEqual({ page: 2, size: 10, total: 21, totalPages: 3 });
    expect(r.items).toHaveLength(1);
    const o = r.items[0]!;
    expect(o.status).toBe('Pending_Payment');
    expect(o.paymentStatus).toBe('Unpaid');
    expect(o.finalAmount).toBe(85000);
    expect(o.deliveryFee).toBe(15000);
    expect(o.subTotal).toBeNull(); // server không trả → null, không bịa 0
    expect(o.createdAt).toBe('2026-11-05T10:00:00Z'); // naive → UTC
    expect(o.expiresAt).toBe('2026-11-05T10:15:00Z');
  });

  it('không gửi query khi không có tham số', async () => {
    let search = 'unset';
    server.use(
      mswHttp.get(U('/orders/me'), ({ request }) => {
        search = new URL(request.url).search;
        return ok([], { page: 1, size: 20, total: 0 });
      }),
    );
    const r = await listMyOrders();
    expect(search).toBe('');
    expect(r.items).toEqual([]);
    expect(r.meta).toEqual({ page: 1, size: 20, total: 0, totalPages: 0 });
  });

  it('thiếu meta → suy từ tham số + số phần tử', async () => {
    server.use(mswHttp.get(U('/orders/me'), () => ok([wireSummary])));
    const r = await listMyOrders({ page: 1, size: 20 });
    expect(r.meta).toEqual({ page: 1, size: 20, total: 1, totalPages: 1 });
  });

  it('401 → ApiError giữ status/code/traceId', async () => {
    server.use(mswHttp.get(U('/orders/me'), () => fail(401, 'UNAUTHORIZED', 'Cần đăng nhập')));
    const e = (await listMyOrders().catch((x: unknown) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(401);
    expect(e.is('UNAUTHORIZED')).toBe(true);
    expect(e.traceId).toBe('t-err');
  });

  it('enum lạ (status / payment_status) → INVALID_RESPONSE, không đoán', async () => {
    server.use(mswHttp.get(U('/orders/me'), () => ok([{ ...wireSummary, status: 'Serving' }])));
    const e1 = (await listMyOrders().catch((x: unknown) => x)) as ApiError;
    expect(e1.code).toBe(INVALID_RESPONSE_CODE);

    server.use(mswHttp.get(U('/orders/me'), () => ok([{ ...wireSummary, payment_status: 'Pending' }])));
    const e2 = (await listMyOrders().catch((x: unknown) => x)) as ApiError;
    expect(e2.code).toBe(INVALID_RESPONSE_CODE);
  });

  it('data không phải mảng → INVALID_RESPONSE', async () => {
    server.use(mswHttp.get(U('/orders/me'), () => ok({ items: [] })));
    const e = (await listMyOrders().catch((x: unknown) => x)) as ApiError;
    expect(e.code).toBe(INVALID_RESPONSE_CODE);
  });

  it.each([{ page: 0 }, { page: 1.5 }, { size: 0 }, { size: 101 }])('tham số sai %j → VALIDATION_ERROR, không gọi mạng', async (p) => {
    const e = (await listMyOrders(p).catch((x: unknown) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(400);
    expect(e.code).toBe(VALIDATION_ERROR_CODE);
  });
});

describe('getMyOrder (GET /orders/me/{id})', () => {
  it('map order + items + options + status_history (cũ → mới)', async () => {
    let path = '';
    server.use(
      mswHttp.get(U('/orders/me/42'), ({ request }) => {
        path = new URL(request.url).pathname;
        return ok(wireDetail);
      }),
    );

    const o = await getMyOrder(42);

    expect(path).toBe('/api/orders/me/42');
    expect(o.id).toBe(42);
    expect(o.orderCode).toBe('ORD-0042');
    expect(o.status).toBe('Pending_Payment');
    expect(o.paymentStatus).toBe('Unpaid');
    expect(o.finalAmount).toBe(85000);
    expect(o.vatAmount).toBe(6296);
    expect(o.version).toBe(1);
    expect(o.createdAt).toBe('2026-11-05T10:00:00Z');
    expect(o.items).toHaveLength(1);
    expect(o.items[0]!.unitPrice).toBe(30000);
    expect(o.items[0]!.orderId).toBe(42); // thiếu → lấy id đơn
    expect(o.items[0]!.options[0]).toMatchObject({ optionId: 9, orderItemId: 7, unitPrice: 5000 });
    expect(o.statusHistory.map((h) => h.id)).toEqual([1, 2]);
    expect(o.statusHistory[0]).toMatchObject({ fromStatus: null, status: 'Pending_Payment', changedBy: 'u-1', createdAt: '2026-11-05T10:00:00Z' });
    expect(o.statusHistory[1]).toMatchObject({ fromStatus: 'Pending_Payment', status: 'Pending', changedBy: null });
  });

  it('nhận khoá `history` thay cho `status_history`; thiếu cả hai → []', async () => {
    const { status_history, ...rest } = wireDetail;
    server.use(mswHttp.get(U('/orders/me/42'), () => ok({ ...rest, history: status_history })));
    expect((await getMyOrder(42)).statusHistory).toHaveLength(2);

    server.use(mswHttp.get(U('/orders/me/42'), () => ok(rest)));
    expect((await getMyOrder(42)).statusHistory).toEqual([]);
  });

  it('404 / 403 giữ nguyên ApiError', async () => {
    server.use(mswHttp.get(U('/orders/me/99'), () => fail(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn')));
    const e = (await getMyOrder(99).catch((x: unknown) => x)) as ApiError;
    expect(e.status).toBe(404);
    expect(e.code).toBe('ORDER_NOT_FOUND');

    server.use(mswHttp.get(U('/orders/me/98'), () => fail(403, 'FORBIDDEN', 'Không đủ quyền')));
    expect(((await getMyOrder(98).catch((x: unknown) => x)) as ApiError).status).toBe(403);
  });

  it('thiếu field bắt buộc (version) → INVALID_RESPONSE', async () => {
    const { version, ...rest } = wireDetail;
    void version;
    server.use(mswHttp.get(U('/orders/me/42'), () => ok(rest)));
    const e = (await getMyOrder(42).catch((x: unknown) => x)) as ApiError;
    expect(e.code).toBe(INVALID_RESPONSE_CODE);
  });

  it.each([0, -1, 1.5, Number.NaN])('id %s không hợp lệ → VALIDATION_ERROR', async (id) => {
    const e = (await getMyOrder(id).catch((x: unknown) => x)) as ApiError;
    expect(e.code).toBe(VALIDATION_ERROR_CODE);
  });
});

describe('getOrderHistory (GET /orders/{id}/history)', () => {
  it('map mảng, from_status null ở dòng đầu, sắp cũ → mới, UTC', async () => {
    let path = '';
    server.use(
      mswHttp.get(U('/orders/42/history'), ({ request }) => {
        path = new URL(request.url).pathname;
        return ok([
          { id: 3, order_id: 42, from_status: 'Pending', status: 'Cancelled', changed_by: 'u-1', note: 'Đổi ý', created_at: '2026-11-05 10:30:00' },
          { id: 1, order_id: 42, from_status: null, status: 'Pending_Payment', changed_by: 'u-1', note: null, created_at: '2026-11-05T10:00:00Z' },
          { id: 2, order_id: 42, from_status: 'Pending_Payment', status: 'Pending', changed_by: null, note: null, created_at: '2026-11-05T10:05:00+00:00' },
        ]);
      }),
    );

    const h = await getOrderHistory(42);

    expect(path).toBe('/api/orders/42/history');
    expect(h.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(h[0]).toEqual({ id: 1, orderId: 42, fromStatus: null, status: 'Pending_Payment', changedBy: 'u-1', note: null, createdAt: '2026-11-05T10:00:00Z' });
    expect(h[2]).toMatchObject({ status: 'Cancelled', note: 'Đổi ý', createdAt: '2026-11-05T10:30:00Z' });
  });

  it('from_status lạ → INVALID_RESPONSE', async () => {
    server.use(
      mswHttp.get(U('/orders/42/history'), () =>
        ok([{ id: 1, order_id: 42, from_status: 'Serving', status: 'Pending', created_at: '2026-11-05T10:00:00Z' }]),
      ),
    );
    const e = (await getOrderHistory(42).catch((x: unknown) => x)) as ApiError;
    expect(e.code).toBe(INVALID_RESPONSE_CODE);
  });

  it('403/404 và id sai', async () => {
    server.use(mswHttp.get(U('/orders/7/history'), () => fail(404, 'ORDER_NOT_FOUND', 'x')));
    expect(((await getOrderHistory(7).catch((x: unknown) => x)) as ApiError).status).toBe(404);
    expect(((await getOrderHistory(0).catch((x: unknown) => x)) as ApiError).code).toBe(VALIDATION_ERROR_CODE);
  });
});
