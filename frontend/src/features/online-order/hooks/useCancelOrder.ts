import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ERROR_CODES, isApiError, myOrderApi } from '@/shared/api';
import { BUSINESS_RULE_VIOLATION_CODE, INVALID_STATE_TRANSITION_CODE } from '@/shared/api/order-me.types';

export type CancelFailure =
  /** Đơn đã đổi (409 VERSION_CONFLICT): đã tải lại, KHÔNG tự gửi lại lệnh hủy. */
  | { kind: 'stale'; message: string }
  /** Không thể hủy ở trạng thái hiện tại / quy tắc nghiệp vụ (409 INVALID_STATE_TRANSITION, 422). */
  | { kind: 'business'; message: string }
  /** Lỗi khác: giữ hộp thoại để khách thử lại. */
  | { kind: 'other'; message: string };

const orderKey = (id: number) => ['order', 'me', id] as const;
const historyKey = (id: number) => ['order', 'history', id] as const;

/** Phân loại lỗi PATCH hủy → thông báo tiếng Việt. Không dựa vào chuỗi message của server. */
export function describeCancelError(e: unknown): CancelFailure {
  if (!isApiError(e)) return { kind: 'other', message: 'Không thể hủy đơn. Vui lòng thử lại.' };
  if (e.status === 409 && e.code === API_ERROR_CODES.VERSION_CONFLICT) {
    return { kind: 'stale', message: 'Đơn hàng vừa được cập nhật. Chúng tôi đã tải lại thông tin mới nhất, vui lòng kiểm tra rồi hủy lại nếu vẫn muốn.' };
  }
  if (e.status === 409 && e.code === INVALID_STATE_TRANSITION_CODE) {
    return { kind: 'business', message: 'Đơn hàng không thể hủy ở trạng thái hiện tại (quán có thể đã tiếp nhận đơn).' };
  }
  if (e.status === 422 && e.code === BUSINESS_RULE_VIOLATION_CODE) {
    return { kind: 'business', message: 'Đơn đã thanh toán nên không thể hủy trực tiếp. Vui lòng liên hệ quán để được hỗ trợ.' };
  }
  if (e.status === 404) return { kind: 'other', message: 'Không tìm thấy đơn hàng hoặc đơn không thuộc tài khoản của bạn.' };
  if (e.status === 403) return { kind: 'other', message: 'Bạn không có quyền hủy đơn này.' };
  if (e.status === 400) return { kind: 'other', message: 'Thông tin hủy đơn chưa hợp lệ. Vui lòng kiểm tra lại lý do.' };
  if (e.status === 0) return { kind: 'other', message: 'Không thể kết nối tới máy chủ. Vui lòng thử lại.' };
  return { kind: 'other', message: 'Không thể hủy đơn lúc này. Vui lòng thử lại sau.' };
}

/**
 * Hủy đơn của khách: PATCH /orders/{id}/status. `version` được truyền theo từng lần gọi (bản đơn hiện tại), hook không tự nhớ.
 * - Thành công: tải lại chi tiết + lịch sử + danh sách (response PATCH là bản rút gọn).
 * - 409 VERSION_CONFLICT / INVALID_STATE_TRANSITION / 422: tải lại chi tiết + lịch sử rồi báo lỗi; KHÔNG gửi lại PATCH.
 */
export function useCancelOrder(orderId: number) {
  const qc = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      qc.refetchQueries({ queryKey: orderKey(orderId) }),
      qc.refetchQueries({ queryKey: historyKey(orderId) }),
    ]);
  };
  return useMutation({
    mutationFn: (input: { cancelReason: string; version: number }) => myOrderApi.cancelMyOrder(orderId, input),
    onSuccess: async () => {
      await refresh();
      void qc.invalidateQueries({ queryKey: ['orders', 'mine'] });
    },
    onError: async (e) => {
      if (describeCancelError(e).kind !== 'other') await refresh();
    },
  });
}
