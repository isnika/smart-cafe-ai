import { http, HttpResponse } from 'msw';
import type { ProductReviewPage } from '@/shared/types';
import { db } from '../db';
import { fail, guarded, url } from '../utils';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

/** null (không có tham số) → mặc định; có tham số mà không phải số nguyên dương → 400. */
function positiveInt(raw: string | null, fallback: number, name: string): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) fail(400, 'VALIDATION_ERROR', `${name} phải là số nguyên dương`);
  return n;
}

export const reviewHandlers = [
  // GET /engagement/products/:id/reviews?page=&pageSize=  → ProductReviewPage (công khai, chỉ review Approved, mới nhất trước)
  http.get(
    url('/engagement/products/:id/reviews'),
    guarded(({ request, params }) => {
      const productId = Number(params.id);
      if (!Number.isInteger(productId) || productId < 1) fail(400, 'VALIDATION_ERROR', 'productId không hợp lệ');
      if (!db.products.some((s) => s.product.id === productId && s.product.status === 'Active')) {
        fail(404, 'PRODUCT_NOT_FOUND', `Không tìm thấy món ${String(params.id)}`);
      }

      const sp = new URL(request.url).searchParams;
      const page = positiveInt(sp.get('page'), 1, 'page');
      const pageSize = Math.min(positiveInt(sp.get('pageSize'), DEFAULT_PAGE_SIZE, 'pageSize'), MAX_PAGE_SIZE);

      const approved = db.reviews
        .filter((r) => r.productId === productId && r.status === 'Approved')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
      const average = approved.length ? approved.reduce((sum, r) => sum + r.rating, 0) / approved.length : null;

      const body: ProductReviewPage = {
        items: approved.slice((page - 1) * pageSize, page * pageSize),
        total: approved.length,
        page,
        pageSize,
        averageRating: average === null ? null : Math.round(average * 100) / 100,
      };
      return HttpResponse.json(body);
    }),
  ),
];
