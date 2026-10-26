import { useQuery } from '@tanstack/react-query';
import { usePlacedOrders } from '@/features/dine-in/placed-orders';
import { orderApi } from '@/shared/api';
import type { OrderDetail } from '@/shared/types';

/**
 * Đọc 1 đơn Online. Ưu tiên bản vừa đặt (đã lưu ở máy – F5 không cần gọi lại); thiếu thì lấy từ API đơn hàng.
 * `live` = true cho màn theo dõi: luôn lấy trạng thái mới từ server.
 */
export function useOnlineOrder(orderId: string | undefined, opts: { live?: boolean } = {}) {
  const id = Number(orderId);
  const valid = Number.isInteger(id) && id > 0;
  const placed = usePlacedOrders((s) => s.orders.find((o) => String(o.id) === orderId));

  const query = useQuery<OrderDetail>({
    queryKey: ['order', id],
    enabled: valid && (opts.live || !placed),
    queryFn: () => orderApi.getOrder(id),
    ...(opts.live ? { refetchInterval: 15_000 } : {}),
  });

  const order = (opts.live ? query.data : undefined) ?? placed ?? query.data;
  return {
    order: order && order.orderSource === 'Online' ? order : undefined,
    isLoading: valid && !order && query.isPending,
    isError: !valid || (!order && query.isError),
    refetch: query.refetch,
  };
}
