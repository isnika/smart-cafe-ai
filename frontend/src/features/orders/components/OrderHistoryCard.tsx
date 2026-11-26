import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { to } from '@/app/routes';
import { useAuthStore } from '@/features/auth/store';
import { PAYMENT_STATUS_LABEL, orderKindLabel, trackingStatusLabel } from '@/features/online-order/tracking';
import { engagementApi, myOrderApi } from '@/shared/api';
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

function ReviewLink({ order }: { order: MyOrderSummary }) {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const reviews = useQuery({
    queryKey: ['reviews', 'mine', userId],
    enabled: userId !== null,
    queryFn: ({ signal }) => engagementApi.listMyReviews(signal),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['orders', 'review-items', userId, order.id],
    enabled: userId !== null && order.items === undefined,
    queryFn: ({ signal }) => myOrderApi.getMyOrder(order.id, signal),
    retry: false,
  });
  const items = order.items ?? detail.data?.items;
  const isLoading = (!reviews.data && reviews.isPending) || (!items && detail.isPending);
  const reviewedIds = new Set(reviews.data?.map((review) => review.orderItemId));
  const reviewedCount = items?.filter((item) => reviewedIds.has(item.id)).length ?? 0;
  const complete = !!items?.length && !!reviews.data && reviewedCount === items.length;
  const label = isLoading ? 'Đang kiểm tra…' : !items?.length || !reviews.data ? 'Xem đánh giá' : complete ? 'Đã đánh giá' : reviewedCount > 0 ? 'Đánh giá tiếp' : 'Đánh giá';

  return <Link
    to={to.orderReview(String(order.id))}
    aria-label={`${label} đơn #${order.orderCode}`}
    className={`relative z-10 rounded-full border px-4 py-1.5 text-body font-semibold ${complete ? 'border-secondary-200 bg-secondary-50 text-secondary-800 hover:bg-secondary-100' : 'border-primary-600 text-primary-700 hover:bg-primary-50'}`}
  >{label}</Link>;
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
        <div className="flex items-center justify-between gap-3">
          <Badge tone={PAYMENT_TONE[order.paymentStatus]} aria-label="Trạng thái thanh toán">
            {PAYMENT_STATUS_LABEL[order.paymentStatus]}
          </Badge>
          {order.status === 'Completed' && <ReviewLink order={order} />}
        </div>
      </div>
    </Card>
  );
}
