import { useMemo } from 'react';
import { CheckCircle2, Clock, ReceiptText, TrendingUp } from 'lucide-react';
import { isApiError } from '@/shared/api';
import { formatVnd } from '@/shared/lib';
import { Button, Skeleton } from '@/shared/ui';
import { computeDayStats } from '../stats';
import { DAY_ORDERS_PAGE_SIZE, useDayOrders } from '../hooks/useDayOrders';
import { StatCard } from './StatCard';

export function OverviewTab({ onOpenCashier }: { onOpenCashier: () => void }) {
  const query = useDayOrders();
  const stats = useMemo(() => (query.data ? computeDayStats(query.data.items, query.dataUpdatedAt) : null), [query.data, query.dataUpdatedAt]);
  const truncated = !!query.data && query.data.total > query.data.items.length;

  if (query.isPending) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-busy aria-label="Đang tải thống kê">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div role="alert" className="rounded-lg border border-error/30 bg-error-soft p-4 text-error-strong">
        <p className="font-medium">Không tải được thống kê</p>
        <p className="text-body">{isApiError(query.error) ? query.error.message : 'Vui lòng thử lại.'}</p>
        <Button className="mt-3" variant="outline" size="sm" onClick={() => void query.refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {query.isError && (
        <p role="alert" className="rounded-md bg-warning-soft p-2 text-caption text-warning-strong">
          Không cập nhật được số liệu mới, đang hiển thị dữ liệu lần tải trước.{' '}
          <button type="button" onClick={() => void query.refetch()} className="underline">Thử lại</button>
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Tổng đơn hôm nay" value={String(stats.total)} icon={ReceiptText} hint="Gồm cả đơn đã huỷ/từ chối" />
        <StatCard label="Đang xử lý" value={String(stats.open)} icon={Clock} hint="Chưa hoàn thành hoặc huỷ" />
        <StatCard label="Đã hoàn thành" value={String(stats.completed)} icon={CheckCircle2} />
        <StatCard label="Đã thu" value={formatVnd(stats.collectedAmount)} icon={TrendingUp} hint={`${stats.collectedOrders} đơn ở trạng thái đã thanh toán`} />
      </div>

      {stats.total === 0 && (
        <p role="status" className="rounded-lg border border-dashed border-gray-300 bg-white py-8 text-center text-gray-500">
          Chưa có đơn nào trong ngày hôm nay.
        </p>
      )}

      {truncated && (
        <p className="text-caption text-gray-500">Số liệu tính trên {DAY_ORDERS_PAGE_SIZE} đơn gần nhất (hệ thống có {query.data?.total} đơn); chưa có API thống kê theo ngày.</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/30 bg-info-soft/60 p-4">
        <p className="text-body text-info-strong">
          <span className="font-semibold">{stats.awaitingCounter}</span> đơn đang chờ thu tại quầy
        </p>
        <Button size="sm" variant="outline" onClick={onOpenCashier}>
          Mở Thu ngân
        </Button>
      </div>
    </div>
  );
}
