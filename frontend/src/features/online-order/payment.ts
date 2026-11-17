import { Banknote, CreditCard, Wallet } from 'lucide-react';
import type { ComponentType } from 'react';
import { to } from '@/app/routes';
import { paymentApi } from '@/shared/api';
import type { OrderDetail, PaymentMethod } from '@/shared/types';
import { PaymentInitError } from './errors';
import { isMockMode } from './config';
import { rememberPaymentId } from './payment-session';

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
 * `initiatePayment` dùng map này cho POST /payments; COD KHÔNG gọi POST /payments (đơn tạo Pending/Unpaid).
 */
export const PAYMENT_METHOD_OF: Readonly<Record<PaymentChoice, Extract<PaymentMethod, 'COD' | 'VNPay' | 'Momo'>>> = {
  cod: 'COD',
  card: 'VNPay',
  momo: 'Momo',
};
export const toPaymentMethod = (choice: PaymentChoice): PaymentMethod => PAYMENT_METHOD_OF[choice];
/** Chỉ VNPay/Momo cần cổng thanh toán (đơn có thể ở Pending_Payment); COD thu tiền khi nhận hàng. */
export const needsGateway = (choice: PaymentChoice): boolean => PAYMENT_METHOD_OF[choice] !== 'COD';

/** Phương thức của một giao dịch cổng cũ → lựa chọn UI tương ứng (dùng cho retry: giữ nguyên phương thức). COD/Cash → null. */
export const choiceOfMethod = (method: PaymentMethod): PaymentChoice | null =>
  method === 'VNPay' ? 'card' : method === 'Momo' ? 'momo' : null;

export const paymentLabel = (id: PaymentChoice): string => PAYMENT_OPTIONS.find((o) => o.id === id)?.label ?? id;

export const isPaymentChoice = (v: unknown): v is PaymentChoice => PAYMENT_OPTIONS.some((o) => o.id === v);

/** Bước kế tiếp của UI sau khi khởi tạo thanh toán (chỉ là dữ liệu; việc điều hướng do trang checkout thực hiện). */
export type PaymentNext =
  | { kind: 'success' } // COD: giữ luồng sang màn thành công như cũ
  | { kind: 'external'; url: string } // chế độ thật: rời app tới payment_url (window.location.assign)
  | { kind: 'gateway'; path: string }; // chế độ mock: đường dẫn trong app tới PaymentGatewayPage

/** Bọc window.location.assign để test quan sát được việc redirect (jsdom không cho spy trực tiếp). */
export const browserRedirect = { assign: (url: string): void => window.location.assign(url) };

/**
 * return_url gửi cho cổng: trang return của đơn (PaymentReturnPage, polling GET /payments/{id}).
 * Chỉ dùng origin của app; không chứa dữ liệu nhạy cảm.
 */
export const onlineReturnUrl = (orderId: number): string => `${window.location.origin}${to.paymentReturn(String(orderId))}`;

// Idempotency-Key của POST /payments: một khoá cho mỗi (đơn, phương thức), giữ nguyên khi gọi lại sau lỗi mạng/timeout
// (server có thể đã tạo giao dịch). Khởi tạo thành công → bỏ khoá. Retry có chủ đích (giao dịch mới) tự cấp khoá riêng
// qua `opts.idempotencyKey` (xem payment-retry.ts), không đụng vào map này.
const paymentKeys = new Map<string, string>();
export const newKey = () => globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const keyFor = (orderId: number, method: PaymentMethod): string => {
  const id = `${orderId}:${method}`;
  let key = paymentKeys.get(id);
  if (!key) paymentKeys.set(id, (key = newKey()));
  return key;
};
/** Chỉ dành cho test. */
export const resetPaymentKeys = (): void => paymentKeys.clear();

/** payment_url → bước kế tiếp. Mock: về cổng giả lập trong app (giữ PaymentGatewayPage). Thật: URL ngoài, chỉ http(s). */
export function gatewayTarget(paymentUrl: string): PaymentNext {
  let u: URL;
  try {
    u = new URL(paymentUrl);
  } catch {
    throw new PaymentInitError('PAYMENT_URL_INVALID', 'Không nhận được liên kết thanh toán hợp lệ. Vui lòng thử lại.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new PaymentInitError('PAYMENT_URL_INVALID', 'Không nhận được liên kết thanh toán hợp lệ. Vui lòng thử lại.');
  }
  return isMockMode() ? { kind: 'gateway', path: `${u.pathname}${u.search}` } : { kind: 'external', url: paymentUrl };
}

/**
 * Khởi tạo thanh toán sau khi đã có đơn.
 *  - COD: KHÔNG gọi API thanh toán → { kind: 'success' }.
 *  - VNPay/Momo: POST /payments {branch_id, payment_method, allocations:[{order_id, allocated_amount}], return_url}
 *    + Idempotency-Key. Số tiền lấy nguyên từ đơn server trả về (không tự tính); không gửi user_id/voucher/guest header.
 */
export async function initiatePayment(
  order: Pick<OrderDetail, 'id' | 'branchId' | 'finalAmount'>,
  choice: PaymentChoice,
  opts: { idempotencyKey?: string } = {},
): Promise<PaymentNext> {
  if (!needsGateway(choice)) return { kind: 'success' };
  const paymentMethod = toPaymentMethod(choice);
  const ownKey = opts.idempotencyKey; // retry: khoá do caller cấp, tách khỏi khoá của lần thanh toán đầu
  const result = await paymentApi.createPayment(
    {
      branchId: order.branchId,
      paymentMethod,
      allocations: [{ orderId: order.id, allocatedAmount: order.finalAmount }],
      returnUrl: onlineReturnUrl(order.id),
    },
    { idempotencyKey: ownKey ?? keyFor(order.id, paymentMethod) },
  );
  if (!ownKey) paymentKeys.delete(`${order.id}:${paymentMethod}`);
  rememberPaymentId(order.id, result.payment.id); // trang return cần biết hỏi giao dịch nào (cổng không mang id này)
  if (!result.redirectUrl) {
    throw new PaymentInitError('PAYMENT_URL_MISSING', 'Chưa nhận được liên kết thanh toán. Vui lòng bấm thử lại.');
  }
  return gatewayTarget(result.redirectUrl);
}
