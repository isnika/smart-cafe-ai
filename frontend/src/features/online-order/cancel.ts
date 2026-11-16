import { isTerminalOrderStatus } from '@/shared/lib';
import type { OrderDetail, OrderStatus } from '@/shared/types';

/**
 * Trạng thái mà KHÁCH được hủy, chép từ Excel (sheet "Enum & Trạng thái", cột "Ai được làm" có Customer):
 *   Pending_Payment → Cancelled (Customer/System) · Pending → Cancelled (Customer/Staff/Manager).
 * KHÔNG dùng ORDER_TRANSITIONS của FE: bảng đó có `Preparing → Cancelled` mà Excel không có, và không phân biệt người làm.
 * Đây chỉ là gợi ý hiển thị nút; server vẫn là nơi quyết định (409 INVALID_STATE_TRANSITION, 404, 403…).
 */
export const CUSTOMER_CANCELLABLE_STATUSES: readonly OrderStatus[] = ['Pending_Payment', 'Pending'];

export type CancelAffordance =
  /** Hiện nút "Hủy đơn": Online + Unpaid + trạng thái Excel cho khách hủy. */
  | 'cancel'
  /** Đơn đã thanh toán, còn hiệu lực: không hủy trực tiếp → hướng dẫn liên hệ quán. */
  | 'contact-shop'
  | 'none';

type CancelInput = Pick<OrderDetail, 'orderSource' | 'paymentStatus' | 'status'>;

export function cancelAffordance(o: CancelInput): CancelAffordance {
  if (o.orderSource !== 'Online') return 'none';
  if (isTerminalOrderStatus(o.status)) return 'none';
  if (o.paymentStatus === 'Unpaid') return CUSTOMER_CANCELLABLE_STATUSES.includes(o.status) ? 'cancel' : 'none';
  return 'contact-shop';
}
