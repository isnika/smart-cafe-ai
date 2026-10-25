import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, Search } from 'lucide-react';
import { to } from '@/app/routes';
import { isApiError } from '@/shared/api';
import { formatVnd } from '@/shared/lib';
import type { FulfillmentType, OrderDetail } from '@/shared/types';
import { Button, Skeleton } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';
import { OrderCard } from '../components/OrderCard';
import { useOrderQueue } from '../hooks/useOrders';
import { COLUMN_STYLE, FULFILLMENT_LABEL, itemCount, QUEUE_COLUMNS, STATUS_LABEL, timeLabel, whereLabel } from '../status';

type Filter = 'all' | FulfillmentType;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'Dine_In', label: FULFILLMENT_LABEL.Dine_In },
  { id: 'Delivery', label: FULFILLMENT_LABEL.Delivery },
  { id: 'Pickup', label: FULFILLMENT_LABEL.Pickup },
];

const pill = (active: boolean) =>
  cn(
    'rounded-md px-3 py-1.5 text-body font-medium transition-colors',
    active ? 'bg-primary-600 text-white' : 'border border-gray-200 bg-white text-gray-800 hover:bg-gray-50',
  );

export default function OrderQueuePage() {
  const queue = useOrderQueue();
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  // Mốc thời gian = lúc dữ liệu được tải về (tự làm mới theo polling) → render thuần, không gọi Date.now().
  const now = queue.dataUpdatedAt;
  const orders = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (queue.data?.items ?? [])
      .filter((o) => filter === 'all' || o.fulfillmentType === filter)
      .filter((o) => !term || o.orderCode.toLowerCase().includes(term) || (o.tableNumber ?? '').toLowerCase().includes(term) || whereLabel(o).toLowerCase().includes(term))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)); // FIFO: đơn cũ nhất lên đầu
  }, [queue.data, filter, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption text-gray-500">Nhân viên / Live Queue</p>
          <h1 className="text-h2 text-gray-900">Hàng đợi chế biến</h1>
        </div>
        <label className="relative w-full max-w-xs">
          <span className="sr-only">Tìm mã đơn hoặc tên bàn</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm mã đơn, tên bàn..."
            className="h-10 w-full rounded-full border border-primary-100 bg-primary-50 pl-9 pr-4 text-body"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-gray-200 py-3">
        <div className="flex gap-2" role="tablist" aria-label="Kiểu hiển thị">
          {(['kanban', 'list'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={pill(view === v)}>
              {v === 'kanban' ? 'Kanban' : 'Danh sách'}
            </button>
          ))}
        </div>
        <p className="text-caption text-gray-500">Tổng số: {queue.data?.total ?? 0} đơn đang hoạt động</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo hình thức">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={pill(filter === f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <p className="flex items-center gap-1.5 text-caption text-primary-700">
          <Info className="size-4" aria-hidden /> Trừ kho 1 lần khi xác nhận · hoàn thành không trừ lại
        </p>
      </div>

      {queue.isPending && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-busy>
          {QUEUE_COLUMNS.map((c) => (
            <Skeleton key={c} className="h-48" />
          ))}
        </div>
      )}

      {queue.isError && (
        <div role="alert" className="rounded-lg border border-error/30 bg-error-soft p-4 text-error-strong">
          <p className="font-medium">Không tải được hàng đợi</p>
          <p className="text-body">{isApiError(queue.error) ? queue.error.message : 'Vui lòng thử lại.'}</p>
          <Button className="mt-3" variant="outline" size="sm" onClick={() => void queue.refetch()}>
            Thử lại
          </Button>
        </div>
      )}

      {queue.isSuccess && orders.length === 0 && (
        <p role="status" className="rounded-lg border border-dashed border-gray-300 bg-white py-12 text-center text-gray-500">
          {q || filter !== 'all' ? 'Không có đơn nào khớp bộ lọc.' : 'Chưa có đơn nào đang chờ xử lý.'}
        </p>
      )}

      {queue.isSuccess && orders.length > 0 && view === 'kanban' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {QUEUE_COLUMNS.map((status) => {
            const col = orders.filter((o) => o.status === status);
            return (
              <section key={status} aria-label={STATUS_LABEL[status]} className="space-y-2">
                <h2 className={cn('flex items-center justify-between rounded-md px-3 py-2 text-body font-semibold uppercase', COLUMN_STYLE[status].head)}>
                  <span>
                    {STATUS_LABEL[status]} ({col.length})
                  </span>
                  <span className={cn('size-2 rounded-full', COLUMN_STYLE[status].dot)} aria-hidden />
                </h2>
                <ul className="space-y-2">
                  {col.map((o) => (
                    <li key={o.id}>
                      <OrderCard order={o} now={now} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {queue.isSuccess && orders.length > 0 && view === 'list' && <OrderTable orders={orders} />}
    </div>
  );
}

function OrderTable({ orders }: { orders: OrderDetail[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-left text-body">
        <thead className="bg-gray-50 text-caption uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2">Mã đơn</th>
            <th className="px-4 py-2">Vị trí</th>
            <th className="px-4 py-2">Món</th>
            <th className="px-4 py-2">Trạng thái</th>
            <th className="px-4 py-2">Lúc nhận</th>
            <th className="px-4 py-2 text-right">Tổng tiền</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 font-semibold">
                <Link to={to.staffOrder(String(o.id))} className="text-primary-700 underline">
                  #{o.orderCode}
                </Link>
              </td>
              <td className="px-4 py-2">{whereLabel(o)}</td>
              <td className="px-4 py-2">{itemCount(o)} món</td>
              <td className="px-4 py-2">{STATUS_LABEL[o.status]}</td>
              <td className="px-4 py-2">{timeLabel(o.createdAt)}</td>
              <td className="px-4 py-2 text-right font-medium">{formatVnd(o.finalAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
