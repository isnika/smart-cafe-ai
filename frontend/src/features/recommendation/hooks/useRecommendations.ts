import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { DINE_IN_BRANCH_ID } from '@/features/dine-in/config';
import { useDineInCartStore } from '@/features/dine-in/store';
import { useOnlineCartStore } from '@/features/online-order/store';
import { intelligenceApi } from '@/shared/api';
import { RECOMMENDATION_LIMIT, selectRecommendations } from '../model';

export const RECOMMENDATIONS_KEY = ['intelligence', 'recommendations'] as const;

export type RecommendationState = 'disabled' | 'loading' | 'error' | 'empty' | 'ready';

interface Options {
  excludeProductId?: number;
  limit?: number;
}

/** Gợi ý cá nhân hóa hoặc món tương tự từ AI Gateway; khách vãng lai không gửi request. */
export function useRecommendations({ excludeProductId, limit = RECOMMENDATION_LIMIT }: Options = {}) {
  const user = useAuthStore((state) => state.user);
  const roleName = useAuthStore((state) => state.roleName);
  const userId = user?.id;
  const enabled = !!userId && roleName === 'Customer';
  const dineInBranchId = useDineInCartStore((state) => state.branchId);
  const onlineBranchId = useOnlineCartStore((state) => state.branchId);
  const branchId = dineInBranchId ?? onlineBranchId ?? DINE_IN_BRANCH_ID;
  const mode = excludeProductId === undefined ? 'personalized' : 'similar';
  const recommendations = useQuery({
    queryKey: [...RECOMMENDATIONS_KEY, userId, branchId, mode, excludeProductId, limit],
    enabled,
    queryFn: () => intelligenceApi.getRecommendations({
      mode,
      ...(excludeProductId === undefined ? {} : { productId: excludeProductId }),
      topK: limit,
    }, branchId),
  });

  const items = useMemo(() => selectRecommendations(
    (recommendations.data?.recommendations ?? []).map((item) => ({
      id: item.productId,
      productId: item.productId,
      confidenceScore: item.score ?? 0,
      reason: item.reason,
      product: {
        id: item.productId,
        name: item.name,
        image: item.image ?? null,
        price: item.priceVnd ?? null,
        maxPrice: item.priceVnd ?? null,
      },
    })),
    { excludeProductId, limit },
  ), [recommendations.data, excludeProductId, limit]);

  const state: RecommendationState = !enabled
    ? 'disabled'
    : recommendations.isPending
      ? 'loading'
      : recommendations.isError
        ? 'error'
        : items.length > 0
          ? 'ready'
          : 'empty';

  return {
    state,
    items,
    error: recommendations.error,
    refetch: () => void recommendations.refetch(),
  };
}
