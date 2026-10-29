import { ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { PageHeader } from '@/features/dine-in/components/PageHeader';
import { useOnlineCartStore } from '@/features/online-order/store';
import { cn } from '@/shared/lib/cn';
import type { OrderDetail } from '@/shared/types';
import { Button, Skeleton } from '@/shared/ui';
import { OrderHistoryCard } from '../components/OrderHistoryCard';
import { ORDER_TABS, type OrderTab } from '../format';
import { useMyOrders } from '../hooks/useMyOrders';
import { orderToCartLines, reorderFulfillment } from '../reorder';

const EMPTY_TEXT: Record<OrderTab, string> = {
  all: 'Bạn chưa có đơn hàng nào.',
  completed: 'Chưa có đơn nào hoàn tất.',
  cancelled: 'Bạn không có đơn nào bị huỷ.',
};

/**
 * Lịch sử đơn hàng của khách (route nằm trong RequireRole → chưa đăng nhập sẽ bị chuyển về /login).
 * Dữ liệu do server lọc theo chủ đơn; trang này không bao giờ truyền userId.
 */
export default function OrderHistoryPage() {
  const [tab, setTab] = useState<OrderTab>('all');
  const { data, isPending, isError, refetch, isFetching } = useMyOrders(tab);
  const navigate = useNavigate();
  const orders = data?.items ?? [];

  // Đặt lại = đưa lại các món vào giỏ Online rồi sang giỏ hàng; giá/tồn kho do server kiểm tra lúc đặt.
  const reorder = (order: OrderDetail) => {
    const cart = useOnlineCartStore.getState();
    cart.setFulfillment(reorderFulfillment(order));
    for (const { line, quantity } of orderToCartLines(order)) cart.addLine(line, quantity);
    navigate(PATHS.cart);
  };

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
              onClick={() => setTab(t.id)}
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

        {!isPending && !isError && orders.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <ClipboardList className="size-12 text-primary-300" aria-hidden />
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
          <OrderHistoryCard key={o.id} order={o} onReorder={reorder} />
        ))}
      </div>
    </div>
  );
}
