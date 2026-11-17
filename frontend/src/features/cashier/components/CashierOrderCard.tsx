import { formatVnd } from '@/shared/lib';
import { cn } from '@/shared/lib/cn';
import type { OrderDetail } from '@/shared/types';
import { itemCount, minutesSince, timeLabel, whereLabel } from '@/features/order-queue/status';
import { GROUP_LABEL, type CashierGroup } from '../model';

const STYLE: Record<CashierGroup, { box: string; title: string }> = {
  awaiting_counter: { box: 'border-info bg-info-soft/60 hover:bg-info-soft', title: 'text-info-strong' },
  paid_online: { box: 'border-success bg-success-soft/60 hover:bg-success-soft', title: 'text-success-strong' },
};

export function CashierOrderCard({
  order,
  group,
  now,
  onOpen,
}: {
  order: OrderDetail;
  group: CashierGroup;
  now: number;
  onOpen: (id: number) => void;
}) {
  const s = STYLE[group];
  const summary = order.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ');
  return (
    <button
      type="button"
      onClick={() => onOpen(order.id)}
      aria-label={`Mở hóa đơn #${order.orderCode}, ${GROUP_LABEL[group]}`}
      className={cn('block w-full rounded-lg border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600', s.box)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={cn('font-heading font-semibold', s.title)}>
          {GROUP_LABEL[group]} · #{order.orderCode} · {whereLabel(order)}
        </p>
        <p className="font-semibold text-gray-900">{formatVnd(order.finalAmount)}</p>
      </div>
      <p className="mt-1 text-caption text-gray-600">
        {timeLabel(order.createdAt)} · {minutesSince(order.createdAt, now)} phút trước · {itemCount(order)} món
      </p>
      {summary && <p className="mt-1 truncate text-caption text-gray-500">{summary}</p>}
    </button>
  );
}
