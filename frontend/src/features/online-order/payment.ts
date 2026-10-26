import { Banknote, CreditCard, Wallet } from 'lucide-react';
import type { ComponentType } from 'react';
import type { OrderDetail } from '@/shared/types';

/**
 * Lựa chọn của khách trên UI checkout. CỐ Ý không phải `PaymentMethod` của Payment service
 * (không có "card" ở đó) và không được gửi lên API tạo đơn: giai đoạn này chưa có hợp đồng thanh toán.
 */
export type PaymentChoice = 'cod' | 'card' | 'momo';

export const PAYMENT_OPTIONS: ReadonlyArray<{ id: PaymentChoice; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'cod', label: 'Tiền mặt khi nhận hàng', icon: Banknote },
  { id: 'card', label: 'Thẻ ngân hàng (Visa/Master)', icon: CreditCard },
  { id: 'momo', label: 'Ví MoMo', icon: Wallet },
];

export const paymentLabel = (id: PaymentChoice): string => PAYMENT_OPTIONS.find((o) => o.id === id)?.label ?? id;

export const isPaymentChoice = (v: unknown): v is PaymentChoice => PAYMENT_OPTIONS.some((o) => o.id === v);

/**
 * ĐIỂM THAY THẾ DUY NHẤT khi tích hợp thanh toán thật.
 *
 * Hiện tại: DEMO ở tầng giao diện – không gọi mạng, không sinh mã giao dịch / QR / dữ liệu thanh toán nào,
 * chỉ cho luồng đi tiếp sang màn thành công sau khi khách bấm "Đặt hàng".
 * Sau này: gọi API sandbox của Backend tại đây (và quyết định `payAt` trong buildOnlineOrderInput);
 * trả lỗi/timeout/retry sẽ được xử lý ở giai đoạn đó. Các trang checkout, giỏ hàng, màn thành công không cần đổi.
 */
export function confirmPayment(order: Pick<OrderDetail, 'id'>, method: PaymentChoice): Promise<void> {
  void order;
  void method;
  return Promise.resolve();
}
