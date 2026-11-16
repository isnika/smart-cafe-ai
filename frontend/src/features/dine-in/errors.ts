import { isApiError } from '@/shared/api';

export interface DineInErrorInfo {
  code?: string;
  message: string;
  /** Lỗi tạm thời (mạng / 5xx): thử lại cùng thao tác là hợp lý. */
  retryable: boolean;
  /** Giỏ trên server có thể đã khác bản đang hiển thị → nên tải lại giỏ. */
  reloadCart: boolean;
}

/**
 * Map lỗi spec (409/422/…) sang thông báo cho khách. `itemName` = tên món đang thao tác (để báo hết hàng theo món).
 * 409 CONFLICT | INVALID_STATE_TRANSITION | IDEMPOTENCY_CONFLICT | VERSION_CONFLICT, 422 OUT_OF_STOCK | BUSINESS_RULE_VIOLATION.
 */
export function describeApiError(err: unknown, ctx: { itemName?: string } = {}): DineInErrorInfo {
  if (!isApiError(err)) {
    return { message: 'Đã có lỗi xảy ra. Vui lòng thử lại.', retryable: true, reloadCart: false };
  }
  const { status, code } = err;
  const base = { code, retryable: false, reloadCart: false };

  if (status === 0 || code === 'NETWORK_ERROR') {
    return { ...base, retryable: true, message: 'Mất kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại.' };
  }
  if (status >= 500) return { ...base, retryable: true, message: 'Máy chủ đang bận. Vui lòng thử lại sau ít giây.' };

  if (status === 422) {
    if (code === 'OUT_OF_STOCK') {
      return {
        ...base,
        reloadCart: true,
        message: ctx.itemName
          ? `"${ctx.itemName}" vừa hết hàng. Vui lòng bỏ món này hoặc chọn món khác.`
          : 'Có món vừa hết hàng. Vui lòng kiểm tra lại giỏ hàng.',
      };
    }
    return { ...base, reloadCart: true, message: err.message || 'Yêu cầu không hợp lệ với quy định của quán.' };
  }

  if (status === 409) {
    switch (code) {
      case 'VERSION_CONFLICT':
        return { ...base, reloadCart: true, message: 'Dữ liệu vừa được cập nhật ở nơi khác. Đã tải lại, vui lòng kiểm tra rồi thử lại.' };
      case 'IDEMPOTENCY_CONFLICT':
        return { ...base, reloadCart: true, message: 'Giỏ hàng đã thay đổi so với lần gửi trước. Vui lòng kiểm tra lại rồi gửi đơn.' };
      case 'INVALID_STATE_TRANSITION':
        return { ...base, message: 'Bàn đã yêu cầu thanh toán hoặc phiên đã đóng nên không thể gọi thêm món. Vui lòng gọi nhân viên.' };
      default:
        return { ...base, reloadCart: true, message: err.message || 'Có xung đột dữ liệu. Vui lòng tải lại và thử lại.' };
    }
  }

  if (status === 401 || status === 403) {
    return { ...base, message: 'Phiên bàn không còn hiệu lực. Vui lòng quét lại mã QR trên bàn.' };
  }
  if (status === 404) return { ...base, reloadCart: true, message: err.message || 'Không tìm thấy dữ liệu. Vui lòng tải lại.' };
  return { ...base, message: err.message || 'Đã có lỗi xảy ra. Vui lòng thử lại.' };
}
