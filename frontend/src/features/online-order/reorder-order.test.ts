import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useDineInCartStore } from '@/features/dine-in/store';
import { db, availKey, findVariant } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { mockAccessToken, resetAuthMock } from '@/mocks/handlers/identity';
import { seedDemoOrders } from '@/mocks/seed';
import { mockConfig, url } from '@/mocks/utils';
import { ApiError, configureHttp, isApiError, orderApi } from '@/shared/api';
import type { OrderDetail } from '@/shared/types';
import { resetWorld, latte } from '@/test/helpers';
import { syncOnlineCart } from './cart-sync';
import { ONLINE_BRANCH_ID } from './config';
import { classifyAddError, describeFailure, reorderOnlineOrder, summarizeReorder } from './reorder-order';
import { useOnlineCartStore } from './store';

/**
 * Đặt lại đơn qua API giỏ Online. Chạy trên MSW thật (order-read-v1 + online-v1), nên kiểm được request thật:
 * path, query ?source=Online, header, body (không có giá) và kết quả giỏ do server tính.
 * Đơn mẫu: đơn Delivery Ready của u-customer = Trà đào (variant 51, option 501+504) + Croissant (variant 71, x2).
 */
const server = setupServer(...handlers);
interface Call { method: string; path: string; search: string; headers: Headers; body: Promise<string> }
const calls: Call[] = [];
server.events.on('request:start', ({ request }) => {
  const u = new URL(request.url);
  calls.push({ method: request.method, path: u.pathname, search: u.search, headers: request.headers, body: request.clone().text() });
});
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

const A = 'u-customer';
const B = 'u-customer2';
const TRA_DAO = 51;
const CROISSANT = 71;

beforeEach(() => {
  resetWorld();
  resetAuthMock();
  seedDemoOrders();
  calls.length = 0;
  mockConfig.latencyMs = 0;
  configureHttp({ getToken: () => mockAccessToken(A), onUnauthorized: undefined, refresh: undefined });
});

const sample = (): OrderDetail => db.orders.find((o) => o.userId === A && o.fulfillmentType === 'Delivery' && o.status === 'Ready')!;
const itemPosts = () => calls.filter((c) => c.method === 'POST' && c.path === '/api/carts/current/items');
const cartCalls = () => calls.filter((c) => /\/api\/carts/.test(c.path));
const activeCart = () => db.onlineCarts.find((c) => c.userId === A && c.status === 'Active');
const unavailable = (variantId: number) => db.unavailableVariants.add(availKey(ONLINE_BRANCH_ID, variantId));
const storeVariants = () => useOnlineCartStore.getState().lines.map((l) => l.variantId);

