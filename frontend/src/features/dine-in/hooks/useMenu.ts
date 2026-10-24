import { useQuery } from '@tanstack/react-query';
import { catalogApi } from '@/shared/api';

export const useCategories = () =>
  useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: () => catalogApi.listCategories(),
    select: (rows) => rows.filter((c) => c.status === 'Active').sort((a, b) => a.sortOrder - b.sortOrder),
  });

/** Menu theo chi nhánh; lọc theo danh mục ở client để chuyển tab không phải gọi lại API. */
export const useMenuProducts = (branchId: number) =>
  useQuery({
    queryKey: ['catalog', 'products', branchId],
    queryFn: ({ signal }) => catalogApi.listProducts({ branchId }, signal),
    select: (rows) => [...rows].sort((a, b) => a.sortOrder - b.sortOrder),
  });

export const useProductDetail = (productId: number | null, branchId: number) =>
  useQuery({
    queryKey: ['catalog', 'product', productId, branchId],
    enabled: productId !== null,
    queryFn: () => catalogApi.getProduct(productId!, branchId),
  });
