import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { url } from '@/mocks/utils';
import { isApiError, orderApi } from '@/shared/api';
import { latte, loginAs, resetWorld, startTableSession } from '@/test/helpers';
import { toOrderLines } from './cart';
import { usePlacedOrders } from './placed-orders';
import { useDineInCartStore } from './store';
import { buildCreateOrderInput, placeDineInOrder, SubmitOrderError } from './submit';

const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(resetWorld);

const cart = () => useDineInCartStore.getState();

async function fillCart() {
  const sessionId = await startTableSession();
  cart().addLine(latte, 2);
  cart().addLine({ productId: 7, productName: 'Bánh croissant', variantId: 71, variantName: 'Standard', unitPrice: 35_000, options: [] });
  return sessionId;
}

describe('submit order (Dine-in)', () => {
  it('gửi đơn thành công: đúng payload, ghi vào db của MSW, xoá giỏ, lưu đơn cho màn xác nhận', async () => {
    const sessionId = await fillCart();
    const order = await placeDineInOrder({ note: '  ít đá  ' });

    expect(db.orders).toHaveLength(1);
    const saved = db.orders[0]!;
    expect(saved).toMatchObject({
      id: order.id, orderSource: 'QR', fulfillmentType: 'Dine_In', status: 'Pending',
      tableSessionId: sessionId, tableNumber: '01', note: 'ít đá', branchId: 1,
    });
    expect(saved.items.map((i) => [i.variantId, i.quantity])).toEqual([[12, 2], [71, 1]]);
    expect(saved.items[0]!.options.map((o) => o.optionId)).toEqual([101, 104]);
    expect(saved.finalAmount).toBe(2 * 45_000 + 35_000); // server tính tiền, FE không gửi giá

    expect(cart().lines).toEqual([]);
    expect(usePlacedOrders.getState().get(order.id)?.orderCode).toBe(order.orderCode);
  });

  it('payload: tableSessionId + lines đúng contract, idempotencyKey, userId chỉ khi là Customer', async () => {
    await fillCart();
    const base = { tableSessionId: 9, lines: cart().lines, idempotencyKey: 'k-1' };
    expect(buildCreateOrderInput({ ...base, note: ' ' })).toEqual({
      orderSource: 'QR', fulfillmentType: 'Dine_In', branchId: 1, tableSessionId: 9,
      lines: toOrderLines(cart().lines), idempotencyKey: 'k-1',
    });
    expect(buildCreateOrderInput({ ...base, userId: 'u-1' }).userId).toBe('u-1');

    loginAs('Customer', { id: 'cust-7' });
    const order = await placeDineInOrder();
    expect(order.userId).toBe('cust-7');
  });

  it('giỏ rỗng → không gọi API, không tạo đơn', async () => {
    await startTableSession();
    await expect(placeDineInOrder()).rejects.toMatchObject({ code: 'EMPTY_CART' });
    expect(db.orders).toHaveLength(0);
  });

  it('chưa có phiên bàn → từ chối trước khi gọi API', async () => {
    await expect(placeDineInOrder()).rejects.toBeInstanceOf(SubmitOrderError);
    await expect(placeDineInOrder()).rejects.toMatchObject({ code: 'NO_SESSION' });
    expect(db.orders).toHaveLength(0);
  });

  it('API lỗi → giỏ giữ nguyên, không có đơn, không lưu màn xác nhận', async () => {
    await fillCart();
    db.unavailableVariants.add('1:71'); // croissant hết hàng → 409 ITEM_UNAVAILABLE
    const err = await placeDineInOrder().then(() => null, (e: unknown) => e);
    expect(isApiError(err) && err.code).toBe('ITEM_UNAVAILABLE');
    expect(cart().lines).toHaveLength(2);
    expect(db.orders).toHaveLength(0);
    expect(usePlacedOrders.getState().orders).toEqual([]);
  });

  it('bấm liên tục khi đang gửi → chỉ 1 request, 1 đơn', async () => {
    await fillCart();
    let posts = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/orders-svc/orders')) posts += 1;
    });
    const [a, b, c] = await Promise.all([placeDineInOrder(), placeDineInOrder(), placeDineInOrder()]);
    expect(posts).toBe(1);
    expect(db.orders).toHaveLength(1);
    expect(a.id).toBe(b.id);
    expect(b.id).toBe(c.id);
  });

  it('lỗi mạng rồi thử lại → dùng lại idempotencyKey, kết quả vẫn đúng 1 đơn', async () => {
    await fillCart();
    const keys: string[] = [];
    server.use(
      http.post(url('/orders-svc/orders'), async ({ request }) => {
        keys.push(((await request.clone().json()) as { idempotencyKey: string }).idempotencyKey);
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

  it('không đụng tới phiên đăng nhập', async () => {
    loginAs('Staff');
    const before = useAuthStore.getState();
    await fillCart();
    await placeDineInOrder();
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

    const feed = await orderApi.listOrders({ cashier: 'feed' });
    expect(feed.items.map((o) => o.id)).toContain(order.id);
    expect((await orderApi.getOrder(order.id)).statusHistory[0]).toMatchObject({ status: 'Pending', fromStatus: null });
  });

  it('nhân viên đổi trạng thái đơn khách vừa đặt', async () => {
    await fillCart();
    const order = await placeDineInOrder();
    const confirmed = await orderApi.changeOrderStatus(order.id, { to: 'Confirmed', version: order.version });
    expect(confirmed.status).toBe('Confirmed');
    expect((await orderApi.getOrder(order.id)).status).toBe('Confirmed');
  });
});