describe('gọi API giỏ Online (không copy local state)', () => {
  it('đọc đơn cũ từ API, mở giỏ Online, thêm TỪNG món bằng POST /carts/current/items?source=Online với Bearer, không header guest', async () => {
    const order = sample();
    const r = await reorderOnlineOrder(order.id);

    expect(r.status).toBe('added_all');
    const seen = calls.map((c) => `${c.method} ${c.path}`);
    expect(seen).toEqual([
      `GET /api/orders/me/${order.id}`,
      'GET /api/carts/current', // chưa có giỏ → 404 → giỏ mới
      'POST /api/carts',
      'POST /api/carts/current/items',
      'POST /api/carts/current/items',
      'GET /api/carts/current',
    ]);
    expect(seen.some((s) => s.includes('/orders-svc'))).toBe(false);
    for (const c of itemPosts()) expect(c.search).toBe('?source=Online');
    for (const c of calls) {
      expect(c.headers.get('Authorization')).toMatch(/^Bearer /);
      expect(c.headers.get('X-Client-Key')).toBeNull();
      expect(c.headers.get('X-Table-Session-Code')).toBeNull();
      expect(c.search).not.toContain('source=QR');
    }
    expect(JSON.parse(await calls.find((c) => c.path === '/api/carts' && c.method === 'POST')!.body)).toMatchObject({
      cart_source: 'Online', fulfillment_type: 'Delivery', branch_id: ONLINE_BRANCH_ID,
    });
    expect(activeCart()!.items.map((i) => i.variantId)).toEqual([TRA_DAO, CROISSANT]);
    expect(activeCart()!.items.find((i) => i.variantId === CROISSANT)!.quantity).toBe(2);
    expect(activeCart()!.items.find((i) => i.variantId === TRA_DAO)!.options.map((o) => o.optionId).sort()).toEqual([501, 504]);
  });

  it('store chỉ được cập nhật SAU khi server trả lời, và bằng đúng giỏ server (không có dòng nào do đơn cũ copy vào trước)', async () => {
    const order = sample();
    const lensAtRequest: number[] = [];
    server.use(
      http.post(url('/carts/current/items'), () => {
        lensAtRequest.push(useOnlineCartStore.getState().lines.length);
        return undefined; // nhả xuống handler thật
      }),
    );
    const r = await reorderOnlineOrder(order.id);
    expect(lensAtRequest).toEqual([0, 0]); // trong lúc gọi API store vẫn trống
    expect(r.cart!.items.map((i) => i.variantId)).toEqual(storeVariants());
    expect(useOnlineCartStore.getState().fulfillmentType).toBe('Delivery');
    expect(useOnlineCartStore.getState().lines.map((l) => l.quantity)).toEqual([1, 2]);
  });

  it('store đồng bộ với server: syncOnlineCart(lines của store) không xoá/thêm gì (usePricing sẽ không làm mất món vừa đặt lại)', async () => {
    const order = sample();
    await reorderOnlineOrder(order.id);
    const before = activeCart()!.items.map((i) => i.id);
    calls.length = 0;
    const synced = await syncOnlineCart({ fulfillmentType: 'Delivery', branchId: ONLINE_BRANCH_ID, lines: useOnlineCartStore.getState().lines });
    expect(synced.items.map((i) => i.id)).toEqual(before);
    expect(calls.filter((c) => ['DELETE', 'PUT', 'POST'].includes(c.method) && c.path.includes('/items'))).toEqual([]);
  });

  it('đơn Pickup → giỏ Online Pickup', async () => {
    const order = db.orders.find((o) => o.userId === A && o.fulfillmentType === 'Pickup' && o.status === 'Completed')!;
    const r = await reorderOnlineOrder(order.id);
    expect(r.status).toBe('added_all');
    expect(activeCart()).toMatchObject({ fulfillmentType: 'Pickup', status: 'Active' });
    expect(useOnlineCartStore.getState().fulfillmentType).toBe('Pickup');
  });
});

describe('giữ source = Online, không đụng giỏ Dine-in', () => {
  it('giỏ tạo ra là giỏ Online của user; giỏ QR và store Dine-in nguyên vẹn', async () => {
    const qrBefore = JSON.stringify(db.carts);
    useDineInCartStore.getState().addLine(latte, 3);
    const dineBefore = JSON.stringify(useDineInCartStore.getState().lines);

    const r = await reorderOnlineOrder(sample().id);

    expect(r.cart).toMatchObject({ cartSource: 'Online', userId: A });
    expect(activeCart()).toBeDefined();
    expect(JSON.stringify(db.carts)).toBe(qrBefore);
    expect(JSON.stringify(useDineInCartStore.getState().lines)).toBe(dineBefore);
    for (const c of cartCalls()) expect(c.search === '?source=Online' || (c.method === 'POST' && c.path === '/api/carts')).toBe(true);
  });

  it('đơn Dine-in của chính khách không đặt lại được: không gọi bất kỳ API giỏ nào', async () => {
    const dine = db.orders.find((o) => o.fulfillmentType === 'Dine_In')!;
    dine.userId = A;
    const r = await reorderOnlineOrder(dine.id);
    expect(r.status).toBe('not_reorderable');
    expect(r.canProceedToCheckout).toBe(false);
    expect(cartCalls()).toEqual([]);
    expect(activeCart()).toBeUndefined();
  });

  it('đơn của người khác → ApiError 404 từ API, không có giỏ nào được tạo, store trống', async () => {
    const theirs = db.orders.find((o) => o.userId === B)!;
    const e = await reorderOnlineOrder(theirs.id).catch((x: unknown) => x);
    expect(isApiError(e) && [e.status, e.code]).toEqual([404, 'ORDER_NOT_FOUND']);
    expect(cartCalls()).toEqual([]);
    expect(useOnlineCartStore.getState().lines).toEqual([]);
  });
});

