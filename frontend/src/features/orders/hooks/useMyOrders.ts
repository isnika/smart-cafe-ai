import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { orderApi } from '@/shared/api';
import { TAB_STATUSES, type OrderTab } from '../format';

export const MY_ORDERS_PAGE_SIZE = 100;

/**
 * Đơn của CHÍNH khách đang đăng nhập. Không gửi userId: server xác định chủ đơn từ token.
 * userId chỉ nằm trong queryKey để cache của tài khoản này không bị dùng lại cho tài khoản khác.
 */
export function useMyOrders(tab: OrderTab) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const status = TAB_STATUSES[tab];
  return useQuery({
    queryKey: ['orders', 'mine', userId, tab],
    enabled: userId !== null,
    queryFn: ({ signal }) =>
      orderApi.listOrders({ ...(status ? { status } : {}), pageSize: MY_ORDERS_PAGE_SIZE }, signal),
  });
}
