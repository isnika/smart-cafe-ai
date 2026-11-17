import { queryOptions, useQuery } from '@tanstack/react-query';
import { orderApi } from '@/shared/api';

export const DAY_ORDERS_PAGE_SIZE = 100;
export const DAY_ORDERS_REFETCH_MS = 10_000;

/** Đơn gần nhất (mới → cũ). Backend chưa có endpoint thống kê nên số liệu tính từ danh sách này. */
export const dayOrdersQuery = () =>
  queryOptions({
    queryKey: ['staff', 'orders', 'recent'],
    queryFn: ({ signal }) => orderApi.listOrders({ pageSize: DAY_ORDERS_PAGE_SIZE }, signal),
    refetchInterval: DAY_ORDERS_REFETCH_MS,
  });

export const useDayOrders = () => useQuery(dayOrdersQuery());
