import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { to } from '@/app/routes';
import { useAuthStore } from '@/features/auth/store';
import { NotificationTime } from './NotificationTime';
import { engagementApi } from '@/shared/api';
import type { Notification } from '@/shared/types';

const statusLabels: Record<string, string> = {
  Pending_Payment: 'Chờ thanh toán', Pending: 'Chờ xác nhận', Confirmed: 'Đã xác nhận',
  Preparing: 'Đang pha chế', Ready: 'Đã sẵn sàng', Shipping: 'Đang giao hàng',
  Served: 'Đã phục vụ', Completed: 'Hoàn thành', Cancelled: 'Đã hủy', Rejected: 'Đã từ chối',
};

function notificationMessage(notification: Notification): string {
  const status = notification.data?.status;
  const orderId = notification.data?.orderId ?? notification.data?.order_id;
  if (typeof status === 'string' && statusLabels[status] && (typeof orderId === 'number' || typeof orderId === 'string')) {
    return `Đơn hàng #${orderId}: ${statusLabels[status]}`;
  }
  return notification.body;
}

export function NotificationBell() {
  const user = useAuthStore((state) => state.user);
  const role = useAuthStore((state) => state.roleName);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const enabled = !!user?.id && role === 'Customer';
  const key = ['engagement', 'notifications', user?.id];
  const list = useQuery({
    queryKey: [...key, 'bell'], enabled,
    queryFn: () => engagementApi.listNotifications({ page: 1, pageSize: 20, type: 'order_status' }),
    refetchInterval: 10000,
  });
  const unread = useQuery({
    queryKey: [...key, 'unread'], enabled,
    queryFn: () => engagementApi.listNotifications({ page: 1, pageSize: 1, type: 'order_status', unreadOnly: true }),
    refetchInterval: 10000,
  });
  const read = useMutation({
    mutationFn: engagementApi.markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  if (!enabled) return null;
  const count = unread.data?.total ?? 0;
  return (
    <div className="flex flex-1">
      <button type="button" aria-label={count ? `Thông báo đơn hàng, ${count} chưa đọc` : 'Thông báo đơn hàng'} aria-expanded={open}
        onClick={() => setOpen(!open)} className={`flex w-full flex-col items-center gap-0.5 py-2 text-caption ${open ? 'font-semibold text-primary-600' : 'text-gray-500'}`}>
        <span className="relative">
          <Bell className="size-5" aria-hidden />
          {count > 0 && <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">{count > 99 ? '99+' : count}</span>}
        </span>
        Thông báo
      </button>
      {open && <section aria-label="Thông báo đơn hàng" className="absolute bottom-full right-2 mb-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-primary-100 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <h2 className="font-semibold">Thông báo đơn hàng</h2>
          <button type="button" aria-label="Đóng thông báo" onClick={() => setOpen(false)}><X className="size-5" /></button>
        </div>
        <div className="max-h-[min(24rem,calc(100vh-10rem))] overflow-y-auto p-4" aria-live="polite">
          {list.isPending ? <p>Đang tải thông báo…</p> : list.isError ? <div><p>Không tải được thông báo.</p><button type="button" className="mt-2 text-primary-700 underline" onClick={() => void list.refetch()}>Thử lại</button></div> :
            list.data.items.length === 0 ? <p>Chưa có thông báo đơn hàng.</p> : <ul className="divide-y divide-gray-100">
              {list.data.items.map((notification) => {
                const orderId = notification.data?.orderId ?? notification.data?.order_id;
                const validId = (typeof orderId === 'number' || typeof orderId === 'string') && /^\d+$/.test(String(orderId));
                return <li key={notification.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="font-medium">{notification.title}{!notification.isRead && <span className="ml-2 text-xs text-primary-700">Mới</span>}</p>
                  <p className="mt-1 text-sm text-gray-600">{notificationMessage(notification)}</p>
                  <NotificationTime createdAt={notification.createdAt} />
                  <div className="mt-2 flex gap-4 text-sm text-primary-700">
                    {validId && <Link to={to.order(String(orderId))} onClick={() => { if (!notification.isRead) read.mutate(notification.id); setOpen(false); }}>Xem đơn hàng</Link>}
                    {!notification.isRead && <button type="button" disabled={read.isPending} onClick={() => read.mutate(notification.id)}>Đánh dấu đã đọc</button>}
                  </div>
                </li>;
              })}
            </ul>}
          {read.isError && <p role="alert" className="mt-2 text-sm text-red-700">Không thể đánh dấu đã đọc. Vui lòng thử lại.</p>}
        </div>
      </section>}
    </div>
  );
}
