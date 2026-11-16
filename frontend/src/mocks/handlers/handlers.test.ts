import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { catalogApi, isApiError, orderApi, storeApi } from '@/shared/api';
import type { ApiError } from '@/shared/api';
import type { CreateQrDineInOrderInput } from '@/shared/types';
import { bumpVersion, db, resetDb } from '../db';
import { mockConfig } from '../utils';
import { handlers } from './index';

// Chạy với: VITE_API_BASE_URL=http://localhost/api vitest  (Node fetch cần URL tuyệt đối)
const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(() => {
  resetDb();
  mockConfig.latencyMs = 0;
  mockConfig.enforceAuth = false;
});
afterEach(() => server.resetHandlers());

async function openSession() {
  return storeApi.openTableSession({ qrCode: 'QR-B1-T01' });
}
async function placeQrOrder(overrides: Partial<CreateQrDineInOrderInput> = {}) {
  const session = await openSession();
  return orderApi.createOrder({
    orderSource: 'QR', fulfillmentType: 'Dine_In', branchId: 1, tableSessionId: session.id,
    lines: [{ variantId: 12, quantity: 2, options: [{ optionId: 101 }, { optionId: 104 }] }], // M, 100% đường, trân châu
    ...overrides,
  });
}
const expectApiError = async (p: Promise<unknown>, status: number, code: string) => {
  const err = (await p.then(() => null, (e: unknown) => e)) as ApiError | null;
  expect(isApiError(err)).toBe(true);
  expect([err?.status, err?.code]).toEqual([status, code]);
};

describe('GET /catalog/products', () => {
  it('ẩn món hết hàng mặc định, hiện khi includeUnavailable', async () => {
    const menu = await catalogApi.listProducts({ branchId: 1 });
    expect(menu.map((p) => p.name)).not.toContain('Matcha latte');
    const all = await catalogApi.listProducts({ branchId: 1, includeUnavailable: true });
    expect(all.find((p) => p.name === 'Matcha latte')?.isAvailable).toBe(false);
  });
  it('price = MIN/MAX variant Active, null khi không còn variant Active', async () => {
    const all = await catalogApi.listProducts({ branchId: 1, includeUnavailable: true });
    expect(all.find((p) => p.id === 1)).toMatchObject({ price: 29000, maxPrice: 39000 });
    expect(all.find((p) => p.id === 8)).toMatchObject({ price: null, maxPrice: null, isAvailable: false });
  });
  it('tìm không dấu + lọc flavor', async () => {
    expect((await catalogApi.listProducts({ branchId: 1, q: 'ca phe' })).map((p) => p.id)).toEqual([1]);
    expect((await catalogApi.listProducts({ branchId: 1, flavor: 'creamy' })).map((p) => p.id)).toEqual([1, 2]);
  });
});

describe('POST /store/table-sessions', () => {
  it('lần đầu 201, quét lại thì nối lại đúng session', async () => {
    const a = await openSession();
    const b = await storeApi.openTableSession({ qrCode: 'QR-B1-T01', customerId: 'u-1' });
    expect(b.id).toBe(a.id);
    expect(b.customerId).toBe('u-1');
  });
  it('QR sai → 404, bàn khoá → 409', async () => {
    await expectApiError(storeApi.openTableSession({ qrCode: 'nope' }), 404, 'TABLE_NOT_FOUND');
    await expectApiError(storeApi.openTableSession({ qrCode: 'QR-B1-T06' }), 409, 'TABLE_INACTIVE');
  });
});

describe('POST /orders-svc/orders', () => {
  it('tính tiền đúng + timestamp được chuẩn hoá thành UTC', async () => {
    const o = await placeQrOrder();
    expect(o).toMatchObject({ status: 'Pending', version: 1, tableNumber: '01', subTotal: 2 * (35000 + 10000), finalAmount: 90000 });
    expect(o.createdAt.endsWith('Z')).toBe(true);
  });
  it('thiếu option bắt buộc → 422 OPTION_REQUIRED', async () => {
    await expectApiError(placeQrOrder({ lines: [{ variantId: 12, quantity: 1 }] }), 422, 'OPTION_REQUIRED');
  });
  it('món hết hàng → 409 ITEM_UNAVAILABLE', async () => {
    await expectApiError(placeQrOrder({ lines: [{ variantId: 41, quantity: 1, options: [{ optionId: 401 }] }] }), 409, 'ITEM_UNAVAILABLE');
  });
  it('cùng idempotencyKey → trả lại đơn cũ', async () => {
    const a = await placeQrOrder({ idempotencyKey: 'k1' });
    const b = await placeQrOrder({ idempotencyKey: 'k1' });
    expect(b.id).toBe(a.id);
    expect(db.orders).toHaveLength(1);
  });
});

describe('PATCH /orders-svc/orders/:id/status', () => {
  it('happy path: tăng version, ghi history', async () => {
    const o = await placeQrOrder();
    const next = await orderApi.changeOrderStatus(o.id, { to: 'Confirmed', version: o.version });
    expect(next).toMatchObject({ status: 'Confirmed', version: 2 });
    expect(next.statusHistory.at(-1)).toMatchObject({ fromStatus: 'Pending', status: 'Confirmed' });
  });
  it('lệch version → 409 VERSION_CONFLICT (kiểm tra trước transition)', async () => {
    const o = await placeQrOrder();
    bumpVersion(o.id);
    await expectApiError(orderApi.changeOrderStatus(o.id, { to: 'Served', version: 1 }), 409, 'VERSION_CONFLICT');
  });
  it('sai transition → 409 INVALID_TRANSITION', async () => {
    const o = await placeQrOrder();
    await expectApiError(orderApi.changeOrderStatus(o.id, { to: 'Served', version: 1 }), 409, 'INVALID_TRANSITION');
  });
  it('Cancelled/Rejected bắt buộc note → 400', async () => {
    const o = await placeQrOrder();
    await expectApiError(orderApi.changeOrderStatus(o.id, { to: 'Rejected', version: 1 }), 400, 'VALIDATION_ERROR');
    const done = await orderApi.changeOrderStatus(o.id, { to: 'Rejected', version: 1, note: 'Hết nguyên liệu' });
    expect(done).toMatchObject({ status: 'Rejected', cancelReason: 'Hết nguyên liệu' });
  });
  it('đơn không tồn tại → 404; enforceAuth bật mà thiếu token → 401', async () => {
    await expectApiError(orderApi.changeOrderStatus(999, { to: 'Confirmed', version: 1 }), 404, 'ORDER_NOT_FOUND');
    mockConfig.enforceAuth = true;
    await expectApiError(orderApi.changeOrderStatus(1, { to: 'Confirmed', version: 1 }), 401, 'UNAUTHORIZED');
  });
});