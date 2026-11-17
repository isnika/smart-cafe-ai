import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { DINE_IN_BRANCH_ID } from '@/features/dine-in/config';
import { intelligenceApi } from '@/shared/api';
import type { RecommendationView } from '@/shared/types';
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
 * Gợi ý AI cho khách đang đăng nhập (GET /intelligence/recommendations/me).
 * - queryKey chỉ gồm người dùng + chi nhánh; việc loại món đang xem làm ở client, nên đổi món ở ProductDetail
 *   dùng lại cache, không có request mới nào để "đua" với request cũ. React Query tự bỏ kết quả của key không còn dùng
 *   và huỷ request đang bay khi không còn ai theo dõi (signal được truyền xuống fetch).
 */
export function useRecommendations({ excludeProductId, limit = RECOMMENDATION_LIMIT }: Options = {}) {
  const authed = useAuthStore((s) => s.status === 'authenticated' && s.roleName === 'Customer');
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const enabled = authed && userId !== null;

  const query = useQuery<RecommendationView[]>({
    queryKey: [...RECOMMENDATIONS_KEY, userId, DINE_IN_BRANCH_ID],
    enabled,
    queryFn: ({ signal }) => intelligenceApi.listRecommendations(DINE_IN_BRANCH_ID, signal),
  });

  const items = useMemo(
    () => selectRecommendations(query.data ?? [], { excludeProductId, limit }),
    [query.data, excludeProductId, limit],
  );

  let state: RecommendationState;
  if (!enabled) state = 'disabled';
  else if (query.data === undefined) state = query.isError ? 'error' : 'loading';
  else state = items.length === 0 ? 'empty' : 'ready';

  return { state, items, error: query.error, refetch: () => void query.refetch() };
}

/** Ghi nhận click kiểu fire-and-forget: không chờ, không chặn điều hướng; lỗi chỉ log, không ảnh hưởng UX. */
export function trackClick(recommendationId: number): void {
  intelligenceApi.trackRecommendationClick(recommendationId).catch((error: unknown) => {
    console.warn('[recommendation] không ghi nhận được lượt bấm', recommendationId, error);
  });
}
