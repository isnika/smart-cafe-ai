import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { myOrderApi } from '@/shared/api';
import type { MyOrderSummary, PaginatedResult } from '@/shared/api/order-me.types';
import { TAB_STATUSES, type OrderTab } from '../format';

/** Số đơn mỗi trang (spec: mặc định 20, tối đa 100). */
export const MY_ORDERS_PAGE_SIZE = 10;

/**
 * Một trang đơn của CHÍNH khách đang đăng nhập: GET /orders/me?status=&page=&size=.
 * Lọc + phân trang do server làm (không tải hết rồi cắt ở client). Không gửi userId: chủ đơn lấy từ token;
 * userId chỉ nằm trong queryKey để cache của tài khoản này không bị dùng lại cho tài khoản khác.
 */
export function useMyOrders(tab: OrderTab, page: number) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const status = TAB_STATUSES[tab];
  return useQuery<PaginatedResult<MyOrderSummary>>({
    queryKey: ['orders', 'mine', userId, tab, page, MY_ORDERS_PAGE_SIZE],
    enabled: userId !== null,
    queryFn: ({ signal }) =>
      myOrderApi.listMyOrders({ ...(status ? { status } : {}), page, size: MY_ORDERS_PAGE_SIZE }, signal),
  });
}
