import { Link } from 'react-router-dom';
import { to } from '@/app/routes';
import { PAYMENT_STATUS_LABEL, orderKindLabel, trackingStatusLabel } from '@/features/online-order/tracking';
import { formatVnd } from '@/shared/lib';
import type { MyOrderSummary } from '@/shared/api/order-me.types';
import type { OrderStatus, PaymentStatus } from '@/shared/types';
import { Badge, Card, type BadgeTone } from '@/shared/ui';
import { orderTimeLabel } from '../format';

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

const PAYMENT_TONE: Record<PaymentStatus, BadgeTone> = {
  Unpaid: 'warning',
  Paid: 'info',
  Partially_Refunded: 'neutral',
  Refunded: 'neutral',
};

interface Props {
  order: MyOrderSummary;
  now?: Date;
}

/** Thẻ đơn trong lịch sử: bấm vào thẻ → trang theo dõi đơn. Order status và payment status là hai nhãn riêng. */
export function OrderHistoryCard({ order, now }: Props) {
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
          <Badge tone={STATUS_TONE[order.status]} aria-label="Trạng thái đơn">
            {trackingStatusLabel(order.status, order.fulfillmentType)}
          </Badge>
        </div>
        <p className="text-caption text-gray-500">{orderTimeLabel(order.createdAt, now)}</p>
        <p className="text-caption text-gray-600">{orderKindLabel(order)}</p>
      </div>

      <div className="space-y-2 border-t border-gray-100 p-4 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-caption text-gray-500">{order.itemCount !== null ? `${order.itemCount} sản phẩm` : ''}</p>
          <p className="shrink-0 text-body-lg font-semibold text-gray-900">{formatVnd(order.finalAmount)}</p>
        </div>
        <Badge tone={PAYMENT_TONE[order.paymentStatus]} aria-label="Trạng thái thanh toán">
          {PAYMENT_STATUS_LABEL[order.paymentStatus]}
        </Badge>
      </div>
    </Card>
  );
}
