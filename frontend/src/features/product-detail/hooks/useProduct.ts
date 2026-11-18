import { useQuery } from '@tanstack/react-query';
import { DINE_IN_BRANCH_ID } from '@/features/dine-in/config';
import { catalogApi, isApiError } from '@/shared/api';

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

