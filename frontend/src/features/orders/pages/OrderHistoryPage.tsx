import { ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { PageHeader } from '@/features/dine-in/components/PageHeader';
import { cn } from '@/shared/lib/cn';
import { Button, Skeleton } from '@/shared/ui';
import { OrderHistoryCard } from '../components/OrderHistoryCard';
import { OrderPagination } from '../components/OrderPagination';
import { ORDER_TABS, type OrderTab } from '../format';
import { useMyOrders } from '../hooks/useMyOrders';

const EMPTY_TEXT: Record<OrderTab, string> = {
  all: 'Bạn chưa có đơn hàng nào.',
  completed: 'Chưa có đơn nào hoàn tất.',
  cancelled: 'Bạn không có đơn nào bị huỷ.',
};

/**
 * Lịch sử đơn hàng của khách (route nằm trong RequireRole → chưa đăng nhập sẽ bị chuyển về /login).
 * Dữ liệu (lọc theo order status + phân trang) do GET /orders/me trả về theo chủ đơn; trang này không bao giờ truyền userId.
 */
export default function OrderHistoryPage() {
  const [tab, setTab] = useState<OrderTab>('all');
  const [page, setPage] = useState(1);
  const { data, isPending, isError, refetch, isFetching } = useMyOrders(tab, page);
  const orders = data?.items ?? [];
  const totalPages = data?.meta.totalPages ?? 0;

  const selectTab = (next: OrderTab) => {
    setTab(next);
    setPage(1);
  };

  // Trang hiện tại vượt quá tổng số trang (đơn vừa bị xoá/đổi bộ lọc) → lùi về trang cuối có dữ liệu.
  // (Cập nhật state ngay trong lúc render, đúng mẫu "điều chỉnh state khi dữ liệu đổi" của React; không dùng effect.)
  if (data && totalPages >= 1 && page > totalPages) setPage(totalPages);

  return (
    <div className="min-h-screen bg-primary-50">
      <PageHeader title="Đơn hàng của tôi" back={PATHS.home} />

      <div role="tablist" aria-label="Lọc đơn hàng" className="flex gap-2 overflow-x-auto px-4 py-3">
        {ORDER_TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(t.id)}
              className={cn(
                'shrink-0 rounded-full border px-4 py-1.5 text-body font-medium transition-colors',
                active ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-3 px-4 pb-6" aria-live="polite">
        {isPending && (
          <div className="space-y-3" role="status" aria-busy aria-label="Đang tải đơn hàng">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        )}

        {isError && (
          <div role="alert" className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <h2 className="text-h4">Không tải được đơn hàng</h2>
            <p className="text-body text-gray-600">Vui lòng kiểm tra kết nối và thử lại.</p>
            <Button variant="outline" loading={isFetching} onClick={() => void refetch()}>
              Thử lại
            </Button>
          </div>
        )}

        {!isPending && !isError && orders.length === 0 && page <= Math.max(totalPages, 1) && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <ClipboardList className="size-12 text-primary-600" aria-hidden />
            <h2 className="text-h4">{EMPTY_TEXT[tab]}</h2>
            {tab === 'all' && <p className="text-body text-gray-600">Chọn vài món từ thực đơn để bắt đầu đặt hàng.</p>}
            <Link
              to={PATHS.menu}
              className="inline-flex h-10 items-center rounded-md bg-primary-600 px-4 text-body font-medium text-white hover:bg-primary-700"
            >
              Xem thực đơn
            </Link>
            <Link to={PATHS.home} className="text-body font-semibold text-primary-600 hover:underline">
              Về trang chủ
            </Link>
          </div>
        )}

        {orders.map((o) => (
          <OrderHistoryCard key={o.id} order={o} />
        ))}

        {data && orders.length > 0 && <OrderPagination meta={data.meta} busy={isFetching} onPage={setPage} />}
      </div>
    </div>
  );
}
