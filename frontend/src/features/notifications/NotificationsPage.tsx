import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PATHS, to } from '@/app/routes';
import { useAuthStore } from '@/features/auth/store';
import { PageHeader } from '@/features/dine-in/components/PageHeader';
import { engagementApi } from '@/shared/api';
import type { Notification } from '@/shared/types';
import { Button, Skeleton } from '@/shared/ui';
import { NotificationTime } from './NotificationTime';

const PAGE_SIZE = 20;
const statusLabels: Record<string, string> = {
  Pending_Payment: 'Chờ thanh toán', Pending: 'Chờ xác nhận', Confirmed: 'Đã xác nhận',
  Preparing: 'Đang pha chế', Ready: 'Đã sẵn sàng', Shipping: 'Đang giao hàng',
  Served: 'Đã phục vụ', Completed: 'Hoàn thành', Cancelled: 'Đã hủy', Rejected: 'Đã từ chối',
};

function message(notification: Notification): string {
  const status = notification.data?.status;
  const orderId = notification.data?.orderId ?? notification.data?.order_id;
  if (typeof status === 'string' && statusLabels[status] && (typeof orderId === 'number' || typeof orderId === 'string')) {
    return `Đơn hàng #${orderId}: ${statusLabels[status]}`;
  }
  return notification.body;
}

export default function NotificationsPage() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const [page, setPage] = useState(1);
  const client = useQueryClient();
  const key = ['engagement', 'notifications', userId];
  const list = useQuery({
    queryKey: [...key, 'page', page], enabled: userId !== null,
    queryFn: () => engagementApi.listNotifications({ page, pageSize: PAGE_SIZE }),
    refetchInterval: 10000,
  });
  const unread = useQuery({
    queryKey: [...key, 'unread'], enabled: userId !== null,
    queryFn: () => engagementApi.listNotifications({ page: 1, pageSize: 1, unreadOnly: true }),
    refetchInterval: 10000,
  });
  const invalidate = () => client.invalidateQueries({ queryKey: key });
  const read = useMutation({ mutationFn: engagementApi.markNotificationRead, onSuccess: invalidate });
  const readAll = useMutation({ mutationFn: engagementApi.markAllNotificationsRead, onSuccess: invalidate });
  const busy = read.isPending || readAll.isPending;
  const totalPages = Math.ceil((list.data?.total ?? 0) / PAGE_SIZE);

  return <div className="min-h-screen bg-primary-50">
    <PageHeader title="Thông báo" back={PATHS.home} />
    <div className="space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-heading text-body-lg font-semibold text-gray-900">Thông báo của bạn</h2>
          <p className="mt-1 text-caption text-gray-500">Theo dõi cập nhật mới nhất từ Smart Cafe.</p></div>
        <Button variant="outline" size="sm" leftIcon={<CheckCheck className="size-4" aria-hidden />} disabled={busy || unread.isPending || unread.isError || (unread.data?.total ?? 0) === 0} onClick={() => readAll.mutate()}>Đọc tất cả</Button>
      </div>
      {(read.isError || readAll.isError) && <p role="alert" className="rounded-md bg-error-soft p-3 text-body text-error-strong">Không thể đánh dấu đã đọc. Vui lòng thử lại.</p>}
      {list.isPending && <div role="status" aria-label="Đang tải thông báo" className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>}
      {list.isError && <div role="alert" className="rounded-lg border border-primary-100 bg-white p-5 text-body"><p>Không tải được thông báo.</p><button type="button" className="mt-2 text-primary-700 underline" onClick={() => void list.refetch()}>Thử lại</button></div>}
      {list.data && list.data.items.length === 0 && <div className="flex flex-col items-center rounded-lg border border-primary-100 bg-white px-6 py-12 text-center"><BellOff className="size-9 text-primary-400" aria-hidden /><p className="mt-3 font-semibold text-gray-900">Chưa có thông báo</p><p className="mt-1 text-body text-gray-500">Các cập nhật của bạn sẽ xuất hiện tại đây.</p></div>}
      {list.data && list.data.items.length > 0 && <ul className="space-y-3" aria-label="Danh sách thông báo">
        {list.data.items.map((notification) => {
          const orderId = notification.data?.orderId ?? notification.data?.order_id;
          const validId = (typeof orderId === 'number' || typeof orderId === 'string') && /^[1-9]\d*$/.test(String(orderId));
          return <li key={notification.id} className={`rounded-lg border bg-white p-4 shadow-card ${notification.isRead ? 'border-gray-200' : 'border-primary-200'}`}>
            <div className="flex items-start gap-3">
              <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${notification.isRead ? 'bg-gray-100 text-gray-500' : 'bg-primary-50 text-primary-600'}`}><Bell className="size-5" aria-hidden /></span>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-body font-semibold text-gray-900">{notification.title}</h3>{!notification.isRead && <span className="rounded-full bg-primary-50 px-2 py-0.5 text-caption text-primary-700">Mới</span>}</div>
                <p className="mt-1 break-words text-body text-gray-600">{message(notification)}</p>
                <NotificationTime createdAt={notification.createdAt} />
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-body font-semibold text-primary-700">
                  {validId && <Link to={to.order(String(orderId))} onClick={() => { if (!notification.isRead && !busy) read.mutate(notification.id); }} className="hover:underline">Xem đơn hàng</Link>}
                  {!notification.isRead && <button type="button" disabled={busy} onClick={() => read.mutate(notification.id)} className="hover:underline disabled:opacity-50">Đánh dấu đã đọc</button>}
                </div>
              </div>
            </div>
          </li>;
        })}
      </ul>}
      {totalPages > 1 && <nav aria-label="Phân trang thông báo" className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" disabled={page <= 1 || list.isFetching} onClick={() => setPage(page - 1)}>Trang trước</Button>
        <span className="text-caption text-gray-600">Trang {page}/{totalPages}</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages || list.isFetching} onClick={() => setPage(page + 1)}>Trang sau</Button>
      </nav>}
    </div>
  </div>;
}
