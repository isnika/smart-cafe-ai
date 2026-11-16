import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { envelopeError, url } from '@/mocks/utils';
import { isApiError, orderApi } from '@/shared/api';
import { latte, loginAs, resetWorld, startTableSession } from '@/test/helpers';
import { describeApiError } from './errors';
import { describeSubmitError } from './hooks/useSubmitOrder';
import { usePlacedOrders } from './placed-orders';
import { useDineInCartStore } from './store';
import { buildCreateOrderInput, placeDineInOrder, SubmitOrderError } from './submit';

const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => {
  resetWorld();
  server.events.removeAllListeners();
});

const cart = () => useDineInCartStore.getState();
const croissant = { productId: 7, productName: 'Bánh croissant', variantId: 71, variantName: 'Standard', unitPrice: 35_000, options: [] };

async function fillCart() {
  const sessionId = await startTableSession();
  await cart().addLine(latte, 2);
  await cart().addLine(croissant);
  return sessionId;
}

/** Ghi lại header + body mọi POST /orders. */
function spyOrders() {
  const calls: { headers: Headers; body: Record<string, unknown> }[] = [];
  server.events.on('request:start', async ({ request }) => {
    if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/orders')) {
      calls.push({ headers: request.headers, body: (await request.clone().json()) as Record<string, unknown> });
    }
  });
  return calls;
}

