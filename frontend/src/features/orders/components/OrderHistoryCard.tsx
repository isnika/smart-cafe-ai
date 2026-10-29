import { Link } from 'react-router-dom';
import { to } from '@/app/routes';
import { FULFILLMENT_LABEL, itemCount } from '@/features/order-queue/status';
import { customerStatusLabel } from '@/features/online-order/status';
import { formatVnd } from '@/shared/lib';
import type { OrderDetail, OrderStatus } from '@/shared/types';
import { Badge, Button, Card, type BadgeTone } from '@/shared/ui';
import { orderSummary, orderTimeLabel } from '../format';
import { canReorder } from '../reorder';

const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  Pending_Payment: 'warning',
  Pending: 'info',
  Confirmed: 'info',
  Preparing: 'primary',
  Ready: 'success',
  Shipping: 'info',
  Served: 'success',
  Completed: 'success',
  Cancelled: 'error',
  Rejected: 'error',
};

interface Props {
  order: OrderDetail;
  onReorder: (order: OrderDetail) => void;
  now?: Date;
}

/** Thẻ đơn trong lịch sử: bấm vào thẻ → theo dõi đơn; nút "Đặt lại" tách riêng, không kích hoạt điều hướng. */
export function OrderHistoryCard({ order, onReorder, now }: Props) {
  const code = `#${order.orderCode}`;
  return (
    <Card padding="none" className="relative overflow-hidden" role="article" aria-label={`Đơn ${code}`}>
      <div className="space-y-1 p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <Link
            to={to.order(String(order.id))}
            aria-label={`Xem chi tiết đơn ${code}`}
            className="font-heading text-body-lg font-semibold text-gray-900 after:absolute after:inset-0 after:content-['']"
          >
            {code}
          </Link>
          <Badge tone={STATUS_TONE[order.status]}>{customerStatusLabel(order.status, order.fulfillmentType)}</Badge>
        </div>
        <p className="text-caption text-gray-500">{orderTimeLabel(order.createdAt, now)}</p>
        <p className="text-caption text-gray-600">{FULFILLMENT_LABEL[order.fulfillmentType]}</p>
      </div>

      <div className="space-y-2 border-t border-gray-100 p-4 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-body-lg text-gray-800">{orderSummary(order)}</p>
          <p className="shrink-0 text-body-lg font-semibold text-gray-900">{formatVnd(order.finalAmount)}</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-caption text-gray-500">{itemCount(order)} sản phẩm</p>
          {canReorder(order) && (
            <Button variant="outline" size="sm" className="relative z-10" onClick={() => onReorder(order)}>
              Đặt lại
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