describe('không gửi giá; giá do server xác định lại', () => {
  it('body mỗi món chỉ có variant_id, quantity, note, options[{option_id, quantity}] — kể cả khi đơn cũ mang giá lạ', async () => {
    const order = sample();
    for (const i of order.items) Object.assign(i, { unitPrice: 1, optionsUnitTotal: 1, lineTotal: 1, discountAmount: 1 });
    await reorderOnlineOrder(order.id);

    for (const c of itemPosts()) {
      const body = JSON.parse(await c.body) as Record<string, unknown>;
      expect(Object.keys(body).every((k) => ['variant_id', 'quantity', 'note', 'options'].includes(k))).toBe(true);
      expect(body).toHaveProperty('variant_id');
      expect(body).not.toHaveProperty('unit_price');
      expect(JSON.stringify(body)).not.toMatch(/price|total|amount|discount/i);
      for (const o of body.options as Record<string, unknown>[]) expect(Object.keys(o).sort()).toEqual(['option_id', 'quantity']);
    }
  });

  it('giá đổi sau khi đặt đơn cũ: giỏ + store dùng giá HIỆN TẠI của server, không phải giá snapshot của đơn cũ', async () => {
    const order = sample();
    const old = order.items.find((i) => i.variantId === TRA_DAO)!;
    const { variant } = findVariant(TRA_DAO)!;
    const originalPrice = variant.price;
    variant.price = originalPrice + 7_000;
    try {
      old.unitPrice = originalPrice; // snapshot cũ
      const r = await reorderOnlineOrder(order.id);
      const item = r.cart!.items.find((i) => i.variantId === TRA_DAO)!;
      expect(item.unitPrice).toBe(originalPrice + 7_000);
      expect(item.unitPrice).not.toBe(old.unitPrice);
      const line = useOnlineCartStore.getState().lines.find((l) => l.variantId === TRA_DAO)!;
      expect(line.unitPrice).toBe(originalPrice + 7_000);
      expect(line.serverLineTotal).toBe(item.lineTotal);
      expect(r.cart!.pricing!.subTotal).toBe(r.cart!.items.reduce((s, i) => s + (i.lineTotal ?? 0), 0));
    } finally {
      variant.price = originalPrice;
    }
  });
});

