import { useMemo, type ReactNode } from 'react';
import { AlertTriangle, Boxes, LayoutDashboard, ReceiptText, TrendingUp } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store';
import { isApiError } from '@/shared/api';
import { formatVnd } from '@/shared/lib';
import { Card, Skeleton } from '@/shared/ui';
import { useInventoryStock } from '@/features/manager-inventory/hooks/useInventory';
import { countByStatus } from '@/features/manager-inventory/model';
import { StatCard } from '@/features/staff-dashboard/components/StatCard';
import { DAY_ORDERS_PAGE_SIZE, useDayOrders } from '@/features/staff-dashboard/hooks/useDayOrders';
import { computeDayStats } from '@/features/staff-dashboard/stats';
import { HourlyRevenueChart } from '../components/HourlyRevenueChart';
import { LowStockCard } from '../components/LowStockCard';
import { OrderMixCard } from '../components/OrderMixCard';
import { SectionEmpty, SectionError, StaleNote } from '../components/SectionState';
import { averageOrderValue, cancelRate, formatPercent, orderMix, revenueByHour } from '../model';

const NO_VALUE = '—';

export default function ManagerDashboardPage() {
  const branchId = useAuthStore((s) => s.branchId);
  // Hai nguồn độc lập: đơn hàng (không phụ thuộc chi nhánh) và tồn kho (theo chi nhánh của tài khoản).
  const orders = useDayOrders();
  const stock = useInventoryStock(branchId);

  // `now` lấy từ lần tải gần nhất để các hàm tính toán thuần, render lại không đổi kết quả.
  const day = useMemo(() => {
    if (!orders.data) return null;
    const items = orders.data.items;
    const now = orders.dataUpdatedAt;
    const stats = computeDayStats(items, now);
    return {
      stats,
      average: averageOrderValue(stats),
      cancel: cancelRate(items, now),
      hourly: revenueByHour(items, now),
      mix: orderMix(items, now),
    };
  }, [orders.data, orders.dataUpdatedAt]);

  const stockCounts = useMemo(() => (stock.data ? countByStatus(stock.data) : null), [stock.data]);
  const truncated = !!orders.data && orders.data.total > orders.data.items.length;
  const ordersLoading = orders.isPending;
  const ordersErrorMessage = isApiError(orders.error) ? orders.error.message : undefined;

  const retryOrders = () => void orders.refetch();

  const ordersSection = (render: (d: NonNullable<typeof day>) => ReactNode, skeletonClass: string): ReactNode => {
    if (ordersLoading) return <Skeleton className={skeletonClass} />;
    if (!day) return <SectionError title="Không tải được dữ liệu đơn hàng" message={ordersErrorMessage} onRetry={retryOrders} retrying={orders.isFetching} />;
    if (day.stats.total === 0) return <SectionEmpty>Chưa có đơn nào hôm nay</SectionEmpty>;
    return render(day);
  };

  const needRestock = stockCounts ? stockCounts.low + stockCounts.out : null;
  const stockKpi = (() => {
    if (branchId === null) return { value: NO_VALUE, hint: 'Tài khoản chưa được gán chi nhánh' };
    if (needRestock !== null && stockCounts) return { value: String(needRestock), hint: `${stockCounts.out} hết hàng` };
    return { value: NO_VALUE, hint: stock.isError ? 'Không tải được dữ liệu kho' : undefined };
  })();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-caption text-gray-500">Quản lý / Tổng quan</p>
        <h1 className="flex items-center gap-2 text-h2 text-gray-900">
          <LayoutDashboard aria-hidden className="size-6 text-primary-600" /> Tổng quan hôm nay
        </h1>
      </div>

      {orders.isError && day && <StaleNote onRetry={retryOrders}>Không cập nhật được số liệu đơn hàng, đang hiển thị dữ liệu lần tải trước.</StaleNote>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5" aria-busy={ordersLoading || (branchId !== null && stock.isPending)}>
        {ordersLoading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <StatCard
              label="Doanh thu đã thu hôm nay"
              value={day ? formatVnd(day.stats.collectedAmount) : NO_VALUE}
              icon={TrendingUp}
              hint="Chỉ tính đơn đã thanh toán, chưa trừ hoàn tiền một phần"
            />
            <StatCard label="Số đơn hôm nay" value={day ? String(day.stats.total) : NO_VALUE} icon={ReceiptText} hint="Gồm cả đơn đã huỷ/từ chối" />
            <StatCard
              label="Giá trị TB/đơn"
              value={day ? formatVnd(day.average) : NO_VALUE}
              icon={LayoutDashboard}
              hint={day ? `Trên ${day.stats.collectedOrders} đơn đã thu` : undefined}
            />
            <StatCard
              label="Tỉ lệ huỷ/từ chối"
              value={day ? formatPercent(day.cancel) : NO_VALUE}
              icon={AlertTriangle}
              hint="Đơn huỷ hoặc bị từ chối trên tổng đơn hôm nay"
            />
          </>
        )}
        <div className="col-span-2 lg:col-span-1">
          {branchId !== null && stock.isPending ? (
            <Skeleton className="h-28" />
          ) : (
            <StatCard label="Nguyên liệu cần nhập" value={stockKpi.value} icon={Boxes} hint={stockKpi.hint} />
          )}
        </div>
      </div>

      {truncated && (
        <p className="text-caption text-gray-500">
          Số liệu đơn tính trên {DAY_ORDERS_PAGE_SIZE} đơn gần nhất (hệ thống có {orders.data?.total} đơn, chưa lọc theo chi nhánh); chưa có API thống kê theo ngày.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card padding="md" className="lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-h4 text-gray-900">
            <TrendingUp aria-hidden className="size-5 text-primary-600" /> Doanh thu theo giờ hôm nay
          </h2>
          {ordersSection((d) => <HourlyRevenueChart data={d.hourly} />, 'h-56')}
        </Card>

        <Card padding="md">
          <h2 className="mb-3 flex items-center gap-2 text-h4 text-gray-900">
            <ReceiptText aria-hidden className="size-5 text-primary-600" /> Cơ cấu đơn hôm nay
          </h2>
          {ordersSection(
            (d) =>
              d.mix.total === 0 ? <SectionEmpty>Chưa có đơn hiệu lực hôm nay (đã loại đơn huỷ/từ chối)</SectionEmpty> : <OrderMixCard mix={d.mix} />,
            'h-56',
          )}
        </Card>
      </div>

      <Card padding="md">
        <h2 className="mb-3 flex items-center gap-2 text-h4 text-gray-900">
          <Boxes aria-hidden className="size-5 text-primary-600" /> Cảnh báo kho
        </h2>
        <LowStockCard branchId={branchId} stock={stock} />
      </Card>
    </div>
  );
}
