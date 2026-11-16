import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { catalogApi, isApiError, orderApi, storeApi } from '@/shared/api';
import { resetDb } from '../db';
import { mockConfig } from '../utils';
import { handlers } from './index';

// Chạy với: VITE_API_BASE_URL=http://localhost/api vitest
const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(() => {
  resetDb();
  mockConfig.latencyMs = 0;
});
afterEach(() => server.resetHandlers());

describe('GET /catalog/categories', () => {
  it('trả danh mục theo sortOrder, đủ cho mọi categoryId của món', async () => {
    const cats = await catalogApi.listCategories();
    expect(cats.map((c) => c.sortOrder)).toEqual([...cats.map((c) => c.sortOrder)].sort((a, b) => a - b));
    const menu = await catalogApi.listProducts({ branchId: 1, includeUnavailable: true });
    const ids = new Set(cats.map((c) => c.id));
    expect(menu.every((p) => ids.has(p.categoryId))).toBe(true);
  });
});

describe('GET /catalog/products/:id', () => {
  it('trả variant + option group kèm khả dụng', async () => {
    const d = await catalogApi.getProduct(1, 1);
    expect(d.variants.map((v) => v.variantName)).toEqual(['S', 'M', 'L']);
    expect(d.optionGroups.map((g) => g.name)).toEqual(['Đường', 'Topping']);
    expect(d.optionGroups[0]).toMatchObject({ isRequired: true, selectionType: 'Single' });
    expect(d.optionGroups[1]?.options.map((o) => o.id)).toEqual([104, 105, 106]);
  });

  it('variant hết hàng có isAvailable=false; món không có option → optionGroups rỗng', async () => {
    expect((await catalogApi.getProduct(4, 1)).variants[0]?.isAvailable).toBe(false);
    expect((await catalogApi.getProduct(7, 1)).optionGroups).toEqual([]);
  });

  it('món không tồn tại → 404, thiếu branchId → 400', async () => {
    const e1 = await catalogApi.getProduct(999, 1).catch((e: unknown) => e);
    expect(isApiError(e1) && [e1.status, e1.code]).toEqual([404, 'PRODUCT_NOT_FOUND']);
    const e2 = await catalogApi.getProduct(1, 0).catch((e: unknown) => e);
    expect(isApiError(e2) && e2.status).toBe(400);
  });
});

describe('dữ liệu giỏ → đặt đơn (tương thích giai đoạn 2)', () => {
  it('lines từ cart được createOrder chấp nhận', async () => {
    const session = await storeApi.openTableSession({ qrCode: 'QR-B1-T01' });
    const order = await orderApi.createOrder({
      orderSource: 'QR', fulfillmentType: 'Dine_In', branchId: 1, tableSessionId: session.id,
      lines: [{ variantId: 12, quantity: 2, options: [{ optionId: 101, quantity: 1 }, { optionId: 104, quantity: 1 }] }],
    });
    expect(order.finalAmount).toBe(2 * (35_000 + 10_000));
  });
});