describe('P3 gửi đơn Dine-in (POST /orders)', () => {
  it('thành công: đúng payload spec (cart_id…, không có giá), ghi vào db, xoá giỏ local, lưu đơn cho màn xác nhận', async () => {
    const sessionId = await fillCart();
    const calls = spyOrders();
    const order = await placeDineInOrder({ note: '  ít đá  ' });
    await new Promise((r) => setTimeout(r, 0));

    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({
      cart_id: 1, order_source: 'QR', fulfillment_type: 'Dine_In', branch_id: 1, table_session_id: sessionId, note: 'ít đá',
    });
    expect(calls[0]!.headers.get('Idempotency-Key')).toBeTruthy();
    expect(calls[0]!.headers.get('X-Table-Session-Code')).toBe(cart().sessionCode ?? db.sessions[0]!.sessionCode);

    expect(db.orders).toHaveLength(1);
    expect(db.orders[0]).toMatchObject({
      id: order.id, orderSource: 'QR', fulfillmentType: 'Dine_In', status: 'Pending',
      tableSessionId: sessionId, tableNumber: '01', note: 'ít đá', branchId: 1,
    });
    expect(db.orders[0]!.items.map((i) => [i.variantId, i.quantity])).toEqual([[12, 2], [71, 1]]);
    expect(order.finalAmount).toBe(2 * 45_000 + 35_000); // server tính tiền, FE không gửi giá
    expect(db.carts[0]!.status).toBe('Converted');

    expect(cart().lines).toEqual([]);
    expect(cart().cartId).toBeNull();
    expect(usePlacedOrders.getState().get(order.id)?.orderCode).toBe(order.orderCode);
  });

  it('buildCreateOrderInput: chỉ cart + bàn + note, bỏ note rỗng', () => {
    expect(buildCreateOrderInput({ cartId: 3, tableSessionId: 9, branchId: 2, note: ' ' })).toEqual({ cartId: 3, branchId: 2, tableSessionId: 9 });
    expect(buildCreateOrderInput({ cartId: 3, tableSessionId: 9, note: ' a ' })).toMatchObject({ branchId: 1, note: 'a' });
  });

  it('khách đã đăng nhập: gửi Bearer (tuỳ chọn) và đơn gắn userId', async () => {
    await fillCart();
    loginAs('Customer', { id: 'cust-7' });
    useAuthStore.setState({ accessToken: 'tok-1' });
    const calls = spyOrders();
    await placeDineInOrder();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls[0]!.headers.get('Authorization')).toBe('Bearer tok-1');
  });

  it('giỏ rỗng / chưa có phiên → chặn trước khi gọi API', async () => {
    await expect(placeDineInOrder()).rejects.toMatchObject({ code: 'NO_SESSION' });
    await startTableSession();
    await expect(placeDineInOrder()).rejects.toMatchObject({ code: 'EMPTY_CART' });
    await expect(placeDineInOrder()).rejects.toBeInstanceOf(SubmitOrderError);
    expect(db.orders).toHaveLength(0);
  });

  it('422 OUT_OF_STOCK: giỏ giữ nguyên, không có đơn, thông báo đúng mã, giỏ được tải lại', async () => {
    await fillCart();
    db.unavailableVariants.add('1:71'); // croissant hết hàng sau khi đã vào giỏ
    const err = await placeDineInOrder().then(() => null, (e: unknown) => e);
    expect(isApiError(err) && [err.status, err.code]).toEqual([422, 'OUT_OF_STOCK']);
    expect(describeSubmitError(err)).toMatchObject({ retryable: false, message: expect.stringContaining('hết hàng') as unknown as string });
    expect(cart().lines).toHaveLength(2);
    expect(db.orders).toHaveLength(0);
    expect(usePlacedOrders.getState().orders).toEqual([]);
  });

  it('map lỗi 409/422 sang thông báo đúng mã', async () => {
    const mk = async (status: number, code: string) => {
      server.use(http.post(url('/orders'), () => envelopeError(status, code, 'raw'), { once: true }));
      return describeSubmitError(await orderApi.createQrOrder({ cartId: 1, branchId: 1, tableSessionId: 1 }, { sessionCode: 's', idempotencyKey: 'k' }).then(() => null, (e: unknown) => e));
    };
    expect((await mk(409, 'VERSION_CONFLICT')).message).toMatch(/cập nhật/);
    expect((await mk(409, 'INVALID_STATE_TRANSITION')).message).toMatch(/thanh toán|đóng/);
    expect((await mk(409, 'IDEMPOTENCY_CONFLICT')).message).toMatch(/thay đổi/);
    expect((await mk(422, 'BUSINESS_RULE_VIOLATION')).message).toBe('raw');
    expect((await mk(422, 'OUT_OF_STOCK')).message).toMatch(/hết hàng/);
    expect((await mk(503, 'X')).retryable).toBe(true);
    expect(describeApiError(new Error('x')).retryable).toBe(true);
  });

  it('bấm liên tục khi đang gửi → chỉ 1 request, 1 đơn', async () => {
    await fillCart();
    const calls = spyOrders();
    const [a, b, c] = await Promise.all([placeDineInOrder(), placeDineInOrder(), placeDineInOrder()]);
    expect(calls).toHaveLength(1);
    expect(db.orders).toHaveLength(1);
    expect(a.id).toBe(b.id);
    expect(b.id).toBe(c.id);
  });

  it('Idempotency-Key giữ nguyên khi retry cùng giỏ (lỗi mạng) và đơn vẫn chỉ 1', async () => {
    await fillCart();
    const keys: string[] = [];
    server.use(
      http.post(url('/orders'), ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key')!);
        return HttpResponse.error();
      }, { once: true }),
    );
    const first = await placeDineInOrder().then(() => null, (e: unknown) => e);
    expect(isApiError(first) && first.status).toBe(0);
    expect(cart().lines).toHaveLength(2); // lỗi → giỏ còn nguyên

    const order = await placeDineInOrder();
    expect(db.orders).toHaveLength(1);
    expect(db.orders[0]!.idempotencyKey).toBe(keys[0]);
    expect(order.id).toBe(db.orders[0]!.id);
  });

  it('Idempotency-Key ĐỔI khi giỏ thay đổi giữa hai lần thử, và đổi ở lần gửi mới sau thành công', async () => {
    await fillCart();
    const keys: string[] = [];
    const failOnce = () =>
      http.post(url('/orders'), ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key')!);
        return HttpResponse.error();
      }, { once: true });
    server.use(failOnce(), failOnce());
    await placeDineInOrder().catch(() => null);
    await cart().increment(cart().lines[0]!.key); // giỏ đổi → bản gửi khác
    await placeDineInOrder().catch(() => null);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);

    await placeDineInOrder(); // thành công
    expect(db.orders).toHaveLength(1);
    // Lần gửi mới (giỏ mới) → key mới
    await cart().addLine(croissant);
    await placeDineInOrder();
    expect(db.orders).toHaveLength(2);
    expect(db.orders[1]!.idempotencyKey).not.toBe(db.orders[0]!.idempotencyKey);
  });

  it('không đụng tới phiên đăng nhập (guest 401 không logout)', async () => {
    loginAs('Staff');
    const before = useAuthStore.getState();
    await fillCart();
    server.use(http.post(url('/orders'), () => envelopeError(401, 'UNAUTHORIZED', 'x'), { once: true }));
    await placeDineInOrder().catch(() => null);
    const after = useAuthStore.getState();
    expect([after.status, after.roleName, after.user?.id, after.accessToken]).toEqual([before.status, before.roleName, before.user?.id, before.accessToken]);
  });
});

describe('Dine-in → hàng đợi nhân viên (cùng nguồn dữ liệu MSW)', () => {
  it('đơn vừa đặt xuất hiện trong danh sách hàng đợi với bàn và dòng món', async () => {
    await fillCart();
    const order = await placeDineInOrder();

    const queue = await orderApi.listOrders({ status: ['Pending', 'Confirmed', 'Preparing', 'Ready'], fulfillmentType: 'Dine_In', pageSize: 100 });
    const found = queue.items.find((o) => o.id === order.id);
    expect(found).toMatchObject({ orderCode: order.orderCode, tableNumber: '01', status: 'Pending', orderSource: 'QR' });
    expect(found?.items).toHaveLength(2);
    expect((await orderApi.getOrder(order.id)).statusHistory[0]).toMatchObject({ status: 'Pending', fromStatus: null });
  });

  it('nhân viên đổi trạng thái đơn khách vừa đặt', async () => {
    await fillCart();
    const order = await placeDineInOrder();
    const confirmed = await orderApi.changeOrderStatus(order.id, { to: 'Confirmed', version: order.version });
    expect(confirmed.status).toBe('Confirmed');
  });
});