describe('lỗi từng món', () => {
  it('món hết hàng (422 OUT_OF_STOCK) được ghi riêng kèm tên + thông điệp API; món hợp lệ vẫn được thêm; giỏ + store giữ món thành công', async () => {
    unavailable(CROISSANT);
    const r = await reorderOnlineOrder(sample().id);

    expect(r.status).toBe('partial');
    expect(r.canProceedToCheckout).toBe(true);
    expect(r.added.map((a) => a.variantId)).toEqual([TRA_DAO]);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0]).toMatchObject({ variantId: CROISSANT, status: 422, code: 'OUT_OF_STOCK', reason: 'out_of_stock', quantity: 2 });
    expect(r.failed[0]!.productName).not.toBe('');
    expect(r.failed[0]!.serverMessage).toContain('hết hàng');
    expect(describeFailure(r.failed[0]!)).toContain(r.failed[0]!.productName);
    expect(describeFailure(r.failed[0]!)).toContain(r.failed[0]!.serverMessage!);
    expect(activeCart()!.items.map((i) => i.variantId)).toEqual([TRA_DAO]); // không rollback
    expect(storeVariants()).toEqual([TRA_DAO]);
    expect(itemPosts()).toHaveLength(2); // đã thử cả hai món
    const notice = summarizeReorder(r);
    expect(notice.tone).toBe('warning');
    expect(notice.details).toEqual([describeFailure(r.failed[0]!)]);
  });

  it('món ĐẦU lỗi không làm dừng: các món sau vẫn được thêm', async () => {
    unavailable(TRA_DAO);
    const r = await reorderOnlineOrder(sample().id);
    expect(r.failed.map((f) => f.variantId)).toEqual([TRA_DAO]);
    expect(r.added.map((a) => a.variantId)).toEqual([CROISSANT]);
    expect(activeCart()!.items.map((i) => i.variantId)).toEqual([CROISSANT]);
  });

  it('món không còn tồn tại (404) → not_found; option không hợp lệ (400) → rejected; cả hai không chặn món còn lại', async () => {
    const order = sample();
    order.items.find((i) => i.variantId === CROISSANT)!.variantId = 999_999;
    const r = await reorderOnlineOrder(order.id);
    expect(r.failed[0]).toMatchObject({ variantId: 999_999, status: 404, reason: 'not_found' });
    expect(r.added.map((a) => a.variantId)).toEqual([TRA_DAO]);

    resetWorld();
    resetAuthMock();
    seedDemoOrders();
    configureHttp({ getToken: () => mockAccessToken(A), onUnauthorized: undefined, refresh: undefined });
    const order2 = sample();
    order2.items.find((i) => i.variantId === TRA_DAO)!.options[0]!.optionId = 999_999;
    const r2 = await reorderOnlineOrder(order2.id);
    expect(r2.failed[0]).toMatchObject({ variantId: TRA_DAO, status: 400, reason: 'rejected', code: 'OPTION_NOT_FOUND' });
    expect(r2.added.map((a) => a.variantId)).toEqual([CROISSANT]);
  });

  it('422 không phải OUT_OF_STOCK (vd bắt buộc chọn option) → rejected, có thông điệp API', async () => {
    server.use(
      http.post(url('/carts/current/items'), ({ request }) => {
        const first = new URL(request.url).searchParams.get('source') === 'Online';
        return first
          ? HttpResponse.json({ success: false, error: { code: 'OPTION_REQUIRED', message: 'Vui lòng chọn mức đường' }, trace_id: 't' }, { status: 422 })
          : undefined;
      }, { once: true }),
    );
    const r = await reorderOnlineOrder(sample().id);
    expect(r.failed[0]).toMatchObject({ status: 422, code: 'OPTION_REQUIRED', reason: 'rejected', serverMessage: 'Vui lòng chọn mức đường' });
    expect(r.added).toHaveLength(1);
  });

  it('mã lỗi ngừng bán → unavailable; lỗi mạng/5xx một món → error, vẫn tiếp tục', async () => {
    expect(classifyAddError(new ApiError(409, { message: 'x', code: 'ITEM_UNAVAILABLE' }))).toMatchObject({ reason: 'unavailable' });
    server.use(http.post(url('/carts/current/items'), () => HttpResponse.error(), { once: true }));
    const r = await reorderOnlineOrder(sample().id);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0]).toMatchObject({ reason: 'error', status: 0, serverMessage: expect.any(String) });
    expect(r.added).toHaveLength(1);
    expect(r.status).toBe('partial');
  });

  it('401/403 không phải lỗi của một món: dừng hẳn và ném lỗi, store không bị đụng', async () => {
    server.use(http.post(url('/carts/current/items'), () => HttpResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'no' }, trace_id: 't' }, { status: 403 })));
    const e = await reorderOnlineOrder(sample().id).catch((x: unknown) => x);
    expect(isApiError(e) && e.status).toBe(403);
    expect(itemPosts()).toHaveLength(1);
    expect(useOnlineCartStore.getState().lines).toEqual([]);
  });
});

describe('tất cả món đều lỗi', () => {
  it('none_added: không cho sang checkout, báo lỗi, đã thử mọi món, giỏ server rỗng, store không bị đụng', async () => {
    unavailable(TRA_DAO);
    unavailable(CROISSANT);
    useOnlineCartStore.getState().setFulfillment('Delivery');
    useOnlineCartStore.getState().addLine(latte, 1); // giỏ local sẵn có của khách
    const r = await reorderOnlineOrder(sample().id);

    expect(r.status).toBe('none_added');
    expect(r.canProceedToCheckout).toBe(false);
    expect(r.added).toEqual([]);
    expect(r.failed.map((f) => f.variantId)).toEqual([TRA_DAO, CROISSANT]);
    expect(itemPosts()).toHaveLength(2);
    expect(activeCart()!.items).toEqual([]);
    expect(storeVariants()).toEqual([latte.variantId]); // không thay bằng đơn cũ
    const notice = summarizeReorder(r);
    expect(notice.tone).toBe('error');
    expect(notice.title).toContain('không có món nào');
    expect(notice.details).toHaveLength(2);
  });

  it('tất cả lỗi vì giỏ biến mất giữa chừng (404 chung) → ném lỗi thay vì báo sai là "món không tồn tại"', async () => {
    server.use(http.get(url('/carts/current'), ({ request }) => (calls.some((c) => c.method === 'POST' && c.path === '/api/carts') && new URL(request.url).searchParams.get('source') === 'Online'
      ? HttpResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Chưa có giỏ' }, trace_id: 't' }, { status: 404 })
      : undefined)));
    const e = await reorderOnlineOrder(sample().id).catch((x: unknown) => x);
    expect(isApiError(e) && e.status).toBe(404);
  });
});

