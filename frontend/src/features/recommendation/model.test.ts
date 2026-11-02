import { describe, expect, it } from 'vitest';
import type { MenuProduct, RecommendationView } from '@/shared/types';
import { selectRecommendations } from './model';

const product = (id: number): MenuProduct => ({
  id, categoryId: 1, name: `Món ${id}`, status: 'Active', sortOrder: id, price: 30_000, maxPrice: 30_000, isAvailable: true,
} as MenuProduct);

const rec = (id: number, productId: number, confidenceScore: number): RecommendationView => ({
  id, userId: 'u', productId, recommendationType: 'Personalized', confidenceScore, modelVersion: 'v', createdAt: '2026-01-01T00:00:00Z', product: product(productId),
});

describe('selectRecommendations', () => {
  const rows = [rec(1, 10, 0.5), rec(2, 11, 0.9), rec(3, 12, 0.7), rec(4, 13, 0.7)];

  it('sắp theo điểm giảm dần, đồng điểm thì theo id', () => {
    expect(selectRecommendations(rows).map((r) => r.id)).toEqual([2, 3, 4, 1]);
  });

  it('loại món đang xem và cắt theo limit', () => {
    expect(selectRecommendations(rows, { excludeProductId: 11 }).map((r) => r.productId)).toEqual([12, 13, 10]);
    expect(selectRecommendations(rows, { limit: 2 }).map((r) => r.id)).toEqual([2, 3]);
    expect(selectRecommendations(rows, { limit: 0 })).toEqual([]);
  });

  it('mỗi món chỉ một thẻ (giữ điểm cao nhất)', () => {
    const dup = [rec(1, 10, 0.4), rec(2, 10, 0.8), rec(3, 11, 0.6)];
    expect(selectRecommendations(dup).map((r) => r.id)).toEqual([2, 3]);
  });

  it('không đổi mảng đầu vào; rỗng → rỗng', () => {
    const copy = [...rows];
    selectRecommendations(rows);
    expect(rows).toEqual(copy);
    expect(selectRecommendations([])).toEqual([]);
  });
});
