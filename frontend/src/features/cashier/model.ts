import { isTerminalOrderStatus } from '@/shared/lib';
import type { OrderDetail, PaymentStatus } from '@/shared/types';

/**
 * Hai nhóm hiển thị ở tab Thu ngân, suy ra CHỈ từ dữ liệu có thật của đơn (orderSource + paymentStatus):
 * - awaiting_counter: đơn tại quầy (QR/POS) chưa thanh toán → nhân viên cần thu tiền.
 * - paid_online: đơn Online đã được cổng thanh toán ghi nhận Paid → chỉ xác nhận/in bill, KHÔNG thu lại.
 * Đơn khác (đã kết thúc, đang chờ cổng thanh toán, đã thu tại quầy...) không thuộc nhóm nào.
 */
export type CashierGroup = 'awaiting_counter' | 'paid_online';

export function cashierGroup(order: Pick<OrderDetail, 'orderSource' | 'paymentStatus' | 'status'>): CashierGroup | null {
  if (isTerminalOrderStatus(order.status) || order.status === 'Pending_Payment') return null;
  if (order.orderSource !== 'Online' && order.paymentStatus === 'Unpaid') return 'awaiting_counter';
  if (order.orderSource === 'Online' && order.paymentStatus === 'Paid') return 'paid_online';
  return null;
}

/** Chỉ đơn chờ thu tại quầy mới được thu tiền; đơn đã thanh toán/trả online thì không bao giờ. */
export const canCollectAtCounter = (order: Pick<OrderDetail, 'orderSource' | 'paymentStatus' | 'status'>): boolean =>
  cashierGroup(order) === 'awaiting_counter';

export const GROUP_LABEL: Record<CashierGroup, string> = {
  awaiting_counter: 'Chờ thu tại quầy',
  paid_online: 'Đã trả online',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  Unpaid: 'Chưa thanh toán',
  Paid: 'Đã thanh toán',
  Partially_Refunded: 'Hoàn tiền một phần',
  Refunded: 'Đã hoàn tiền',
};

/** Order không lưu phương thức thanh toán, nên chỉ nêu được kênh thu, không đoán VNPay/Momo. */
export const PAYMENT_CHANNEL_LABEL: Record<CashierGroup, string> = {
  awaiting_counter: 'Thanh toán tại quầy',
  paid_online: 'Trả online qua cổng thanh toán',
};

/** Khớp theo mã đơn hoặc số bàn; không phân biệt hoa/thường, bỏ khoảng trắng đầu/cuối và dấu '#'. */
export function matchesSearch(order: Pick<OrderDetail, 'orderCode' | 'tableNumber'>, query: string): boolean {
  const term = query.trim().replace(/^#/, '').trim().toLowerCase();
  if (!term) return true;
  return order.orderCode.toLowerCase().includes(term) || (order.tableNumber ?? '').toLowerCase().includes(term);
}

/** Tiền thừa khi khách đưa tiền mặt; null khi chưa nhập hoặc chưa đủ tiền. */
export function changeDue(finalAmount: number, cashReceived: number | null): number | null {
  if (cashReceived === null || !Number.isFinite(cashReceived) || cashReceived < finalAmount) return null;
  return cashReceived - finalAmount;
}
