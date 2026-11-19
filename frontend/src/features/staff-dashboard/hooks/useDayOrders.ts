import { queryOptions, useQuery } from '@tanstack/react-query';
import { orderApi } from '@/shared/api';
import { useAuthBranchId } from '@/features/auth/branch-context';

export const DAY_ORDERS_PAGE_SIZE = 100;
export const DAY_ORDERS_REFETCH_MS = 10_000;

/** Đơn gần nhất (mới → cũ). Backend chưa có endpoint thống kê nên số liệu tính từ danh sách này. */
export const dayOrdersQuery = (branchId?: number | null) =>
  queryOptions({
    queryKey: ['staff', 'orders', 'recent', branchId],
    queryFn: ({ signal }) => branchId === undefined || branchId === null
      ? orderApi.listOrders({ pageSize: DAY_ORDERS_PAGE_SIZE }, signal)
      : orderApi.listManagerOrders(branchId, DAY_ORDERS_PAGE_SIZE, signal),
    refetchInterval: DAY_ORDERS_REFETCH_MS,
  });

export const useDayOrders = (branchId?: number | null) => {
  const assignedBranchId = useAuthBranchId();
  const selectedBranchId = branchId === undefined ? assignedBranchId : branchId;
  const query = useQuery({ ...dayOrdersQuery(selectedBranchId === null ? undefined : selectedBranchId), enabled: selectedBranchId !== null });
  return selectedBranchId === null ? { ...query, isPending: false, isLoading: false } : query;
};
