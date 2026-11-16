import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { DINE_IN_BRANCH_ID } from '@/features/dine-in/config';
import { catalogApi, engagementApi, isApiError } from '@/shared/api';

/** 404 là câu trả lời cuối cùng (món không có/đã ẩn) nên không thử lại; lỗi khác thử lại 1 lần như mặc định của app. */
const retryUnlessNotFound = (failureCount: number, error: unknown) =>
  !(isApiError(error) && error.status === 404) && failureCount < 1;

/**
 * Chi tiết 1 món. Dùng chung queryKey với `useProductDetail` (modal chọn tuỳ chọn) nên mở từ menu rồi vào trang
 * chi tiết sẽ dùng lại cache. `productId = null` (id trên URL không hợp lệ) → không gọi API.
 */
export const useProduct = (productId: number | null) =>
  useQuery({
    queryKey: ['catalog', 'product', productId, DINE_IN_BRANCH_ID],
    enabled: productId !== null,
    queryFn: () => catalogApi.getProduct(productId!, DINE_IN_BRANCH_ID),
    retry: retryUnlessNotFound,
  });

export const REVIEWS_PAGE_SIZE = 5;

/** Review công khai của món, tải từng trang ("Xem thêm đánh giá"). Lỗi ở đây không ảnh hưởng phần chi tiết món. */
export const useProductReviews = (productId: number) =>
  useInfiniteQuery({
    queryKey: ['engagement', 'product-reviews', productId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => engagementApi.listProductReviews(productId, { page: pageParam, pageSize: REVIEWS_PAGE_SIZE }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total && last.items.length > 0 ? last.page + 1 : undefined;
    },
  });
