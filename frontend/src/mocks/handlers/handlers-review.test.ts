import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { engagementApi, isApiError } from '@/shared/api';
import { db, resetDb } from '../db';
import { mockConfig } from '../utils';
import { handlers } from './index';

const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(() => {
  resetDb();
  mockConfig.latencyMs = 0;
});
afterEach(() => server.resetHandlers());

describe('GET /engagement/products/:id/reviews', () => {
  it('chỉ trả review Approved (ẩn Hidden), mới nhất trước, kèm tổng và điểm trung bình toàn bộ', async () => {
    const page = await engagementApi.listProductReviews(1, { page: 1, pageSize: 50 });
    expect(page.total).toBe(7);
    expect(page.items).toHaveLength(7);
    expect(page.items.every((r) => r.productId === 1 && r.status === 'Approved' && r.authorName)).toBe(true);
    expect(page.items.some((r) => r.status === 'Hidden')).toBe(false);
    const times = page.items.map((r) => Date.parse(r.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(page.averageRating).toBeCloseTo(31 / 7, 1); // (5+5+4+5+3+4+5)/7
    expect(db.reviews.some((r) => r.productId === 1 && r.status === 'Hidden')).toBe(true); // seed có review ẩn thật
  });

  it('phân trang: averageRating/total không đổi giữa các trang; trang cuối ít hơn pageSize', async () => {
    const p1 = await engagementApi.listProductReviews(1, { page: 1, pageSize: 5 });
    const p2 = await engagementApi.listProductReviews(1, { page: 2, pageSize: 5 });
    const p3 = await engagementApi.listProductReviews(1, { page: 3, pageSize: 5 });
    expect([p1.items.length, p2.items.length, p3.items.length]).toEqual([5, 2, 0]);
    expect(p2.total).toBe(p1.total);
    expect(p2.averageRating).toBe(p1.averageRating);
    expect(new Set([...p1.items, ...p2.items].map((r) => r.id)).size).toBe(7);
  });

  it('timestamp naive của mock được http client chuẩn hoá thành UTC (có Z)', async () => {
    const page = await engagementApi.listProductReviews(1);
    expect(page.items.every((r) => r.createdAt.endsWith('Z'))).toBe(true);
  });

  it('món chưa có review → trang rỗng, averageRating null; review chỉ có điểm có comment = null', async () => {
    expect(await engagementApi.listProductReviews(3)).toMatchObject({ items: [], total: 0, averageRating: null });
    const bacXiu = await engagementApi.listProductReviews(2);
    expect(bacXiu.items.some((r) => r.comment === null)).toBe(true);
  });

  it('món không tồn tại → 404; id/page/pageSize sai → 400', async () => {
    const notFound = await engagementApi.listProductReviews(999).catch((e: unknown) => e);
    expect(isApiError(notFound) && [notFound.status, notFound.code]).toEqual([404, 'PRODUCT_NOT_FOUND']);
    const badId = await engagementApi.listProductReviews(0).catch((e: unknown) => e);
    expect(isApiError(badId) && badId.status).toBe(400);
    const badPage = await engagementApi.listProductReviews(1, { page: 0 }).catch((e: unknown) => e);
    expect(isApiError(badPage) && badPage.status).toBe(400);
    const badSize = await engagementApi.listProductReviews(1, { pageSize: -5 }).catch((e: unknown) => e);
    expect(isApiError(badSize) && badSize.status).toBe(400);
  });
});
