// @vitest-environment jsdom
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handlers } from '@/mocks/handlers';
import { url } from '@/mocks/utils';
import { resetWorld, TABLE_CODE } from '@/test/helpers';
import { useAuthStore } from '@/features/auth/store';
import { CLIENT_KEY_STORAGE, getClientKey, guestHeaders, resetGuestMemory } from './guest';
import { orderApi, storeApi } from './index';
import { toOrderDetail, toQrCart } from './order';

const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

interface Seen {
  method: string;
  path: string;
  search: string;
  headers: Headers;
  body: unknown;
}
let seen: Seen[] = [];
beforeEach(() => {
  resetWorld();
  server.events.removeAllListeners();
  seen = [];
  server.events.on('request:start', async ({ request }) => {
    const u = new URL(request.url);
    const text = await request.clone().text();
    seen.push({ method: request.method, path: u.pathname.replace(/^\/api/, ''), search: u.search, headers: request.headers, body: text ? JSON.parse(text) : undefined });
  });
});
const flush = () => new Promise((r) => setTimeout(r, 0));
const last = () => seen[seen.length - 1]!;

describe('client key', () => {
  it('sinh một lần, lưu localStorage và tái dùng (kể cả sau khi RAM bị xoá)', () => {
    const a = getClientKey();
    expect(a).toMatch(/\S{8,}/);
    expect(localStorage.getItem(CLIENT_KEY_STORAGE)).toBe(a);
    expect(getClientKey()).toBe(a);
    resetGuestMemory(); // giả lập reload trang
    expect(getClientKey()).toBe(a);
  });

  it('storage bị chặn (throw) → vẫn ổn định trong phiên chạy, không crash', () => {
    const orig = Storage.prototype.getItem;
    const origSet = Storage.prototype.setItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
    try {
      const a = getClientKey();
      expect(getClientKey()).toBe(a);
    } finally {
      Storage.prototype.getItem = orig;
      Storage.prototype.setItem = origSet;
    }
  });

  it('guestHeaders: luôn có mã phiên; chỉ call giỏ mới có X-Client-Key', () => {
    expect(guestHeaders('abc')).toEqual({ 'X-Table-Session-Code': 'abc' });
    expect(guestHeaders('abc', { clientKey: true })).toEqual({ 'X-Table-Session-Code': 'abc', 'X-Client-Key': getClientKey() });
  });
});

