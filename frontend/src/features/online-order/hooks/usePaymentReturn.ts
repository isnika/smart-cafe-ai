import { useEffect, useState } from 'react';
import { isApiError, paymentApi } from '@/shared/api';
import type { PayResult } from '@/shared/types';

/** Khoảng hỏi lại trạng thái giao dịch và thời gian chờ tối đa sau khi khách quay về từ cổng. */
export const RETURN_POLL_MS = 2_000;
export const RETURN_TIMEOUT_MS = 60_000;

export type PaymentReturnState =
  | { phase: 'polling'; result: PayResult | null; lastError: unknown }
  /** status != Pending: đã chốt (Success | Failed | Cancelled | Expired). */
  | { phase: 'settled'; result: PayResult }
  /** Hết thời gian chờ mà server vẫn chưa trả kết quả: CHƯA xác nhận được, không đồng nghĩa thất bại. */
  | { phase: 'timeout'; result: PayResult | null }
  /** Không đọc được giao dịch (404/403/401) hoặc giao dịch không thuộc đơn trên URL. */
  | { phase: 'error'; error: unknown }
  | { phase: 'invalid' };

export interface PaymentReturnOptions {
  /** Đơn trên URL; giao dịch phải có allocation thuộc đơn này (chống ghép sai orderId/paymentId). */
  orderId: number | null;
  paymentId: number | null;
  pollMs?: number;
  timeoutMs?: number;
  /** Cho test; mặc định GET /payments/{id}. */
  fetchPayment?: (id: number, opts: { signal: AbortSignal }) => Promise<PayResult>;
}

const TERMINAL_HTTP = new Set([401, 403, 404]);

/**
 * Polling GET /payments/{id} sau khi quay về từ cổng.
 *  - Hỏi ngay khi mở trang, rồi mỗi `pollMs` sau khi lần trước trả về (không chồng request).
 *  - Dừng khi status != Pending, khi hết `timeoutMs`, khi lỗi không thể thử lại, hoặc khi unmount.
 *  - Lỗi tạm thời (mạng, 5xx) giữ nguyên trạng thái đang chờ và hỏi lại tới hết thời gian chờ.
 *  - Trạng thái CHỈ lấy từ response của server; hook không biết gì về query của cổng (vnp_*...).
 * Mọi timer/request được dọn khi unmount hoặc khi đổi (orderId, paymentId).
 */
export function usePaymentReturn(opts: PaymentReturnOptions): PaymentReturnState {
  const { orderId, paymentId, pollMs = RETURN_POLL_MS, timeoutMs = RETURN_TIMEOUT_MS } = opts;
  const fetchPayment = opts.fetchPayment ?? ((id, o) => paymentApi.getPaymentById(id, o));
  const valid = orderId !== null && paymentId !== null;
  const key = `${orderId}:${paymentId}`;
  // Trạng thái gắn với (orderId, paymentId) đã sinh ra nó: đổi id thì trạng thái cũ tự bị bỏ, không cần setState trong effect.
  const [held, setHeld] = useState<{ key: string; value: PaymentReturnState } | null>(null);

  useEffect(() => {
    if (orderId === null || paymentId === null) return;
    const publish = (value: PaymentReturnState) => setHeld({ key, value });

    const controller = new AbortController();
    const timers: { poll?: ReturnType<typeof setTimeout>; deadline?: ReturnType<typeof setTimeout> } = {};
    let stopped = false;
    let last: PayResult | null = null;

    const stop = () => {
      stopped = true;
      clearTimeout(timers.poll);
      clearTimeout(timers.deadline);
      controller.abort();
    };

    timers.deadline = setTimeout(() => {
      if (stopped) return;
      stop();
      publish({ phase: 'timeout', result: last });
    }, timeoutMs);

    const poll = async () => {
      try {
        const result = await fetchPayment(paymentId, { signal: controller.signal });
        if (stopped) return;
        if (result.allocations.length > 0 && !result.allocations.some((a) => a.orderId === orderId)) {
          stop();
          publish({ phase: 'error', error: new Error('PAYMENT_ORDER_MISMATCH') });
          return;
        }
        last = result;
        if (result.payment.status !== 'Pending') {
          stop();
          publish({ phase: 'settled', result });
          return;
        }
        publish({ phase: 'polling', result, lastError: null });
      } catch (e) {
        if (stopped) return;
        if (isApiError(e) && TERMINAL_HTTP.has(e.status)) {
          stop();
          publish({ phase: 'error', error: e });
          return;
        }
        publish({ phase: 'polling', result: last, lastError: e });
      }
      if (!stopped) timers.poll = setTimeout(() => void poll(), pollMs);
    };

    void poll();
    return stop;
    // fetchPayment cố ý không nằm trong deps: truyền hàm mới mỗi render không được phép khởi động lại polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, paymentId, key, pollMs, timeoutMs]);

  if (!valid) return { phase: 'invalid' };
  return held && held.key === key ? held.value : { phase: 'polling', result: null, lastError: null };
}
