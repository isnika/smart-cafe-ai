import { isApiError } from '@/shared/api';
import { describeApiError } from '@/features/dine-in/errors';
import { SubmitOrderError } from '@/features/dine-in/submit';

export interface OnlineErrorInfo {
  code?: string;
  message: string;
  retryable: boolean;
}

/** Lỗi phía UI khi khởi tạo thanh toán online (đơn đã tạo, giao dịch chưa có đường dẫn thanh toán dùng được). Luôn thử lại được. */
export class PaymentInitError extends Error {
  readonly code: 'PAYMENT_URL_MISSING' | 'PAYMENT_URL_INVALID' | 'ORDER_AWAITING_PAYMENT';
  constructor(code: 'PAYMENT_URL_MISSING' | 'PAYMENT_URL_INVALID' | 'ORDER_AWAITING_PAYMENT', message: string) {
    super(message);
    this.name = 'PaymentInitError';
    this.code = code;
  }
}

export type PaymentRetryBlockCode = 'ORDER_NOT_FOUND' | 'ORDER_NOT_PENDING_PAYMENT' | 'ORDER_EXPIRED' | 'ORDER_ALREADY_PAID' | 'PAYMENT_METHOD_UNSUPPORTED';

/** Retry thanh toán bị chặn vì đơn không còn hợp lệ để trả (đã trả/hết hạn/không còn Pending_Payment). KHÔNG thử lại được. */
export class PaymentRetryBlockedError extends Error {
  readonly code: PaymentRetryBlockCode;
  constructor(code: PaymentRetryBlockCode, message: string) {
    super(message);
    this.name = 'PaymentRetryBlockedError';
    this.code = code;
  }
}

/**
 * Thông báo nghiệp vụ cho đặt đơn / giỏ Online (spec "MÃ LỖI"): 401/403 là phiên đăng nhập (không phải phiên bàn),
 * 409/422 theo mã lỗi thay vì lỗi chung. Các mã còn lại dùng chung bộ thông báo của Dine-in.
 */
export function describeOnlineError(err: unknown, ctx: { itemName?: string } = {}): OnlineErrorInfo {
  if (err instanceof PaymentRetryBlockedError) return { code: err.code, message: err.message, retryable: false };
  if (err instanceof PaymentInitError) return { code: err.code, message: err.message, retryable: true };
  if (err instanceof SubmitOrderError) return { code: err.code, message: err.message, retryable: err.code === 'NO_CART' };
  if (isApiError(err)) {
    const { status, code } = err;
    if (status === 401) return { code, message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để đặt hàng.', retryable: false };
    if (status === 403) return { code, message: err.message || 'Tài khoản không thể đặt đơn Online.', retryable: false };
    if (status === 400) return { code, message: err.message || 'Thông tin đơn hàng chưa hợp lệ. Vui lòng kiểm tra lại.', retryable: false };
    if (status === 409 && code === 'INVALID_STATE_TRANSITION') {
      return { code, message: 'Giỏ hàng đã được đặt hoặc không còn hiệu lực. Vui lòng kiểm tra lại giỏ hàng.', retryable: false };
    }
    if (status === 422 && code === 'BUSINESS_RULE_VIOLATION') {
      return { code, message: err.message || 'Đơn hàng không đáp ứng quy định của quán (chi nhánh đóng cửa, ngoài phạm vi giao hàng…).', retryable: false };
    }
  }
  const { code, message, retryable } = describeApiError(err, ctx);
  return { ...(code ? { code } : {}), message, retryable };
}
