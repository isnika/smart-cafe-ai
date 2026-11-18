import { useMemo } from 'react';
import { RECOMMENDATION_LIMIT, selectRecommendations } from '../model';

export const RECOMMENDATIONS_KEY = ['intelligence', 'recommendations'] as const;

/**
 * disabled: không có gợi ý cho người này (khách vãng lai / không phải khách hàng) → không gọi API.
 * empty   : đã đăng nhập nhưng AI chưa có gợi ý ("AI đang học dữ liệu").
 */
export type RecommendationState = 'disabled' | 'loading' | 'error' | 'empty' | 'ready';

interface Options {
  excludeProductId?: number;
  limit?: number;
}

/**
 * Chưa bật gợi ý cá nhân hóa vì backend hiện chưa cung cấp endpoint tương ứng.
 */
export function useRecommendations({ excludeProductId, limit = RECOMMENDATION_LIMIT }: Options = {}) {
  // API Gateway / Intelligence Service hiện chưa có /recommendations/me hoặc tracking route.
  // Không bắn request đã biết trả 404 liên tục; bật lại khi backend cung cấp contract này.
  const items = useMemo(() => selectRecommendations([], { excludeProductId, limit }), [excludeProductId, limit]);
  return { state: 'disabled' as const, items, error: null, refetch: () => undefined };
}

/** Ghi nhận click kiểu fire-and-forget: không chờ, không chặn điều hướng; lỗi chỉ log, không ảnh hưởng UX. */
export function trackClick(recommendationId: number): void {
  void recommendationId;
}
