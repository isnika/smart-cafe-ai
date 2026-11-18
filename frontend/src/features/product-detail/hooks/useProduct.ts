import { useQuery } from '@tanstack/react-query';
import { catalogApi, isApiError } from '@/shared/api';
import { useOnlineCartStore } from '@/features/online-order/store';

/** 404 là câu trả lời cuối cùng (món không có/đã ẩn) nên không thử lại; lỗi khác thử lại 1 lần như mặc định của app. */
const retryUnlessNotFound = (failureCount: number, error: unknown) =>
  !(isApiError(error) && error.status === 404) && failureCount < 1;

/**
 * Chi tiết 1 món. Dùng chung queryKey với `useProductDetail` (modal chọn tuỳ chọn) nên mở từ menu rồi vào trang
 * chi tiết sẽ dùng lại cache. `productId = null` (id trên URL không hợp lệ) → không gọi API.
 */
export const useProduct = (productId: number | null) => {
  const branchId = useOnlineCartStore((state) => state.branchId);
  return useQuery({
    queryKey: ['catalog', 'product', productId, branchId],
    enabled: productId !== null && branchId !== null,
    queryFn: () => catalogApi.getProduct(productId!, branchId!),
    retry: retryUnlessNotFound,
  });
};

