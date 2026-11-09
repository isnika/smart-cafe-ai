import { Link, useParams } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { PageHeader } from '@/features/dine-in/components/PageHeader';
import { formatVnd } from '@/shared/lib';
import { Badge, Button, Skeleton } from '@/shared/ui';
import { CancelOrderSection } from '../components/CancelOrderSection';
import { OrderTimeline } from '../components/OrderTimeline';
import { useOrderTracking } from '../hooks/useOrderTracking';
import {
  PAYMENT_STATUS_LABEL,
  formatVnDateTime,
  isFailedStatus,
  isOnlineOrder,
  orderKindLabel,
  trackingStatusLabel,
} from '../tracking';

/**
 * Theo dõi đơn của khách (chỉ đọc): chi tiết từ GET /orders/me/{id}, timeline từ GET /orders/{id}/history.
 * Hiển thị cả đơn Online (Giao hàng/Mang đi) lẫn Dine-in của chính khách; hai loại được ghi nhãn riêng.
 * Tiến trình chỉ dựa vào order.status; payment_status chỉ là thông tin thanh toán.
 */
export default function OrderTrackingPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const t = useOrderTracking(orderId);
  const { order } = t;

  return (
    <div className="min-h-screen bg-primary-50">
      <PageHeader title="Theo dõi đơn hàng" back={PATHS.home} />

      {t.isLoading && (
        <div className="space-y-3 p-4" aria-busy aria-label="Đang tải đơn hàng">
          <Skeleton className="h-20" />
          <Skeleton className="h-48" />
        </div>
      )}

      {!t.isLoading && (t.isError || !order) && (
        <div role="alert" className="flex flex-col items-center gap-3 px-6 py-20 text-center">
          <h2 className="text-h4">{t.notFound ? 'Không tìm thấy đơn hàng' : 'Không tải được đơn hàng'}</h2>
          {t.notFound ? (
            <p className="text-body text-gray-600">Đơn không tồn tại hoặc không thuộc tài khoản của bạn.</p>
          ) : (
            <Button variant="outline" onClick={t.refetch}>
              Thử lại
            </Button>
          )}
        </div>
      )}

      {order && (
        <div className="space-y-4 px-4 pb-28 pt-4">
          <section className="rounded-lg border border-primary-100 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-caption text-gray-500">Mã đơn hàng</p>
                <p className="font-heading text-h4 text-gray-900">#{order.orderCode}</p>
                <p className="mt-1 text-caption text-gray-500">
                  Đặt lúc <time dateTime={order.createdAt}>{formatVnDateTime(order.createdAt)}</time>
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge tone="primary">{orderKindLabel(order)}</Badge>
                <span aria-label="Trạng thái đơn" className="text-body font-semibold text-primary-700">
                  {trackingStatusLabel(order.status, order.fulfillmentType)}
                </span>
                <Badge tone={order.paymentStatus === 'Unpaid' ? 'warning' : 'info'} aria-label="Trạng thái thanh toán">
                  {PAYMENT_STATUS_LABEL[order.paymentStatus]}
                </Badge>
              </div>
            </div>
            {order.status === 'Pending_Payment' && order.expiresAt && (
              <p className="mt-3 text-caption text-warning-strong">
                Vui lòng thanh toán trước {formatVnDateTime(order.expiresAt)}, sau đó đơn sẽ tự huỷ.
              </p>
            )}
          </section>

          {isFailedStatus(order.status) && (
            <section role="status" aria-label="Đơn không được thực hiện" className="rounded-lg border border-error bg-error-soft p-4 text-error-strong">
              <h2 className="text-body-lg font-semibold">{order.status === 'Rejected' ? 'Quán đã từ chối đơn này' : 'Đơn đã được huỷ'}</h2>
              {order.cancelReason && <p className="mt-1 text-body">Lý do: {order.cancelReason}</p>}
              {(order.cancelledAt ?? order.updatedAt) && (
                <p className="mt-1 text-caption">Lúc {formatVnDateTime(order.cancelledAt ?? order.updatedAt)}</p>
              )}
              {order.paymentStatus !== 'Unpaid' && (
                <p className="mt-1 text-caption">Thanh toán: {PAYMENT_STATUS_LABEL[order.paymentStatus]}.</p>
              )}
            </section>
          )}

          <CancelOrderSection order={order} />

          <OrderTimeline
            history={t.history}
            fulfillment={order.fulfillmentType}
            currentStatus={order.status}
            isLoading={t.historyLoading}
            isError={t.historyError}
            stale={t.historyStale}
            onRetry={t.refetchHistory}
            hideNote={isFailedStatus(order.status) ? order.cancelReason : null}
          />

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
            {order.items.length === 0 ? (
              <p className="text-body text-gray-500">Đơn này chưa có món nào.</p>
            ) : (
              <ul className="space-y-2 text-body text-gray-700">
                {order.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3">
                    <div>
                      <p>
                        <span aria-label={`Số lượng ${i.quantity}`}>{i.quantity}x</span> {i.productName}
                        {i.variantName !== 'Standard' ? ` (${i.variantName})` : ''}
                        {i.isRewardItem ? ' · Quà tặng' : ''}
                      </p>
                      {i.options.length > 0 && (
                        <p className="text-caption text-gray-500">{i.options.map((o) => o.optionName).join(', ')}</p>
                      )}
                      {i.note && <p className="text-caption text-gray-500">Ghi chú: {i.note}</p>}
                    </div>
                    <span className="shrink-0">{formatVnd(i.lineTotal)}</span>
                  </li>
                ))}
              </ul>
            )}
            <dl className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-body text-gray-600">
              {(order.itemDiscountAmount > 0 || order.voucherDiscountAmount > 0 || order.deliveryFee > 0) && (
                <div className="flex justify-between">
                  <dt>Tạm tính</dt>
                  <dd>{formatVnd(order.subTotal)}</dd>
                </div>
              )}
              {order.itemDiscountAmount > 0 && (
                <div className="flex justify-between">
                  <dt>Giảm giá món</dt>
                  <dd>-{formatVnd(order.itemDiscountAmount)}</dd>
                </div>
              )}
              {order.voucherDiscountAmount > 0 && (
                <div className="flex justify-between">
                  <dt>Voucher{order.voucherCode ? ` ${order.voucherCode}` : ''}</dt>
                  <dd>-{formatVnd(order.voucherDiscountAmount)}</dd>
                </div>
              )}
              {order.deliveryFee > 0 && (
                <div className="flex justify-between">
                  <dt>Phí giao hàng</dt>
                  <dd>{formatVnd(order.deliveryFee)}</dd>
                </div>
              )}
              <div className="flex justify-between text-body-lg font-semibold text-gray-900">
                <dt>Tổng cộng</dt>
                <dd className="text-primary-600">{formatVnd(order.finalAmount)}</dd>
              </div>
            </dl>
          </section>

          {isOnlineOrder(order) && (
            <Link to={PATHS.menu} className="block text-center text-body font-semibold text-primary-600 hover:underline">
              Đặt thêm món
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