describe('headers / path / body đúng spec cho từng call', () => {
  it('Store: getQr, createQrSession, getCurrentSession, requestPayment', async () => {
    useAuthStore.setState({ accessToken: null });
    await storeApi.getQr(TABLE_CODE);
    expect(last()).toMatchObject({ method: 'GET', path: `/qr/${TABLE_CODE}` });

    const s = await storeApi.createQrSession(TABLE_CODE);
    await flush();
    expect(last()).toMatchObject({ method: 'POST', path: `/qr/${TABLE_CODE}/sessions`, body: undefined });
    expect(last().headers.get('Authorization')).toBeNull();

    await storeApi.getCurrentSession(s.sessionCode);
    expect(last().path).toBe('/table-sessions/current');
    expect(last().headers.get('X-Table-Session-Code')).toBe(s.sessionCode);
    expect(last().headers.get('X-Client-Key')).toBeNull();

    await storeApi.requestPayment(s.sessionCode);
    expect(last()).toMatchObject({ method: 'POST', path: '/table-sessions/current/request-payment' });
    expect(last().headers.get('X-Table-Session-Code')).toBe(s.sessionCode);
  });

  it('Giỏ: mọi call gửi ?source=QR + X-Table-Session-Code + X-Client-Key; body snake_case đúng spec', async () => {
    const s = await storeApi.createQrSession(TABLE_CODE);
    const ctx = { sessionCode: s.sessionCode };
    const key = getClientKey();

    const cart = await orderApi.ensureCart(ctx, 1);
    await flush();
    expect(last()).toMatchObject({ method: 'POST', path: '/carts', search: '?source=QR', body: { cart_source: 'QR', branch_id: 1, fulfillment_type: 'Dine_In' } });

    await orderApi.getCurrentCart(ctx);
    expect(last()).toMatchObject({ method: 'GET', path: '/carts/current', search: '?source=QR' });

    const added = await orderApi.addCartItem(ctx, { variantId: 12, quantity: 2, note: ' ít đá ', options: [{ optionId: 101 }, { optionId: 104, quantity: 2 }] });
    await flush();
    expect(last()).toMatchObject({
      method: 'POST', path: '/carts/current/items', search: '?source=QR',
      body: { variant_id: 12, quantity: 2, note: 'ít đá', options: [{ option_id: 101, quantity: 1 }, { option_id: 104, quantity: 2 }] },
    });

    const itemId = added.items[0]!.id;
    await orderApi.updateCartItem(ctx, itemId, { variantId: 12, quantity: 3, options: [{ optionId: 101 }] });
    await flush();
    expect(last()).toMatchObject({ method: 'PUT', path: `/carts/current/items/${itemId}`, search: '?source=QR', body: { quantity: 3 } });

    await orderApi.removeCartItem(ctx, itemId);
    expect(last()).toMatchObject({ method: 'DELETE', path: `/carts/current/items/${itemId}`, search: '?source=QR' });
    await orderApi.clearCart(ctx);
    expect(last()).toMatchObject({ method: 'DELETE', path: '/carts/current', search: '?source=QR' });

    for (const r of seen.filter((x) => x.path.startsWith('/carts'))) {
      expect(r.headers.get('X-Table-Session-Code')).toBe(s.sessionCode);
      expect(r.headers.get('X-Client-Key')).toBe(key);
      expect(r.headers.get('Authorization')).toBeNull(); // guest: không gắn token, không refresh/logout
    }
    expect(cart.id).toBeGreaterThan(0);
  });

  it('POST /orders: Idempotency-Key + X-Table-Session-Code, body snake_case, không có số tiền', async () => {
    const s = await storeApi.createQrSession(TABLE_CODE);
    const ctx = { sessionCode: s.sessionCode };
    await orderApi.ensureCart(ctx, 1);
    await orderApi.addCartItem(ctx, { variantId: 71, quantity: 1 });
    await orderApi.createQrOrder({ cartId: 1, branchId: 1, tableSessionId: s.id, note: 'x' }, { sessionCode: s.sessionCode, idempotencyKey: 'key-1' });
    await flush();
    expect(last().headers.get('Idempotency-Key')).toBe('key-1');
    expect(last().headers.get('X-Table-Session-Code')).toBe(s.sessionCode);
    expect(last().body).toEqual({ cart_id: 1, order_source: 'QR', fulfillment_type: 'Dine_In', branch_id: 1, table_session_id: s.id, note: 'x' });
  });

  it('guest 401 không gọi refresh/onUnauthorized của lát 1', async () => {
    useAuthStore.setState({ status: 'authenticated', accessToken: 'tok', roleName: 'Customer' });
    server.use(http.get(url('/carts/current'), () => new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED', message: 'x' } }), { status: 401 })));
    await expect(orderApi.getCurrentCart({ sessionCode: 'x' })).rejects.toMatchObject({ status: 401 });
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(seen.filter((r) => r.path.includes('/auth/refresh'))).toEqual([]);
  });
});

describe('mapper', () => {
  it('toQrCart: DECIMAL dạng chuỗi → number, thiếu mảng → [], nhận `lines`', () => {
    const c = toQrCart({
      id: 5, cartSource: 'QR', branchId: 1, status: 'Active',
      items: [{ id: 1, variantId: 12, quantity: '2', unitPrice: '35000', lineTotal: '90000', options: [{ optionId: 104, extraPrice: '10000' }] }, { id: 2, variantId: 71, quantity: 1 }],
      pricing: { subTotal: '125000' },
    });
    expect(c.items[0]).toMatchObject({ quantity: 2, unitPrice: 35_000, lineTotal: 90_000 });
    expect(c.items[0]!.options[0]).toMatchObject({ optionId: 104, quantity: 1, unitPrice: 10_000 });
    expect(c.items[1]!.options).toEqual([]);
    expect(c.pricing?.subTotal).toBe(125_000);
    expect(toQrCart({ id: 1, lines: [{ id: 3, variantId: 1, quantity: 1 }] }).items).toHaveLength(1);
    expect(toQrCart({ id: 1 }).pricing).toBeNull();
  });

  it('toOrderDetail: tiền → number, items/options/history thiếu → []', () => {
    const o = toOrderDetail({ id: 1, subTotal: '100000', vatAmount: '7407', finalAmount: '100000', items: [{ id: 1, unitPrice: '35000' }], history: [{ id: 1, status: 'Pending' }] });
    expect(o).toMatchObject({ subTotal: 100_000, vatAmount: 7_407, finalAmount: 100_000 });
    expect(o.items[0]).toMatchObject({ unitPrice: 35_000, options: [] });
    expect(o.statusHistory).toHaveLength(1);
    expect(toOrderDetail({ id: 2 }).items).toEqual([]);
  });
});
