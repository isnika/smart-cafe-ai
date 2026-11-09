import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, configureHttp } from '@/shared/api/http';
import { getMyOrder, getOrderHistory, listMyOrders } from '@/shared/api/order-me';
import type { OrderDetail } from '@/shared/types';
import { db, resetDb } from '../db';
import { seedDemoOrders } from '../seed';
import { mockConfig, url } from '../utils';
import { mockAccessToken, resetAuthMock, revokeAllTokens } from './identity';
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

const A = 'u-customer';
const B = 'u-customer2';

interface Envelope<T> { success: boolean; data: T; meta: Record<string, unknown> | null; trace_id: string }
interface ErrEnvelope { success: false; error: { code: string; message: string }; trace_id: string }
interface WireSummary { id: number; order_code: string; order_source: string; fulfillment_type: string; status: string; payment_status: string; created_at: string; [k: string]: unknown }
interface WireHistory { id: number; order_id: number; from_status: string | null; status: string; changed_by: string | null; note: string | null; created_at: string }

async function get<T>(path: string, userId?: string) {
  const res = await fetch(url(path), { headers: userId ? { Authorization: `Bearer ${mockAccessToken(userId)}` } : {} });
  return { status: res.status, body: (await res.json()) as T };
}

const ownedBy = (userId: string) => db.orders.filter((o) => o.userId === userId);
const idsOf = (rows: { id: number }[]) => rows.map((r) => r.id);
const utc = (naive: string) => Date.parse(`${naive}Z`);
const orderWhere = (pred: (o: OrderDetail) => boolean): OrderDetail => {
  const found = db.orders.find(pred);
  if (!found) throw new Error('seed thiếu đơn mong muốn');
  return found;
};

describe('seed: Online và Dine-in tách bạch', () => {
  it('đơn Online có chủ; đơn QR/POS không thuộc khách nào', () => {
    expect(db.orders.filter((o) => o.orderSource === 'Online').every((o) => o.userId !== null && o.fulfillmentType !== 'Dine_In')).toBe(true);
    expect(db.orders.filter((o) => o.fulfillmentType === 'Dine_In').every((o) => o.userId === null && o.orderSource !== 'Online')).toBe(true);
    expect(ownedBy(A).length).toBeGreaterThanOrEqual(5);
    expect(ownedBy(B).length).toBeGreaterThan(0);
  });

  it('đơn Online vẫn hiện ở hàng đợi nhân viên (legacy /orders-svc/orders) cùng đơn Dine-in', async () => {
    const res = await get<{ items: OrderDetail[] }>('/orders-svc/orders?size=100', 'u-staff');
    expect(res.status).toBe(200);
    const queue = res.body.items;
    expect(queue.some((o) => o.orderSource === 'Online' && o.status === 'Pending_Payment')).toBe(true);
    expect(queue.some((o) => o.orderSource === 'Online' && o.fulfillmentType === 'Delivery')).toBe(true);
    expect(queue.some((o) => o.fulfillmentType === 'Dine_In')).toBe(true);
    expect(queue).toHaveLength(db.orders.length);
  });
});