describe('giỏ Online đang có món', () => {
  async function seedExistingCart() {
    const ctx = { source: 'Online', fulfillmentType: 'Pickup' } as const;
    await orderApi.ensureCart(ctx, ONLINE_BRANCH_ID);
    await orderApi.addCartItem(ctx, { variantId: 12, quantity: 1, options: [{ optionId: 101 }, { optionId: 104 }] });
  }

  it('mặc định thay thế: giỏ cũ bị Abandoned, giỏ mới chỉ có các món đặt lại', async () => {
    await seedExistingCart();
    const oldCart = activeCart()!;
    const r = await reorderOnlineOrder(sample().id);
    expect(r.status).toBe('added_all');
    expect(oldCart.status).toBe('Abandoned');
    expect(activeCart()!.id).not.toBe(oldCart.id);
    expect(activeCart()!.fulfillmentType).toBe('Delivery');
    expect(activeCart()!.items.map((i) => i.variantId)).toEqual([TRA_DAO, CROISSANT]);
  });

  it('replaceExisting=false: dừng ở "blocked", KHÔNG gửi thay đổi nào (không xoá, không thêm), giỏ cũ nguyên vẹn', async () => {
    await seedExistingCart();
    const before = JSON.stringify(db.onlineCarts);
    calls.length = 0;
    const r = await reorderOnlineOrder(sample().id, { replaceExisting: false });
    expect(r).toMatchObject({ status: 'blocked', existingCartItemCount: 1, canProceedToCheckout: false });
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
    expect(JSON.stringify(db.onlineCarts)).toBe(before);
    expect(summarizeReorder(r).title).toContain('1 món');
  });
});

describe('chuẩn hoá đơn cũ', () => {
  it('món thưởng loyalty bị bỏ qua (ghi nhận skipped, không gửi lên server)', async () => {
    const order = sample();
    order.items.find((i) => i.variantId === CROISSANT)!.isRewardItem = true;
    const r = await reorderOnlineOrder(order.id);
    expect(r.skipped).toMatchObject([{ variantId: CROISSANT, reason: 'reward_item' }]);
    expect(itemPosts()).toHaveLength(1);
    expect(r.status).toBe('added_all');
  });

  it('đơn chỉ có món thưởng → nothing_to_reorder, không gọi API giỏ', async () => {
    const order = sample();
    for (const i of order.items) i.isRewardItem = true;
    const r = await reorderOnlineOrder(order.id);
    expect(r.status).toBe('nothing_to_reorder');
    expect(cartCalls()).toEqual([]);
  });

  it('hai dòng giống hệt (cùng variant + option + ghi chú) → gộp thành MỘT lần thêm với số lượng cộng dồn', async () => {
    const order = sample();
    const croissant = order.items.find((i) => i.variantId === CROISSANT)!;
    order.items.push({ ...croissant, id: 99_001, quantity: 3 });
    await reorderOnlineOrder(order.id);
    const bodies = await Promise.all(itemPosts().map(async (c) => JSON.parse(await c.body) as { variant_id: number; quantity: number }));
    expect(bodies.filter((b) => b.variant_id === CROISSANT)).toEqual([expect.objectContaining({ quantity: 5 })]);
    expect(activeCart()!.items.find((i) => i.variantId === CROISSANT)!.quantity).toBe(5);
  });

  it('ghi chú món được giữ và gửi đã trim', async () => {
    const order = sample();
    order.items.find((i) => i.variantId === TRA_DAO)!.note = '  ít đá  ';
    await reorderOnlineOrder(order.id);
    expect(JSON.parse(await itemPosts()[0]!.body)).toMatchObject({ variant_id: TRA_DAO, note: 'ít đá' });
    expect(useOnlineCartStore.getState().lines.find((l) => l.variantId === TRA_DAO)!.note).toBe('ít đá');
  });
});
