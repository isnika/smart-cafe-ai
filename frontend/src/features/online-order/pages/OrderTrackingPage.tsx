import { Link, useParams } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { PageHeader } from '@/features/dine-in/components/PageHeader';
import { timeLabel } from '@/features/order-queue/status';
import { formatVnd } from '@/shared/lib';
import { cn } from '@/shared/lib/cn';
import { Badge, Button, Skeleton } from '@/shared/ui';
import { useOnlineOrder } from '../hooks/useOnlineOrder';
import { FULFILLMENT_BADGE } from '../pricing';
import { customerStatusLabel } from '../status';

/** Theo dõi đơn Online (chỉ đọc): trạng thái hiện tại + dòng thời gian từ lịch sử trạng thái của đơn. */
export default function OrderTrackingPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { order, isLoading, isError, refetch } = useOnlineOrder(orderId, { live: true });

  return (
    <div className="min-h-screen bg-primary-50">
      <PageHeader title="Theo dõi đơn hàng" back={PATHS.home} />

      {isLoading && (
        <div className="space-y-3 p-4" aria-busy aria-label="Đang tải đơn hàng">
          <Skeleton className="h-20" />
          <Skeleton className="h-48" />
        </div>
      )}

      {!isLoading && (isError || !order) && (
        <div role="alert" className="flex flex-col items-center gap-3 px-6 py-20 text-center">
          <h2 className="text-h4">Không tải được đơn hàng</h2>
          <Button variant="outline" onClick={() => void refetch()}>
            Thử lại
          </Button>
        </div>
      )}

      {order && (
        <div className="space-y-4 px-4 pb-28 pt-4">
          <section className="flex items-center justify-between rounded-lg border border-primary-100 bg-white p-4">
            <div>
              <p className="text-caption text-gray-500">Mã đơn hàng</p>
              <p className="font-heading text-h4 text-gray-900">#{order.orderCode}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge tone="primary">{FULFILLMENT_BADGE[order.fulfillmentType === 'Pickup' ? 'Pickup' : 'Delivery']}</Badge>
              <span className="text-body font-semibold text-primary-700">{customerStatusLabel(order.status, order.fulfillmentType)}</span>
            </div>
          </section>

          <section aria-labelledby="timeline-title" className="rounded-lg border border-primary-100 bg-white p-4">
            <h2 id="timeline-title" className="mb-3 text-body-lg font-semibold">
              Trạng thái đơn hàng
            </h2>
            <ol className="space-y-4">
              {order.statusHistory.map((h, idx, all) => {
                const current = idx === all.length - 1;
                return (
                  <li key={h.id} className="flex gap-3" aria-current={current ? 'step' : undefined}>
                    <span className={cn('mt-1.5 size-3 shrink-0 rounded-full', current ? 'bg-accent-500 ring-4 ring-accent-100' : 'bg-primary-300')} aria-hidden />
                    <div className="flex flex-1 justify-between gap-2">
                      <div>
                        <p className={cn('text-body', current ? 'font-semibold text-gray-900' : 'text-gray-700')}>
                          {customerStatusLabel(h.status, order.fulfillmentType)}
                        </p>
                        {h.note && <p className="text-caption text-gray-500">{h.note}</p>}
                      </div>
                      <span className="text-caption text-gray-500">{timeLabel(h.createdAt)}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {order.fulfillmentType === 'Delivery' && (
            <section aria-labelledby="addr-title" className="rounded-lg border border-primary-100 bg-white p-4 text-body">
              <h2 id="addr-title" className="mb-1 text-body-lg font-semibold">
                Giao tới
              </h2>
              <p className="font-medium text-gray-900">{order.deliveryName}</p>
              <p className="text-gray-600">{order.deliveryPhone}</p>
              <p className="text-gray-600">{order.deliveryAddress}</p>
            </section>
          )}

          <section aria-labelledby="items-title" className="rounded-lg border border-primary-100 bg-white p-4">
            <h2 id="items-title" className="mb-2 text-body-lg font-semibold">
              Món đã đặt
            </h2>
            <ul className="space-y-1.5 text-body text-gray-700">
              {order.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span>
                    {i.quantity}x {i.productName}
                    {i.variantName !== 'Standard' ? ` (${i.variantName})` : ''}
                  </span>
                  <span className="shrink-0">{formatVnd(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-gray-100 pt-3 text-body-lg font-semibold">
              <span>Tổng cộng</span>
              <span className="text-primary-600">{formatVnd(order.finalAmount)}</span>
            </div>
          </section>

          <Link to={PATHS.menu} className="block text-center text-body font-semibold text-primary-600 hover:underline">
            Đặt thêm món
          </Link>
        </div>
      )}
    </div>
  );
}
