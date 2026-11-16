import { CheckCircle2 } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { PATHS, to } from '@/app/routes';
import { formatVnd } from '@/shared/lib';
import { Button, Skeleton } from '@/shared/ui';
import { useOnlineOrder } from '../hooks/useOnlineOrder';
import { isPaymentChoice, paymentLabel } from '../payment';

/**
 * Màn "Đặt hàng thành công" (wireframe → hoàn thiện bằng Design System).
 * Chỉ ĐỌC đơn đã tạo (không POST) nên F5 không bao giờ tạo thêm đơn. Mọi con số lấy từ đơn thật, không hard-code.
 * Chỉ tới được sau khi khách bấm "Đặt hàng" và đơn đã được tạo; không có trạng thái thất bại ở giai đoạn này.
 */
export default function OrderSuccessPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const location = useLocation();
  const { order, isLoading, isError } = useOnlineOrder(orderId);
  const state = location.state as { paymentMethod?: unknown } | null;
  const method = isPaymentChoice(state?.paymentMethod) ? state.paymentMethod : null;

  if (isLoading) {
    return (
      <div className="space-y-4 px-6 pt-24" aria-busy aria-label="Đang tải đơn hàng">
        <Skeleton className="mx-auto size-20 rounded-full" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!order || isError) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
        <h1 className="text-h3">Không tìm thấy đơn hàng</h1>
        <p className="text-body text-gray-600">Đơn không tồn tại hoặc không thuộc luồng đặt hàng online.</p>
        <Link to={PATHS.home} className="font-medium text-primary-600 underline">
          Về trang chủ
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-md flex-col items-center px-5 pb-10 pt-16 text-center">
      <span className="grid size-20 place-items-center rounded-full bg-success-soft text-success-strong">
        <CheckCircle2 className="size-11" aria-hidden />
      </span>
      <h1 className="mt-6 font-heading text-h2 text-gray-900">Đặt hàng thành công!</h1>
      <p className="mt-1 text-body text-gray-600">Smart Cafe đang chuẩn bị món cho bạn.</p>

      <section aria-label="Chi tiết đơn hàng" className="mt-6 w-full rounded-xl border border-primary-100 bg-white p-4 text-left shadow-card">
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-3">
          <span className="text-body text-gray-600">Mã đơn hàng</span>
          <span className="font-heading text-body-lg font-semibold text-gray-900">#{order.orderCode}</span>
        </div>
        <ul className="space-y-1.5 border-b border-gray-100 py-3 text-body text-gray-700">
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
        <dl className="space-y-1.5 pt-3 text-body">
          {order.voucherDiscountAmount > 0 && (
            <div className="flex justify-between text-gray-600">
              <dt>Khuyến mãi{order.voucherCode ? ` (${order.voucherCode})` : ''}</dt>
              <dd className="text-success-strong">-{formatVnd(order.voucherDiscountAmount)}</dd>
            </div>
          )}
          {order.deliveryFee > 0 && (
            <div className="flex justify-between text-gray-600">
              <dt>Phí giao hàng</dt>
              <dd>{formatVnd(order.deliveryFee)}</dd>
            </div>
          )}
          {method && (
            <div className="flex justify-between text-gray-600">
              <dt>Phương thức thanh toán</dt>
              <dd className="text-right">{paymentLabel(method)}</dd>
            </div>
          )}
          <div className="flex justify-between text-body-lg font-semibold text-gray-900">
            <dt>Tổng thanh toán</dt>
            <dd>{formatVnd(order.finalAmount)}</dd>
          </div>
        </dl>
      </section>

      <div className="mt-6 w-full space-y-3">
        <Link to={to.order(String(order.id))} className="block">
          <Button size="lg" fullWidth tabIndex={-1}>
            Theo dõi đơn hàng
          </Button>
        </Link>
        <Link to={PATHS.home} className="block py-2 text-body font-semibold text-gray-800 hover:underline">
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
