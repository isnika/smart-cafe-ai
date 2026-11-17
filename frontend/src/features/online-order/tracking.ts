import { parseUtc } from '@/shared/lib';
import type { FulfillmentType, IsoDateTime, OrderDetail, OrderStatus, PaymentStatus } from '@/shared/types';
import { customerStatusLabel } from './status';

/** Nhãn tiến trình đơn cho màn theo dõi: tách Served khỏi Completed (customerStatusLabel gộp cả hai là "Hoàn tất"). */
export function trackingStatusLabel(status: OrderStatus, fulfillment: FulfillmentType): string {
  if (status === 'Served') return 'Đã phục vụ';
  if (status === 'Ready' && fulfillment === 'Dine_In') return 'Món đã xong';
  return customerStatusLabel(status, fulfillment);
}

/** Chỉ để HIỂN THỊ thanh toán. Không được dùng để suy ra tiến trình đơn (order.status mới là nguồn duy nhất). */
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  Unpaid: 'Chưa thanh toán',
  Paid: 'Đã thanh toán',
  Partially_Refunded: 'Đã hoàn một phần',
  Refunded: 'Đã hoàn tiền',
};

export const isFailedStatus = (s: OrderStatus): boolean => s === 'Cancelled' || s === 'Rejected';

/** Online (Delivery/Pickup) hay Dine-in (QR/POS). Dựa vào orderSource, không đoán từ field khác. */
export const isOnlineOrder = (o: Pick<OrderDetail, 'orderSource'>): boolean => o.orderSource === 'Online';

export function orderKindLabel(o: Pick<OrderDetail, 'orderSource' | 'fulfillmentType' | 'tableNumber'>): string {
  if (isOnlineOrder(o)) return o.fulfillmentType === 'Pickup' ? 'Online · Mang đi' : 'Online · Giao hàng';
  return o.tableNumber ? `Tại quán · Bàn ${o.tableNumber}` : 'Tại quán';
}

const VN_TZ = 'Asia/Ho_Chi_Minh';

/** Giờ Việt Nam (UTC+7) từ timestamp API, qua parseUtc (naive → UTC). Không hợp lệ → '—'. */
export function formatVnDateTime(iso: IsoDateTime | null | undefined): string {
  const d = parseUtc(iso);
  return d
    ? d.toLocaleString('vi-VN', { timeZone: VN_TZ, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';
}
