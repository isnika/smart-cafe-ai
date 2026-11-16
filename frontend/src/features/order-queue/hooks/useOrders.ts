import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { orderApi } from '@/shared/api';
import type { ChangeOrderStatusInput, OrderDetail } from '@/shared/types';
import { QUEUE_COLUMNS } from '../status';

/** Hàng đợi tự làm mới để nhân viên thấy đơn khách vừa đặt (chỉ phía nhân viên, không phải khách). */
export const QUEUE_REFETCH_MS = 5_000;

export const queueQuery = () =>
  queryOptions({
    queryKey: ['staff', 'orders', 'queue'],
    queryFn: ({ signal }) => orderApi.listOrders({ status: [...QUEUE_COLUMNS], pageSize: 100 }, signal),
    refetchInterval: QUEUE_REFETCH_MS,
  });

export const useOrderQueue = () => useQuery(queueQuery());

/** Dùng chung cache với hàng đợi → badge sidebar không gọi thêm request riêng. */
export const useActiveOrderCount = (enabled: boolean) =>
  useQuery({ ...queueQuery(), enabled, select: (page) => page.total });

export const orderQuery = (id: number) =>
  queryOptions({ queryKey: ['staff', 'orders', 'detail', id], queryFn: () => orderApi.getOrder(id) });

export const useOrder = (id: number) => useQuery(orderQuery(id));

export function useChangeOrderStatus(orderId: number) {
  const qc = useQueryClient();
  return useMutation<OrderDetail, Error, ChangeOrderStatusInput>({
    mutationFn: (input) => orderApi.changeOrderStatus(orderId, input),
    onSuccess: (order) => {
      qc.setQueryData(orderQuery(orderId).queryKey, order);
      void qc.invalidateQueries({ queryKey: ['staff', 'orders', 'queue'] });
    },
    // 409 VERSION_CONFLICT: tải lại bản mới nhất để nhân viên nhìn đúng trạng thái.
    onError: () => void qc.invalidateQueries({ queryKey: orderQuery(orderId).queryKey }),
  });
}
