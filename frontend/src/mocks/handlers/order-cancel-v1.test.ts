import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureHttp, orderApi, paymentApi } from '@/shared/api';
import { ORDER_TRANSITIONS } from '@/shared/lib';
import type { OrderDetail, OrderStatus, PaymentStatus } from '@/shared/types';
import { db, resetDb } from '../db';
import { seedDemoOrders } from '../seed';
import { mockConfig, url } from '../utils';
import { handlers } from './index';
import { mockAccessToken, resetAuthMock, revokeAllTokens } from './identity';
import { canActorTransition, EXCEL_ORDER_TRANSITIONS, isExcelTransition } from './order-cancel-v1';

/**
 * PATCH /orders/{id}/status (SmartAPI v1) — khách hủy đơn của chính mình.
 * Luật lấy từ Excel (sheet "Enum & Trạng thái"); các chỗ Excel không nêu rõ được ghi trong P4_MSW_CANCEL.md.
 */

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

const seen: string[] = [];
beforeEach(() => {
  resetDb();
  resetAuthMock();
  mockConfig.latencyMs = 0;
  mockConfig.enforceAuth = false;
  configureHttp({ getToken: () => token, onUnauthorized: undefined, refresh: undefined });
  seen.length = 0;
  as(A);
});
afterEach(() => server.resetHandlers());
server.events.on('request:start', ({ request }) => {
  seen.push(`${request.method} ${new URL(request.url).pathname}`);
});

/** Tạo đơn Online qua đúng luồng v1. mockPaymentMethod=null ⇒ đơn COD (Pending, Unpaid). */
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

