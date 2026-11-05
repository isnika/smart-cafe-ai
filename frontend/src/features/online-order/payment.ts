import { Banknote, CreditCard, Wallet } from 'lucide-react';
import type { ComponentType } from 'react';
import type { OrderDetail, PaymentMethod } from '@/shared/types';

/**
 * Lựa chọn của khách trên UI checkout. CỐ Ý không phải `PaymentMethod` của Payment service
 * (không có "card" ở đó) và không được gửi lên API tạo đơn (spec POST /orders không có trường phương thức thanh toán).
 */
export type PaymentChoice = 'cod' | 'card' | 'momo';

export const PAYMENT_OPTIONS: ReadonlyArray<{ id: PaymentChoice; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'cod', label: 'Tiền mặt khi nhận hàng', icon: Banknote },
  { id: 'card', label: 'Thẻ ngân hàng (Visa/Master)', icon: CreditCard },
  { id: 'momo', label: 'Ví MoMo', icon: Wallet },
];

/**
 * Lựa chọn UI → Payment_Method của spec (Cash|COD|VNPay|Momo). Visa/Master đi qua cổng VNPay.
 * Workload 2 dùng map này cho POST /payments; COD KHÔNG gọi POST /payments (đơn tạo Pending/Unpaid).
 */
export const PAYMENT_METHOD_OF: Readonly<Record<PaymentChoice, Extract<PaymentMethod, 'COD' | 'VNPay' | 'Momo'>>> = {
  cod: 'COD',
  card: 'VNPay',
  momo: 'Momo',
};
export const toPaymentMethod = (choice: PaymentChoice): PaymentMethod => PAYMENT_METHOD_OF[choice];
/** Chỉ VNPay/Momo cần cổng thanh toán (đơn có thể ở Pending_Payment); COD thu tiền khi nhận hàng. */
export const needsGateway = (choice: PaymentChoice): boolean => PAYMENT_METHOD_OF[choice] !== 'COD';

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