describe('GET /orders/me — danh sách + phân trang', () => {
  it('trả envelope spec: data là mảng summary, meta {page,size,total}, trace_id', async () => {
    const r = await get<Envelope<WireSummary[]>>('/orders/me', A);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.trace_id).toMatch(/^mock-/);
    expect(Array.isArray(r.body.data)).toBe(true);
    expect(r.body.meta).toEqual({ page: 1, size: 20, total: ownedBy(A).length });
    const first = r.body.data[0]!;
    expect(Object.keys(first)).toEqual(expect.arrayContaining(['id', 'order_code', 'branch_id', 'order_source', 'fulfillment_type', 'status', 'payment_status', 'final_amount', 'created_at']));
    // summary: không kèm items/history và không lộ trường nội bộ
    for (const forbidden of ['items', 'status_history', 'user_id', 'created_by', 'idempotency_key', 'table_session_id']) expect(first).not.toHaveProperty(forbidden);
  });

  it('mặc định created_at giảm dần (mới nhất trước)', async () => {
    const r = await get<Envelope<WireSummary[]>>('/orders/me', A);
    const times = r.body.data.map((o) => utc(o.created_at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('chia trang: size=2 → 3 trang (2+2+1), không trùng/sót, trang vượt quá → rỗng nhưng total giữ nguyên', async () => {
    const total = ownedBy(A).length;
    const seen: number[] = [];
    const pages = Math.ceil(total / 2);
    for (let page = 1; page <= pages; page++) {
      const r = await get<Envelope<WireSummary[]>>(`/orders/me?page=${page}&size=2`, A);
      expect(r.body.meta).toEqual({ page, size: 2, total });
      expect(r.body.data.length).toBe(page < pages || total % 2 === 0 ? 2 : 1);
      seen.push(...idsOf(r.body.data));
    }
    expect(new Set(seen).size).toBe(total);
    expect([...seen].sort((a, b) => a - b)).toEqual(idsOf(ownedBy(A)).sort((a, b) => a - b));

    const beyond = await get<Envelope<WireSummary[]>>(`/orders/me?page=${pages + 1}&size=2`, A);
    expect(beyond.body.data).toEqual([]);
    expect(beyond.body.meta).toEqual({ page: pages + 1, size: 2, total });
  });

  it('sort=created_at,asc đảo thứ tự; sort=final_amount,desc xếp theo tiền', async () => {
    const desc = await get<Envelope<WireSummary[]>>('/orders/me', A);
    const asc = await get<Envelope<WireSummary[]>>('/orders/me?sort=created_at,asc', A);
    expect(idsOf(asc.body.data)).toEqual(idsOf(desc.body.data).reverse());

    const byMoney = await get<Envelope<(WireSummary & { final_amount: number })[]>>('/orders/me?sort=final_amount,desc', A);
    const amounts = byMoney.body.data.map((o) => o.final_amount);
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
  });

  it('lọc status / payment_status độc lập nhau (Unpaid ≠ Pending_Payment)', async () => {
    const pp = await get<Envelope<WireSummary[]>>('/orders/me?status=Pending_Payment', A);
    expect(pp.body.data.length).toBeGreaterThan(0);
    expect(pp.body.data.every((o) => o.status === 'Pending_Payment' && o.payment_status === 'Unpaid')).toBe(true);
    expect(pp.body.meta?.total).toBe(pp.body.data.length);

    const paid = await get<Envelope<WireSummary[]>>('/orders/me?payment_status=Paid', A);
    expect(paid.body.data.length).toBeGreaterThan(0);
    expect(paid.body.data.every((o) => o.payment_status === 'Paid' && o.status !== 'Pending_Payment')).toBe(true);

    // đơn đã Cancelled có payment_status Unpaid: lọc theo order status không bị nhầm sang payment_status
    const cancelled = await get<Envelope<WireSummary[]>>('/orders/me?status=Cancelled&payment_status=Unpaid', A);
    expect(cancelled.body.data.map((o) => o.status)).toEqual(['Cancelled']);
  });

  it('lọc from/to theo created_at (UTC; chấp nhận ISO có Z và YYYY-MM-DD)', async () => {
    const rows = [...ownedBy(A)].sort((a, b) => utc(a.createdAt) - utc(b.createdAt));
    const mid = rows[2]!;
    const iso = `${mid.createdAt}Z`;
    const from = await get<Envelope<WireSummary[]>>(`/orders/me?from=${encodeURIComponent(iso)}`, A);
    expect(idsOf(from.body.data).sort()).toEqual(idsOf(rows.filter((o) => utc(o.createdAt) >= utc(mid.createdAt))).sort());
    const to = await get<Envelope<WireSummary[]>>(`/orders/me?to=${encodeURIComponent(iso)}`, A);
    expect(idsOf(to.body.data).sort()).toEqual(idsOf(rows.filter((o) => utc(o.createdAt) <= utc(mid.createdAt))).sort());

    const today = new Date().toISOString().slice(0, 10);
    const day = await get<Envelope<WireSummary[]>>(`/orders/me?from=${today}&to=${today}`, A);
    expect(day.body.meta?.total).toBe(rows.filter((o) => o.createdAt.startsWith(today)).length);
  });

  it.each([
    ['page=0'], ['page=-1'], ['page=1.5'], ['page=abc'], ['size=0'], ['size=101'], ['size=x'],
    ['status=Serving'], ['status=Paid'], ['payment_status=Pending'],
    ['status=Pending&status=Confirmed'], // spec chưa xác nhận nhiều giá trị
    ['sort=created_at'], ['sort=password,asc'], ['sort=created_at,up'],
    ['from=hôm-qua'], ['from=2026-11-07&to=2026-11-01'],
  ])('tham số sai (%s) → 400 VALIDATION_ERROR dạng envelope', async (qs) => {
    const r = await get<ErrEnvelope>(`/orders/me?${qs}`, A);
    expect(r.status).toBe(400);
    expect(r.body.success).toBe(false);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('size=100 (tối đa) hợp lệ', async () => {
    expect((await get<Envelope<WireSummary[]>>('/orders/me?size=100', A)).status).toBe(200);
  });
});

describe('GET /orders/me — cô lập người dùng', () => {
  it('mỗi khách chỉ thấy đơn của mình, không có đơn của người khác hay đơn Dine-in vô chủ', async () => {
    const ra = await get<Envelope<WireSummary[]>>('/orders/me?size=100', A);
    const rb = await get<Envelope<WireSummary[]>>('/orders/me?size=100', B);
    expect(idsOf(ra.body.data).sort()).toEqual(idsOf(ownedBy(A)).sort());
    expect(idsOf(rb.body.data).sort()).toEqual(idsOf(ownedBy(B)).sort());
    expect(idsOf(ra.body.data).filter((id) => idsOf(rb.body.data).includes(id))).toEqual([]);
    expect(ra.body.data.every((o) => o.order_source === 'Online')).toBe(true);
    expect(ra.body.meta?.total).toBe(ownedBy(A).length); // total không đếm đơn người khác
  });

  it('không có cách chọn user khác qua query (user_id / userId bị bỏ qua)', async () => {
    const r = await get<Envelope<WireSummary[]>>(`/orders/me?size=100&user_id=${B}&userId=${B}`, A);
    expect(idsOf(r.body.data).sort()).toEqual(idsOf(ownedBy(A)).sort());
    expect(JSON.stringify(r.body)).not.toContain(B);
  });

  it('khách chưa có đơn → mảng rỗng + total 0 (không phải toàn bộ đơn)', async () => {
    db.orders.splice(0, db.orders.length, ...db.orders.filter((o) => o.userId !== B));
    const r = await get<Envelope<WireSummary[]>>('/orders/me', B);
    expect(r.body.data).toEqual([]);
    expect(r.body.meta).toEqual({ page: 1, size: 20, total: 0 });
    expect(db.orders.length).toBeGreaterThan(0);
  });

  it('401 khi thiếu / sai / hết hiệu lực token; 403 khi không phải Customer', async () => {
    expect((await get<ErrEnvelope>('/orders/me')).status).toBe(401);
    const bad = await fetch(url('/orders/me'), { headers: { Authorization: 'Bearer garbage-token' } });
    expect(bad.status).toBe(401);

    const token = mockAccessToken(A);
    revokeAllTokens();
    const revoked = await fetch(url('/orders/me'), { headers: { Authorization: `Bearer ${token}` } });
    expect(revoked.status).toBe(401);

    for (const role of ['u-staff', 'u-manager', 'u-admin']) {
      const r = await get<ErrEnvelope>('/orders/me', role);
      expect([r.status, r.body.error.code]).toEqual([403, 'FORBIDDEN']);
    }
  });

  it('không dùng header guest để thay token', async () => {
    const res = await fetch(url('/orders/me'), { headers: { 'X-Client-Key': 'guest-1', 'X-Table-Session-Code': 'seed-session-1' } });
    expect(res.status).toBe(401);
  });
});

describe('GET /orders/me/{id} — chi tiết', () => {
  it('chủ đơn xem đủ order + items[] + options[] + status_history[] (cũ → mới)', async () => {
    const order = orderWhere((o) => o.userId === A && o.status === 'Ready' && o.fulfillmentType === 'Delivery');
    const r = await get<Envelope<Record<string, unknown> & { items: { options: unknown[] }[]; status_history: WireHistory[] }>>(`/orders/me/${order.id}`, A);
    expect(r.status).toBe(200);
    expect(r.body.meta).toBeNull();
    const d = r.body.data;
    expect(d).toMatchObject({ id: order.id, order_code: order.orderCode, status: 'Ready', payment_status: 'Paid', final_amount: order.finalAmount, version: order.version });
    expect(d.items).toHaveLength(order.items.length);
    expect(d.items.some((i) => i.options.length > 0)).toBe(true);
    expect(d.status_history.map((h) => h.status)).toEqual(order.statusHistory.map((h) => h.status));
    expect(d).not.toHaveProperty('history');
    expect(d).not.toHaveProperty('idempotency_key');
    expect(d).not.toHaveProperty('created_by');
  });

  it('đơn của người khác và đơn không tồn tại đều 404 ORDER_NOT_FOUND, cùng hình dạng, không lộ chủ đơn', async () => {
    const theirs = ownedBy(B)[0]!;
    const other = await get<ErrEnvelope>(`/orders/me/${theirs.id}`, A);
    const missing = await get<ErrEnvelope>('/orders/me/99999', A);
    expect([other.status, other.body.error.code]).toEqual([404, 'ORDER_NOT_FOUND']);
    expect([missing.status, missing.body.error.code]).toEqual([404, 'ORDER_NOT_FOUND']);
    expect(other.body.success).toBe(false);
    const redact = (m: string) => m.replace(/\d+/g, 'N');
    expect(redact(other.body.error.message)).toBe(redact(missing.body.error.message));
    const raw = JSON.stringify(other.body);
    for (const leak of [B, theirs.orderCode, theirs.deliveryName ?? '@@', theirs.deliveryAddress ?? '@@']) expect(raw).not.toContain(leak);
  });

  it('đơn Dine-in vô chủ (QR/POS) cũng 404 với khách', async () => {
    const dine = orderWhere((o) => o.fulfillmentType === 'Dine_In');
    expect((await get<ErrEnvelope>(`/orders/me/${dine.id}`, A)).status).toBe(404);
  });

  it('401 không token; 403 khi không phải Customer; 400 khi id sai', async () => {
    const id = ownedBy(A)[0]!.id;
    expect((await get<ErrEnvelope>(`/orders/me/${id}`)).status).toBe(401);
    expect((await get<ErrEnvelope>(`/orders/me/${id}`, 'u-staff')).status).toBe(403);
    for (const bad of ['0', '-1', '1.5', 'abc']) {
      const r = await get<ErrEnvelope>(`/orders/me/${bad}`, A);
      expect([r.status, r.body.error.code]).toEqual([400, 'VALIDATION_ERROR']);
    }
  });

  it('khách thấy đơn mới tạo qua POST /orders (Online) của chính mình', async () => {
    const created = orderWhere((o) => o.userId === A);
    db.orders.push({ ...created, id: 9001, orderCode: 'SC09001', statusHistory: [] });
    expect((await get<Envelope<{ id: number }>>('/orders/me/9001', A)).body.data.id).toBe(9001);
    expect((await get<ErrEnvelope>('/orders/me/9001', B)).status).toBe(404);
  });
});

describe('GET /orders/{id}/history — lịch sử trạng thái', () => {
  it('chủ đơn: có lịch sử, timestamp UTC, cũ → mới, from_status null ở dòng đầu', async () => {
    const order = orderWhere((o) => o.userId === A && o.status === 'Cancelled');
    const r = await get<Envelope<WireHistory[]>>(`/orders/${order.id}/history`, A);
    expect(r.status).toBe(200);
    expect(r.body.meta).toBeNull();
    const h = r.body.data;
    expect(h.length).toBe(order.statusHistory.length);
    expect(h[0]!.from_status).toBeNull();
    for (let i = 1; i < h.length; i++) expect(h[i]!.from_status).toBe(h[i - 1]!.status);
    expect(h.at(-1)).toMatchObject({ status: 'Cancelled', note: 'Khách đổi ý', order_id: order.id });
    const times = h.map((x) => utc(x.created_at));
    expect(times.every((t) => Number.isFinite(t))).toBe(true); // parse được khi coi là UTC
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // DB lưu UTC không hậu tố → wire không có offset khác Z
    expect(h.every((x) => !/[+-]\d{2}:?\d{2}$/.test(x.created_at))).toBe(true);
  });

  it('Pending_Payment: đơn đang chờ thanh toán có dòng Pending_Payment; status lịch sử luôn là OrderStatus, không phải payment_status', async () => {
    const order = orderWhere((o) => o.userId === A && o.status === 'Pending_Payment');
    const r = await get<Envelope<WireHistory[]>>(`/orders/${order.id}/history`, A);
    expect(r.body.data.map((x) => x.status)).toEqual(['Pending_Payment']);
    expect(order.paymentStatus).toBe('Unpaid');

    const all = ownedBy(A);
    const statuses = new Set<string>();
    for (const o of all) for (const x of (await get<Envelope<WireHistory[]>>(`/orders/${o.id}/history`, A)).body.data) {
      statuses.add(x.status);
      if (x.from_status) statuses.add(x.from_status);
    }
    for (const paymentOnly of ['Unpaid', 'Paid', 'Partially_Refunded', 'Refunded']) expect(statuses.has(paymentOnly)).toBe(false);
  });

  it('Served: nhân viên thấy lịch sử đơn Dine-in đã Served; khách thì 404', async () => {
    const served = orderWhere((o) => o.status === 'Served');
    expect(served.fulfillmentType).toBe('Dine_In');
    for (const staff of ['u-staff', 'u-manager']) {
      const r = await get<Envelope<WireHistory[]>>(`/orders/${served.id}/history`, staff);
      expect(r.status).toBe(200);
      expect(r.body.data.map((x) => x.status)).toEqual(['Pending', 'Confirmed', 'Preparing', 'Ready', 'Served']);
    }
    expect((await get<ErrEnvelope>(`/orders/${served.id}/history`, A)).status).toBe(404);
  });

  it('đơn của người khác / không tồn tại → 404; không lộ dữ liệu', async () => {
    const theirs = ownedBy(B)[0]!;
    const r = await get<ErrEnvelope>(`/orders/${theirs.id}/history`, A);
    expect([r.status, r.body.error.code]).toEqual([404, 'ORDER_NOT_FOUND']);
    expect(JSON.stringify(r.body)).not.toContain(B);
    expect((await get<ErrEnvelope>('/orders/99999/history', A)).status).toBe(404);
    // nhân viên cũng 404 với đơn không tồn tại
    expect((await get<ErrEnvelope>('/orders/99999/history', 'u-staff')).status).toBe(404);
  });

  it('401 không token; 403 cho Admin; 400 khi id sai', async () => {
    const id = ownedBy(A)[0]!.id;
    expect((await get<ErrEnvelope>(`/orders/${id}/history`)).status).toBe(401);
    expect((await get<ErrEnvelope>(`/orders/${id}/history`, 'u-admin')).status).toBe(403);
    expect((await get<ErrEnvelope>('/orders/abc/history', A)).body.error.code).toBe('VALIDATION_ERROR');
    expect((await get<ErrEnvelope>('/orders/0/history', A)).status).toBe(400);
  });

  it('khách không thấy id người thực hiện khác; chính mình thì thấy; nhân viên thấy đủ', async () => {
    const order = orderWhere((o) => o.userId === A && o.status === 'Ready');
    order.statusHistory[1]!.changedBy = 'u-staff';
    order.statusHistory[0]!.changedBy = A;
    const asCustomer = await get<Envelope<WireHistory[]>>(`/orders/${order.id}/history`, A);
    expect(asCustomer.body.data[0]!.changed_by).toBe(A);
    expect(asCustomer.body.data[1]!.changed_by).toBeNull();
    expect(JSON.stringify(asCustomer.body)).not.toContain('u-staff');
    const asStaff = await get<Envelope<WireHistory[]>>(`/orders/${order.id}/history`, 'u-staff');
    expect(asStaff.body.data[1]!.changed_by).toBe('u-staff');
  });

  it('trả đúng thứ tự cũ → mới kể cả khi dữ liệu nguồn bị đảo', async () => {
    const order = orderWhere((o) => o.userId === A && o.status === 'Ready');
    order.statusHistory.reverse();
    const r = await get<Envelope<WireHistory[]>>(`/orders/${order.id}/history`, A);
    expect(r.body.data.map((x) => x.id)).toEqual([...r.body.data.map((x) => x.id)].sort((a, b) => a - b));
  });
});

describe('tương thích với client myOrderApi (mapper không báo INVALID_RESPONSE)', () => {
  beforeEach(() => {
    configureHttp({ getToken: () => mockAccessToken(A), onUnauthorized: undefined, refresh: undefined });
  });

  it('listMyOrders: items map đủ, meta có totalPages tự tính, thời gian UTC có Z', async () => {
    const r = await listMyOrders({ page: 2, size: 2 });
    expect(r.items).toHaveLength(2);
    expect(r.meta).toEqual({ page: 2, size: 2, total: ownedBy(A).length, totalPages: Math.ceil(ownedBy(A).length / 2) });
    expect(r.items.every((o) => o.createdAt.endsWith('Z') && o.itemCount !== null && o.items === undefined)).toBe(true);
    expect(r.items.some((o) => o.status === 'Pending_Payment')).toBe(false); // trang 2 của 5 đơn desc

    const pending = await listMyOrders({ status: 'Pending_Payment' });
    expect(pending.items.map((o) => [o.status, o.paymentStatus])).toEqual([['Pending_Payment', 'Unpaid']]);
    expect(pending.items[0]!.expiresAt?.endsWith('Z')).toBe(true);
  });

  it('getMyOrder: OrderDetail đầy đủ + statusHistory UTC; đơn người khác → ApiError 404', async () => {
    const order = orderWhere((o) => o.userId === A && o.status === 'Ready' && o.fulfillmentType === 'Delivery');
    const d = await getMyOrder(order.id);
    expect(d.items).toHaveLength(order.items.length);
    expect(d.statusHistory.map((h) => h.status)).toEqual(order.statusHistory.map((h) => h.status));
    expect(d.statusHistory.every((h) => h.createdAt.endsWith('Z'))).toBe(true);
    expect(d.createdAt).toBe(`${order.createdAt}Z`);

    const e = (await getMyOrder(ownedBy(B)[0]!.id).catch((x: unknown) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect([e.status, e.code]).toEqual([404, 'ORDER_NOT_FOUND']);
    expect(e.traceId).toMatch(/^mock-/);
  });

  it('getOrderHistory: map sạch; đơn người khác → 404', async () => {
    const order = orderWhere((o) => o.userId === A && o.status === 'Cancelled');
    const h = await getOrderHistory(order.id);
    expect(h.map((x) => x.status)).toEqual(order.statusHistory.map((x) => x.status));
    expect(h[0]!.fromStatus).toBeNull();
    const e = (await getOrderHistory(ownedBy(B)[0]!.id).catch((x: unknown) => x)) as ApiError;
    expect(e.status).toBe(404);
  });
});

describe('không làm vỡ luồng khác', () => {
  it('đơn paymentStatus=Paid vẫn có giao dịch payment (P3) và hiện đúng ở /orders/me', async () => {
    const paid = ownedBy(A).filter((o) => o.paymentStatus === 'Paid');
    expect(paid.length).toBeGreaterThan(0);
    expect(db.allocations.some((al) => paid.some((o) => o.id === al.orderId))).toBe(true);
    const r = await get<Envelope<WireSummary[]>>('/orders/me?payment_status=Paid&size=100', A);
    expect(idsOf(r.body.data).sort()).toEqual(idsOf(paid).sort());
  });

  it('handler legacy /orders-svc/orders/:id vẫn hoạt động song song', async () => {
    const id = ownedBy(A)[0]!.id;
    const legacy = await get<OrderDetail>(`/orders-svc/orders/${id}`, A);
    expect([legacy.status, legacy.body.id]).toEqual([200, id]);
  });

  it('chỉ đọc: handler v1 không thay đổi db.orders', async () => {
    const before = JSON.stringify(db.orders);
    const id = ownedBy(A)[0]!.id;
    await get('/orders/me', A);
    await get(`/orders/me/${id}`, A);
    await get(`/orders/${id}/history`, A);
    expect(JSON.stringify(db.orders)).toBe(before);
  });
});
