import type { RecommendationView } from '@/shared/types';

/** Số thẻ tối đa hiển thị trong một khối gợi ý. */
export const RECOMMENDATION_LIMIT = 6;

interface SelectOptions {
  /** Món đang xem (ProductDetail): không gợi ý lại chính nó. */
  excludeProductId?: number;
  limit?: number;
}

/**
 * Chuẩn hoá danh sách server trả về cho UI: bỏ món đang xem, mỗi món chỉ một thẻ (giữ điểm cao nhất),
 * điểm giảm dần rồi cắt theo `limit`. Lọc ở client nên đổi món ở ProductDetail không phải gọi lại API.
 */
export function selectRecommendations(rows: readonly RecommendationView[], { excludeProductId, limit = RECOMMENDATION_LIMIT }: SelectOptions = {}): RecommendationView[] {
  const best = new Map<number, RecommendationView>();
  for (const row of rows) {
    if (row.productId === excludeProductId) continue;
    const current = best.get(row.productId);
    if (!current || row.confidenceScore > current.confidenceScore) best.set(row.productId, row);
  }
  return [...best.values()].sort((a, b) => b.confidenceScore - a.confidenceScore || a.id - b.id).slice(0, Math.max(0, limit));
}
