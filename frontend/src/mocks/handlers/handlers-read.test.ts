import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { orderApi } from '@/shared/api';
import type { OrderDetail } from '@/shared/types';
import { db, resetDb } from '../db';
import { seedDemoOrders } from '../seed';
import { mockConfig, url } from '../utils';
import { MOCK_ACCOUNTS } from './identity';
import { handlers } from './index';

// Chạy với: VITE_API_BASE_URL=http://localhost/api vitest run src/mocks
const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(() => {
  resetDb();
  seedDemoOrders();
  mockConfig.latencyMs = 0;
  mockConfig.enforceAuth = false;
});
afterEach(() => server.resetHandlers());

// Cùng giả định với toPage() trong order-read.ts
interface PageBody { items: OrderDetail[]; total: number; page: number; size: number; totalPages: number }
interface ErrBody { message: string; code: string }

async function get<T>(path: string, token?: string) {
  const res = await fetch(url(path), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: (await res.json()) as T };
}
async function login(email: string, password: string) {
  const res = await fetch(url('/identity/auth/login'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe('GET /orders-svc/orders', () => {
  it('mặc định trả trang đầu, mới nhất lên đầu, tổng = số đơn seed', async () => {
    const { status, body } = await get<PageBody>('/orders-svc/orders');
    expect(status).toBe(200);
    expect(body.total).toBe(db.orders.length);
    const times = body.items.map((o) => o.createdAt);
    expect(times).toEqual([...times].sort().reverse());
  });

  it('seed có đúng 1 đơn Ready cho mỗi loại fulfillment', async () => {
    const { body } = await get<PageBody>('/orders-svc/orders?status=Ready&size=100');
    expect(body.items.map((o) => o.fulfillmentType).sort()).toEqual(['Delivery', 'Dine_In', 'Pickup']);
  });

  it('lọc nhiều status (dấu phẩy) và fulfillmentType', async () => {
    const multi = await get<PageBody>('/orders-svc/orders?status=Pending,Pending_Payment&size=100');
    expect(multi.body.items.map((o) => o.status).sort()).toEqual(['Pending', 'Pending', 'Pending_Payment']);
    const delivery = await get<PageBody>('/orders-svc/orders?fulfillmentType=Delivery&size=100');
    expect(delivery.body.items.every((o) => o.fulfillmentType === 'Delivery')).toBe(true);
    expect(delivery.body.total).toBe(4);
  });

  it('cashier=feed (cũ nhất trước, không có đơn kết thúc) và history (chỉ đơn kết thúc)', async () => {
    const feed = await get<PageBody>('/orders-svc/orders?cashier=feed&size=100');
    const history = await get<PageBody>('/orders-svc/orders?cashier=history&size=100');
    const terminal = ['Completed', 'Cancelled', 'Rejected'];
    expect(feed.body.items.some((o) => terminal.includes(o.status))).toBe(false);
    expect(history.body.items.every((o) => terminal.includes(o.status))).toBe(true);
    expect(feed.body.total + history.body.total).toBe(db.orders.length);
    const times = feed.body.items.map((o) => o.createdAt);
    expect(times).toEqual([...times].sort());
  });

  it('phân trang: các trang không trùng và phủ hết đơn', async () => {
    const pages = await Promise.all([1, 2, 3].map((p) => get<PageBody>(`/orders-svc/orders?size=5&page=${p}`)));
    expect(pages[0]!.body.totalPages).toBe(3);
    const ids = pages.flatMap((p) => p.body.items.map((o) => o.id));
    expect(new Set(ids).size).toBe(db.orders.length);
    expect(pages[2]!.body.items).toHaveLength(db.orders.length - 10);
  });

  it('tham số sai → 400 VALIDATION_ERROR', async () => {
    for (const q of ['status=Nope', 'page=0', 'size=1000', 'cashier=x', 'fulfillmentType=Teleport']) {
      const r = await get<ErrBody>(`/orders-svc/orders?${q}`);
      expect([r.status, r.body.code]).toEqual([400, 'VALIDATION_ERROR']);
    }
  });

  it('enforceAuth bật: thiếu token → 401, có token → 200', async () => {
    mockConfig.enforceAuth = true;
    expect((await get<ErrBody>('/orders-svc/orders')).status).toBe(401);
    expect((await get<PageBody>('/orders-svc/orders', 'any')).status).toBe(200);
  });
});

describe('GET /orders-svc/orders/:id', () => {
  it('200 với đúng đơn, 404 khi không có', async () => {
    const ok = await get<OrderDetail>('/orders-svc/orders/1');
    expect([ok.status, ok.body.id]).toEqual([200, 1]);
    const missing = await get<ErrBody>('/orders-svc/orders/9999');
    expect([missing.status, missing.body.code]).toEqual([404, 'ORDER_NOT_FOUND']);
  });

  it('đổi trạng thái bằng PATCH rồi GET thấy thay đổi (chạy trên ORDER_TRANSITIONS thật)', async () => {
    const list = await get<PageBody>('/orders-svc/orders?status=Ready&fulfillmentType=Dine_In');
    const order = list.body.items[0]!;
    await orderApi.changeOrderStatus(order.id, { to: 'Served', version: order.version });
    const after = await get<OrderDetail>(`/orders-svc/orders/${order.id}`);
    expect(after.body).toMatchObject({ status: 'Served', version: order.version + 1 });
    expect(after.body.statusHistory.at(-1)).toMatchObject({ fromStatus: 'Ready', status: 'Served' });
  });
});

describe('identity', () => {
  it.each(MOCK_ACCOUNTS.map((a) => [a.role, a] as const))('login %s → token dùng được cho /me', async (_role, a) => {
    const res = await login(a.email, a.password);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: a.email, role: a.role });
    expect(res.body.user.password).toBeUndefined();
    const me = await get<Record<string, unknown>>('/identity/users/me', res.body.accessToken);
    expect([me.status, me.body.email]).toEqual([200, a.email]);
  });

  it('sai mật khẩu → 401 INVALID_CREDENTIALS, thiếu field → 400', async () => {
    const bad = await login('cashier@smartcafe.vn', 'sai');
    expect([bad.status, bad.body.code]).toEqual([401, 'INVALID_CREDENTIALS']);
    expect((await login('', '')).status).toBe(400);
  });

  it('/me không token hoặc token rác → 401', async () => {
    expect((await get<ErrBody>('/identity/users/me')).status).toBe(401);
    expect((await get<ErrBody>('/identity/users/me', 'rac')).status).toBe(401);
  });
});