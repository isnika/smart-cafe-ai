import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { OrderDetail } from '@/shared/types';
import { db, resetDb } from '../db';
import { seedDemoOrders } from '../seed';
import { mockConfig, url } from '../utils';
import { MOCK_PASSWORD, resetAuthMock, revokeAllTokens } from './identity';
import { handlers } from './index';

const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(() => {
  resetDb();
  resetAuthMock();
  seedDemoOrders();
  mockConfig.latencyMs = 0;
  mockConfig.enforceAuth = false;
});
afterEach(() => server.resetHandlers());

interface PageBody { items: OrderDetail[]; total: number }
interface ErrBody { message: string; code: string }

const A = { id: 'u-customer', email: 'customer@smartcafe.vn' };
const B = { id: 'u-customer2', email: 'customer2@smartcafe.vn' };

async function tokenOf(email: string): Promise<string> {
  const res = await fetch(url('/identity/auth/login'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: email, password: MOCK_PASSWORD }),
  });
  return ((await res.json()) as { accessToken: string }).accessToken;
}

async function call<T>(path: string, token?: string, init: RequestInit = {}) {
  const res = await fetch(url(path), {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return { status: res.status, body: (await res.json()) as T };
}

const ownedBy = (userId: string) => db.orders.filter((o) => o.userId === userId);
const newOnlineOrder = (extra: Record<string, unknown> = {}) => ({
  orderSource: 'Online', fulfillmentType: 'Pickup', branchId: 1,
  lines: [{ variantId: 12, quantity: 1, options: [{ optionId: 101 }, { optionId: 104 }] }], ...extra,
});

describe('GET /orders-svc/orders — cô lập theo người dùng', () => {
  it('dữ liệu seed có đơn của cả hai khách', () => {
    expect(ownedBy(A.id).length).toBeGreaterThan(0);
    expect(ownedBy(B.id).length).toBeGreaterThan(0);
  });

  it('khách A chỉ nhận đơn của A', async () => {
    const { status, body } = await call<PageBody>('/orders-svc/orders?size=100', await tokenOf(A.email));
    expect(status).toBe(200);
    expect(body.items.map((o) => o.id).sort()).toEqual(ownedBy(A.id).map((o) => o.id).sort());
    expect(body.total).toBe(ownedBy(A.id).length);
    expect(body.items.every((o) => o.userId === A.id)).toBe(true);
  });

  it('khách B chỉ nhận đơn của B', async () => {
    const { body } = await call<PageBody>('/orders-svc/orders?size=100', await tokenOf(B.email));
    expect(body.items.map((o) => o.id).sort()).toEqual(ownedBy(B.id).map((o) => o.id).sort());
    expect(body.items.every((o) => o.userId === B.id)).toBe(true);
  });

  it('không lấy được đơn của người khác bằng cách đổi userId trên request → 403, không rò dữ liệu', async () => {
    const tokenA = await tokenOf(A.email);
    const res = await call<ErrBody>(`/orders-svc/orders?userId=${B.id}`, tokenA);
    expect([res.status, res.body.code]).toEqual([403, 'FORBIDDEN']);
    expect(JSON.stringify(res.body)).not.toContain(B.id);

    // userId trùng chính mình thì vô hại
    const own = await call<PageBody>(`/orders-svc/orders?userId=${A.id}&size=100`, tokenA);
    expect(own.status).toBe(200);
    expect(own.body.total).toBe(ownedBy(A.id).length);
  });

  it('bộ lọc status vẫn áp dụng trong phạm vi đơn của chính khách', async () => {
    const { body } = await call<PageBody>('/orders-svc/orders?status=Completed,Cancelled&size=100', await tokenOf(A.email));
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((o) => o.userId === A.id && ['Completed', 'Cancelled'].includes(o.status))).toBe(true);
  });

  it('khách chưa có đơn nào → danh sách rỗng (không phải toàn bộ đơn)', async () => {
    const tokenB = await tokenOf(B.email);
    db.orders.splice(0, db.orders.length, ...db.orders.filter((o) => o.userId !== B.id));
    const { body } = await call<PageBody>('/orders-svc/orders', tokenB);
    expect(body.total).toBe(0);
    expect(db.orders.length).toBeGreaterThan(0);
  });

  it('nhân viên có token hợp lệ vẫn thấy đơn của mọi người và được lọc theo userId', async () => {
    const staff = await tokenOf('staff@smartcafe.vn');
    const all = await call<PageBody>('/orders-svc/orders?size=100', staff);
    expect(all.body.total).toBe(db.orders.length);
    const onlyB = await call<PageBody>(`/orders-svc/orders?userId=${B.id}&size=100`, staff);
    expect(onlyB.body.items.map((o) => o.id).sort()).toEqual(ownedBy(B.id).map((o) => o.id).sort());
  });

  it('không có thông tin xác thực: bị 401 khi bật enforceAuth hoặc khi đòi lọc theo userId', async () => {
    mockConfig.enforceAuth = true;
    expect((await call<ErrBody>('/orders-svc/orders')).status).toBe(401);
    mockConfig.enforceAuth = false;
    const res = await call<ErrBody>(`/orders-svc/orders?userId=${A.id}`);
    expect([res.status, res.body.code]).toEqual([401, 'UNAUTHORIZED']);
  });

  it('token đã bị thu hồi → 401 (không rơi về chế độ ẩn danh xem toàn bộ đơn)', async () => {
    const tokenA = await tokenOf(A.email);
    revokeAllTokens();
    const res = await call<ErrBody>('/orders-svc/orders', tokenA);
    expect([res.status, res.body.code]).toEqual([401, 'UNAUTHORIZED']);
  });
});

describe('GET /orders-svc/orders/:id — chi tiết', () => {
  it('khách xem được đơn của mình, đơn của người khác trả 404', async () => {
    const tokenA = await tokenOf(A.email);
    const mine = ownedBy(A.id)[0]!;
    const theirs = ownedBy(B.id)[0]!;
    expect((await call<OrderDetail>(`/orders-svc/orders/${mine.id}`, tokenA)).status).toBe(200);
    const res = await call<ErrBody>(`/orders-svc/orders/${theirs.id}`, tokenA);
    expect([res.status, res.body.code]).toEqual([404, 'ORDER_NOT_FOUND']);
  });
});

describe('POST /orders-svc/orders — đơn gắn đúng chủ', () => {
  it('đơn Online của khách luôn gắn với chủ token và chỉ hiện trong danh sách của họ', async () => {
    const tokenA = await tokenOf(A.email);
    const tokenB = await tokenOf(B.email);
    const created = await call<OrderDetail>('/orders-svc/orders', tokenA, { method: 'POST', body: JSON.stringify(newOnlineOrder({ userId: A.id })) });
    expect([created.status, created.body.userId]).toEqual([201, A.id]);

    const listA = await call<PageBody>('/orders-svc/orders?size=100', tokenA);
    const listB = await call<PageBody>('/orders-svc/orders?size=100', tokenB);
    expect(listA.body.items.some((o) => o.id === created.body.id)).toBe(true);
    expect(listB.body.items.some((o) => o.id === created.body.id)).toBe(false);
  });

  it('không thể đặt đơn mang tên tài khoản khác → 403 và không tạo đơn', async () => {
    const before = db.orders.length;
    const res = await call<ErrBody>('/orders-svc/orders', await tokenOf(A.email), { method: 'POST', body: JSON.stringify(newOnlineOrder({ userId: B.id })) });
    expect([res.status, res.body.code]).toEqual([403, 'FORBIDDEN']);
    expect(db.orders).toHaveLength(before);
  });

  it('khách có token nhưng thiếu userId trong body vẫn được gắn đúng chủ', async () => {
    const res = await call<OrderDetail>('/orders-svc/orders', await tokenOf(B.email), { method: 'POST', body: JSON.stringify(newOnlineOrder()) });
    expect([res.status, res.body.userId]).toEqual([201, B.id]);
  });
});