interface Wire { status: number; body: Record<string, unknown> }
async function raw(path: string, init: { method?: string; body?: unknown; rawBody?: string; token?: string | null } = {}): Promise<Wire> {
  const tk = init.token === undefined ? token : init.token;
  const res = await fetch(url(path), {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
    ...(init.rawBody !== undefined ? { body: init.rawBody } : init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const data = (w: Wire) => w.body.data as Record<string, unknown>;
const errorOf = (w: Wire) => w.body.error as { code: string; message: string };

const dbOrder = (id: number) => db.orders.find((o) => o.id === id)!;
const cancel = (id: number | string, body: unknown, who: string | null = A) =>
  raw(`/orders/${id}/status`, { method: 'PATCH', body, token: who ? mockAccessToken(who) : null });
const cancelBody = (o: OrderDetail | { version: number }, over: Record<string, unknown> = {}) => ({
  status: 'Cancelled', cancel_reason: 'Đổi ý', version: o.version, ...over,
});

/** Đặt đơn vào trạng thái bất kỳ trực tiếp trong db (không đi qua luồng nghiệp vụ). */
function force(id: number, patch: Partial<Pick<OrderDetail, 'status' | 'paymentStatus'>>) {
  Object.assign(dbOrder(id), patch);
}
const snapshot = (id: number) => JSON.stringify(dbOrder(id));

describe('Hủy thành công', () => {
  it('Pending_Payment → Cancelled: envelope + snake_case + bản rút gọn đúng spec', async () => {
    const order = await placeOnlineOrder(A);
    expect(order).toMatchObject({ status: 'Pending_Payment', version: 1 });

    const w = await cancel(order.id, cancelBody(order, { cancel_reason: '  Đặt nhầm  ' }));
    expect(w.status).toBe(200);
    expect(w.body).toMatchObject({ success: true, meta: null });
    expect(typeof w.body.trace_id).toBe('string');
    expect(Object.keys(data(w)).sort()).toEqual(
      ['cancel_reason', 'cancelled_at', 'cancelled_by', 'completed_at', 'id', 'order_code', 'payment_status', 'status', 'updated_at', 'version'].sort(),
    );
    expect(data(w)).toMatchObject({
      id: order.id, order_code: order.orderCode, status: 'Cancelled', payment_status: 'Unpaid',
      cancel_reason: 'Đặt nhầm', cancelled_by: A, completed_at: null, version: 2,
    });
  });

  it('cập nhật đúng status / cancel_reason / version / updated_at / cancelled_at trong db', async () => {
    const order = await placeOnlineOrder(A);
    const before = { ...dbOrder(order.id) };
    await cancel(order.id, cancelBody(order, { cancel_reason: 'Không cần nữa' }));

    const after = dbOrder(order.id);
    expect(after).toMatchObject({ status: 'Cancelled', cancelReason: 'Không cần nữa', cancelledBy: A, version: before.version + 1 });
    expect(after.cancelledAt).toEqual(expect.any(String));
    expect(after.updatedAt >= before.updatedAt).toBe(true);
    expect(after.updatedAt).toBe(after.cancelledAt);
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.finalAmount).toBe(before.finalAmount); // không đụng tới tiền
  });

  it('Pending (COD, chưa trả) → Cancelled', async () => {
    const order = await placeOnlineOrder(A, null);
    expect(order).toMatchObject({ status: 'Pending', paymentStatus: 'Unpaid' });
    const w = await cancel(order.id, cancelBody(order));
    expect(w.status).toBe(200);
    expect(dbOrder(order.id).status).toBe('Cancelled');
  });

  it('ghi thêm đúng 1 dòng history: from_status, status, changed_by, note, created_at', async () => {
    const order = await placeOnlineOrder(A);
    const n = dbOrder(order.id).statusHistory.length;
    await cancel(order.id, cancelBody(order, { cancel_reason: 'Đổi ý', note: 'Gọi lại sau' }));

    const h = dbOrder(order.id).statusHistory;
    expect(h).toHaveLength(n + 1);
    expect(h.at(-1)).toMatchObject({ orderId: order.id, fromStatus: 'Pending_Payment', status: 'Cancelled', changedBy: A, note: 'Gọi lại sau' });
    expect(h.at(-1)!.createdAt).toBe(dbOrder(order.id).updatedAt);
    const ids = h.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length); // id history không trùng
  });

  it('không có note → history.note lấy cancel_reason (lựa chọn của mock, xem báo cáo)', async () => {
    const order = await placeOnlineOrder(A);
    await cancel(order.id, cancelBody(order, { cancel_reason: 'Đổi ý' }));
    expect(dbOrder(order.id).statusHistory.at(-1)!.note).toBe('Đổi ý');
  });

  it('kết quả hiển thị đúng ở đọc đơn legacy (khách + nhân viên)', async () => {
    const order = await placeOnlineOrder(A);
    await cancel(order.id, cancelBody(order));
    const asOwner = await orderApi.getOrder(order.id);
    expect(asOwner).toMatchObject({ status: 'Cancelled', version: 2, cancelReason: 'Đổi ý' });
    expect(asOwner.statusHistory.map((h) => h.status)).toEqual(['Pending_Payment', 'Cancelled']);
    as(STAFF);
    expect((await orderApi.getOrder(order.id)).status).toBe('Cancelled');
  });
});

describe('Không tự động refund / không đụng payment', () => {
  it('hủy đơn Pending_Payment: payments/allocations giữ nguyên, không gọi endpoint refund', async () => {
    const order = await placeOnlineOrder(A);
    const pay = await paymentApi.createPayment(
      { branchId: 1, paymentMethod: 'VNPay', allocations: [{ orderId: order.id, allocatedAmount: order.finalAmount }], returnUrl: `http://localhost:5173/payment/${order.id}/return` },
      { idempotencyKey: key() },
    );
    const paymentsBefore = JSON.stringify(db.payments);
    const allocBefore = JSON.stringify(db.allocations);
    seen.length = 0;

    expect((await cancel(order.id, cancelBody(order))).status).toBe(200);

    expect(JSON.stringify(db.payments)).toBe(paymentsBefore);
    expect(JSON.stringify(db.allocations)).toBe(allocBefore);
    expect(db.payments.find((p) => p.id === pay.payment.id)!.status).toBe('Pending'); // payment không bị handler này đổi
    expect(dbOrder(order.id).paymentStatus).toBe('Unpaid');
    expect(seen.filter((s) => /refund/i.test(s))).toEqual([]);
    expect(seen).toEqual([`PATCH /api/orders/${order.id}/status`]);
  });
});

describe('Đơn đã thanh toán không thể hủy', () => {
  it.each<PaymentStatus>(['Paid', 'Partially_Refunded', 'Refunded'])('đơn Pending có payment_status=%s → 422 BUSINESS_RULE_VIOLATION', async (ps) => {
    const order = await placeOnlineOrder(A, null);
    force(order.id, { paymentStatus: ps });
    const before = snapshot(order.id);

    const w = await cancel(order.id, cancelBody(order));
    expect(w.status).toBe(422);
    expect(errorOf(w).code).toBe('BUSINESS_RULE_VIOLATION');
    expect(w.body).toMatchObject({ success: false });
    expect(snapshot(order.id)).toBe(before);
  });

  it('đơn Online trả qua luồng P3 (IPN success → Pending/Paid) → 422, không đổi gì', async () => {
    const order = await placeOnlineOrder(A);
    const pay = await paymentApi.createPayment(
      { branchId: 1, paymentMethod: 'VNPay', allocations: [{ orderId: order.id, allocatedAmount: order.finalAmount }], returnUrl: `http://localhost:5173/payment/${order.id}/return` },
      { idempotencyKey: key() },
    );
    await paymentApi.simulatePayment(pay.payment.id, { result: 'success' });
    expect(dbOrder(order.id)).toMatchObject({ status: 'Pending', paymentStatus: 'Paid' });

    const fresh = dbOrder(order.id);
    const before = snapshot(order.id);
    const w = await cancel(order.id, cancelBody(fresh));
    expect([w.status, errorOf(w).code]).toEqual([422, 'BUSINESS_RULE_VIOLATION']);
    expect(snapshot(order.id)).toBe(before);
  });

  it('đơn Paid ở trạng thái khách không được hủy (Confirmed) → 409 INVALID_STATE_TRANSITION (transition kiểm trước)', async () => {
    const order = await placeOnlineOrder(A, null);
    force(order.id, { status: 'Confirmed', paymentStatus: 'Paid' });
    const w = await cancel(order.id, cancelBody(dbOrder(order.id)));
    expect([w.status, errorOf(w).code]).toEqual([409, 'INVALID_STATE_TRANSITION']);
  });
});

describe('409 VERSION_CONFLICT', () => {
  it('version cũ/sai → 409, đơn không đổi', async () => {
    const order = await placeOnlineOrder(A);
    const before = snapshot(order.id);
    for (const version of [order.version + 1, order.version + 5, 99]) {
      const w = await cancel(order.id, cancelBody(order, { version }));
      expect([w.status, errorOf(w).code]).toEqual([409, 'VERSION_CONFLICT']);
    }
    expect(snapshot(order.id)).toBe(before);
  });

  it('nhân viên xác nhận đơn giữa chừng (version tăng) → khách gửi version cũ nhận VERSION_CONFLICT, không phải INVALID_STATE_TRANSITION', async () => {
    const order = await placeOnlineOrder(A, null); // Pending, v1
    as(STAFF);
    await orderApi.changeOrderStatus(order.id, { to: 'Confirmed', version: order.version });
    expect(dbOrder(order.id)).toMatchObject({ status: 'Confirmed', version: 2 });

    const w = await cancel(order.id, cancelBody(order)); // version=1 đã cũ
    expect([w.status, errorOf(w).code]).toEqual([409, 'VERSION_CONFLICT']);
    expect(dbOrder(order.id).status).toBe('Confirmed');

    // Tải lại, gửi đúng version → lúc này mới là lỗi transition (Confirmed khách không được hủy).
    const w2 = await cancel(order.id, cancelBody(dbOrder(order.id)));
    expect([w2.status, errorOf(w2).code]).toEqual([409, 'INVALID_STATE_TRANSITION']);
  });

  it('gửi lại cùng request sau khi đã hủy thành công → VERSION_CONFLICT (version đã tăng)', async () => {
    const order = await placeOnlineOrder(A);
    const body = cancelBody(order);
    expect((await cancel(order.id, body)).status).toBe(200);
    const again = await cancel(order.id, body);
    expect([again.status, errorOf(again).code]).toEqual([409, 'VERSION_CONFLICT']);
    expect(dbOrder(order.id).statusHistory.filter((h) => h.status === 'Cancelled')).toHaveLength(1);
  });
});

describe('409 INVALID_STATE_TRANSITION', () => {
  const NOT_CANCELLABLE_BY_CUSTOMER: OrderStatus[] = ['Confirmed', 'Preparing', 'Ready', 'Shipping', 'Served', 'Completed', 'Cancelled', 'Rejected'];

  it.each(NOT_CANCELLABLE_BY_CUSTOMER)('khách hủy đơn đang %s → 409, không đổi gì', async (status) => {
    const order = await placeOnlineOrder(A, null);
    force(order.id, { status });
    const before = snapshot(order.id);

    const w = await cancel(order.id, cancelBody(dbOrder(order.id)));
    expect([w.status, errorOf(w).code]).toEqual([409, 'INVALID_STATE_TRANSITION']);
    expect(w.body).toMatchObject({ success: false });
    expect(snapshot(order.id)).toBe(before);
  });

  it('Preparing → Cancelled: Excel KHÔNG có cạnh này dù ORDER_TRANSITIONS của FE có → mock theo Excel', async () => {
    expect(ORDER_TRANSITIONS.Pickup.Preparing).toContain('Cancelled'); // lệch đã biết của FE, không sửa ở bước này
    expect(isExcelTransition('Preparing', 'Cancelled')).toBe(false);
    const order = await placeOnlineOrder(A, null);
    force(order.id, { status: 'Preparing' });
    expect((await cancel(order.id, cancelBody(dbOrder(order.id)))).status).toBe(409);
  });

  it('hủy hai lần với version mới nhất → lần hai INVALID_STATE_TRANSITION (đã Cancelled)', async () => {
    const order = await placeOnlineOrder(A);
    await cancel(order.id, cancelBody(order));
    const w = await cancel(order.id, cancelBody(dbOrder(order.id)));
    expect([w.status, errorOf(w).code]).toEqual([409, 'INVALID_STATE_TRANSITION']);
  });
});

describe('Bảng transition theo Excel', () => {
  it('đúng 13 dòng của sheet "Enum & Trạng thái"; dòng có Customer chỉ là →Cancelled từ Pending_Payment/Pending', () => {
    expect(EXCEL_ORDER_TRANSITIONS).toHaveLength(13);
    const customerRows = EXCEL_ORDER_TRANSITIONS.filter((r) => r.actors.includes('Customer')).map((r) => `${r.from}>${r.to}`);
    expect(customerRows).toEqual(['Pending_Payment>Cancelled', 'Pending>Cancelled']);
  });

  it('Confirmed → Cancelled chỉ Staff/Manager; Pending_Payment → Pending chỉ System', () => {
    expect(canActorTransition('Customer', 'Confirmed', 'Cancelled')).toBe(false);
    expect(canActorTransition('Staff', 'Confirmed', 'Cancelled')).toBe(true);
    expect(canActorTransition('Manager', 'Confirmed', 'Cancelled')).toBe(true);
    expect(canActorTransition('Customer', 'Pending_Payment', 'Pending')).toBe(false);
    expect(canActorTransition('System', 'Pending_Payment', 'Pending')).toBe(true);
  });
});

describe('Xác thực & quyền sở hữu', () => {
  it('thiếu / sai / thu hồi token → 401 UNAUTHORIZED; header guest không thay được token', async () => {
    const order = await placeOnlineOrder(A);
    const before = snapshot(order.id);
    expect(errorOf(await cancel(order.id, cancelBody(order), null)).code).toBe('UNAUTHORIZED');
    expect((await cancel(order.id, cancelBody(order), null)).status).toBe(401);
    const bad = await raw(`/orders/${order.id}/status`, { method: 'PATCH', body: cancelBody(order), token: 'garbage' });
    expect(bad.status).toBe(401);
    const old = mockAccessToken(A);
    revokeAllTokens(); // đổi epoch → token cũ vô hiệu
    const revoked = await raw(`/orders/${order.id}/status`, { method: 'PATCH', body: cancelBody(order), token: old });
    expect(revoked.status).toBe(401);
    expect(snapshot(order.id)).toBe(before);
  });

  it.each(['u-staff', 'u-manager', 'u-admin'])('%s không phải Customer → 403 FORBIDDEN (endpoint này chỉ cho chủ đơn)', async (who) => {
    const order = await placeOnlineOrder(A);
    const before = snapshot(order.id);
    const w = await cancel(order.id, cancelBody(order), who);
    expect([w.status, errorOf(w).code]).toEqual([403, 'FORBIDDEN']);
    expect(snapshot(order.id)).toBe(before);
  });

  it('không hủy được đơn của user khác: 404 ORDER_NOT_FOUND, đơn của A nguyên vẹn', async () => {
    const order = await placeOnlineOrder(A);
    const before = snapshot(order.id);
    const w = await cancel(order.id, cancelBody(order), B);
    expect([w.status, errorOf(w).code]).toEqual([404, 'ORDER_NOT_FOUND']);
    expect(snapshot(order.id)).toBe(before);
    expect(dbOrder(order.id).statusHistory.some((h) => h.status === 'Cancelled')).toBe(false);
  });

  it('đơn người khác ≡ đơn không tồn tại (cùng code/hình dạng, chỉ khác số id) → không lộ chủ đơn', async () => {
    const order = await placeOnlineOrder(A);
    const other = await cancel(order.id, cancelBody(order), B);
    const ghost = await cancel(987654, cancelBody(order), B);
    expect(ghost.status).toBe(404);
    expect(errorOf(other).code).toBe(errorOf(ghost).code);
    expect(errorOf(other).message.replace(String(order.id), '#')).toBe(errorOf(ghost).message.replace('987654', '#'));
    expect(JSON.stringify(other.body)).not.toContain(A);
  });

  it('đơn Dine-in vô chủ và đơn của khách khác trong seed → 404', async () => {
    seedDemoOrders();
    const dineIn = db.orders.find((o) => o.userId === null)!;
    const w = await cancel(dineIn.id, { status: 'Cancelled', cancel_reason: 'x', version: dineIn.version });
    expect(w.status).toBe(404);
    const theirs = db.orders.find((o) => o.userId === B)!;
    expect((await cancel(theirs.id, { status: 'Cancelled', cancel_reason: 'x', version: theirs.version })).status).toBe(404);
    expect(dbOrder(theirs.id).status).toBe(theirs.status);
  });

  it('user_id / created_by trong body bị bỏ qua: chủ đơn lấy từ token', async () => {
    const order = await placeOnlineOrder(A);
    const w = await cancel(order.id, cancelBody(order, { user_id: A }), B);
    expect(w.status).toBe(404);
    const ok = await cancel(order.id, cancelBody(order, { user_id: B, cancelled_by: B }), A);
    expect(ok.status).toBe(200);
    expect(dbOrder(order.id).cancelledBy).toBe(A);
  });

  it('khách chuyển sang trạng thái khác Cancelled → 403 FORBIDDEN (spec: Customer chỉ được Cancelled)', async () => {
    const order = await placeOnlineOrder(A, null);
    const before = snapshot(order.id);
    for (const status of ['Confirmed', 'Completed', 'Pending'] as const) {
      const w = await cancel(order.id, { status, version: order.version });
      expect([w.status, errorOf(w).code]).toEqual([403, 'FORBIDDEN']);
    }
    const rejected = await cancel(order.id, { status: 'Rejected', cancel_reason: 'x', version: order.version });
    expect(rejected.status).toBe(403);
    expect(snapshot(order.id)).toBe(before);
  });
});

describe('400 VALIDATION_ERROR', () => {
  it.each([
    ['status thiếu', { cancel_reason: 'x', version: 1 }],
    ['status không thuộc enum', { status: 'Serving', cancel_reason: 'x', version: 1 }],
    ['status sai kiểu', { status: 5, cancel_reason: 'x', version: 1 }],
    ['version thiếu', { status: 'Cancelled', cancel_reason: 'x' }],
    ['version là chuỗi', { status: 'Cancelled', cancel_reason: 'x', version: '1' }],
    ['version thập phân', { status: 'Cancelled', cancel_reason: 'x', version: 1.5 }],
    ['version = 0', { status: 'Cancelled', cancel_reason: 'x', version: 0 }],
    ['cancel_reason thiếu', { status: 'Cancelled', version: 1 }],
    ['cancel_reason rỗng', { status: 'Cancelled', cancel_reason: '', version: 1 }],
    ['cancel_reason toàn khoảng trắng', { status: 'Cancelled', cancel_reason: '   ', version: 1 }],
    ['cancel_reason sai kiểu', { status: 'Cancelled', cancel_reason: 7, version: 1 }],
    ['cancel_reason > 255 ký tự', { status: 'Cancelled', cancel_reason: 'x'.repeat(256), version: 1 }],
    ['note > 255 ký tự', { status: 'Cancelled', cancel_reason: 'x', note: 'n'.repeat(256), version: 1 }],
  ])('%s → 400, đơn không đổi', async (_label, body) => {
    const order = await placeOnlineOrder(A);
    const before = snapshot(order.id);
    const w = await cancel(order.id, body);
    expect([w.status, errorOf(w).code]).toEqual([400, 'VALIDATION_ERROR']);
    expect(snapshot(order.id)).toBe(before);
  });

  it('cancel_reason đúng 255 ký tự hợp lệ', async () => {
    const order = await placeOnlineOrder(A);
    expect((await cancel(order.id, cancelBody(order, { cancel_reason: 'x'.repeat(255) }))).status).toBe(200);
  });

  it.each(['abc', '0', '-3', '1.5', '1e2'])('id đường dẫn "%s" → 400', async (id) => {
    const w = await cancel(id, { status: 'Cancelled', cancel_reason: 'x', version: 1 });
    expect([w.status, errorOf(w).code]).toEqual([400, 'VALIDATION_ERROR']);
  });

  it('body không phải JSON → 400', async () => {
    const order = await placeOnlineOrder(A);
    const w = await raw(`/orders/${order.id}/status`, { method: 'PATCH', rawBody: '{oops', token: mockAccessToken(A) });
    expect(w.status).toBe(400);
    expect(w.body).toMatchObject({ success: false });
  });

  it('thứ tự kiểm tra: 401 → 403 → 400 → 404', async () => {
    const order = await placeOnlineOrder(A);
    expect((await cancel(order.id, {}, null)).status).toBe(401); // body sai nhưng chưa đăng nhập
    expect((await cancel(order.id, {}, STAFF)).status).toBe(403); // body sai nhưng sai vai trò
    expect((await cancel(order.id, {}, B)).status).toBe(400); // body sai trước khi tra đơn
    expect((await cancel(order.id, cancelBody(order), B)).status).toBe(404);
  });
});

describe('Không vỡ luồng khác', () => {
  it('P3: đơn khác vẫn thanh toán được sau khi một đơn bị hủy; đơn đã hủy không thanh toán được nữa', async () => {
    const o1 = await placeOnlineOrder(A);
    const o2 = await placeOnlineOrder(A);
    expect((await cancel(o1.id, cancelBody(o1))).status).toBe(200);

    const pay = (o: OrderDetail) => paymentApi.createPayment(
      { branchId: 1, paymentMethod: 'VNPay', allocations: [{ orderId: o.id, allocatedAmount: o.finalAmount }], returnUrl: `http://localhost:5173/payment/${o.id}/return` },
      { idempotencyKey: key() },
    );
    const p2 = await pay(o2);
    expect(p2.payment.status).toBe('Pending');
    await paymentApi.simulatePayment(p2.payment.id, { result: 'success' });
    expect(dbOrder(o2.id)).toMatchObject({ status: 'Pending', paymentStatus: 'Paid' });
    expect((await paymentApi.getPaymentById(p2.payment.id)).payment.status).toBe('Success');

    await expect(pay(dbOrder(o1.id))).rejects.toMatchObject({ status: 409, code: 'ORDER_NOT_PAYABLE' });
  });

  it('legacy PATCH /orders-svc/orders/:id/status của nhân viên vẫn chạy và giữ mã INVALID_TRANSITION', async () => {
    const order = await placeOnlineOrder(A, null);
    as(STAFF);
    const next = await orderApi.changeOrderStatus(order.id, { to: 'Confirmed', version: order.version });
    expect(next).toMatchObject({ status: 'Confirmed', version: 2 });
    await expect(orderApi.changeOrderStatus(order.id, { to: 'Ready', version: 2 })).rejects.toMatchObject({ status: 409, code: 'INVALID_TRANSITION' });
  });

  it('đơn Online đã hủy vẫn nằm trong hàng đợi nhân viên (legacy listOrders)', async () => {
    const order = await placeOnlineOrder(A);
    await cancel(order.id, cancelBody(order));
    as(STAFF);
    const page = await orderApi.listOrders({});
    expect(page.items.find((o) => o.id === order.id)?.status).toBe('Cancelled');
  });

  it('route v1 không chắn route legacy: /orders-svc/... không bị handler mới bắt', async () => {
    const order = await placeOnlineOrder(A);
    const w = await raw(`/orders-svc/orders/${order.id}/status`, { method: 'PATCH', body: { to: 'Cancelled', version: order.version, note: 'x' }, token: mockAccessToken(STAFF) });
    expect(w.status).toBe(200); // legacy trả body trần, không envelope
    expect(w.body).not.toHaveProperty('success');
  });
});
