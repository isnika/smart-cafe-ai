import { useCallback, useRef, useState } from 'react';
import type { Payment } from '@/shared/types';
import { describeOnlineError, PaymentRetryBlockedError } from '../errors';
import { retryPayment, type RetryResult } from '../payment-retry';

export interface PaymentRetryOptions {
  orderId: number;
  /** Giao dịch vừa thất bại (chỉ lấy phương thức + key cũ để không trùng). */
  payment: Pick<Payment, 'paymentMethod' | 'idempotencyKey'>;
  /** Cho test; mặc định retryPayment (refetch đơn → kiểm tra → POST /payments với key mới). */
  retry?: typeof retryPayment;
}

/**
 * Trạng thái UI của nút "Thử thanh toán lại".
 *  - `blocked`: đơn không còn hợp lệ → ẩn nút, hiện thông báo (không thử lại được).
 *  - `error`: lỗi tạm thời (mạng/5xx) → nút vẫn bấm lại được.
 * Hook không điều hướng; trang gọi `retry()` rồi tự redirect theo `next`.
 */
export function usePaymentRetry({ orderId, payment, retry = retryPayment }: PaymentRetryOptions) {
  const [isRetrying, setRetrying] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false); // chặn bấm đôi trước khi React kịp render nút disabled

  const run = useCallback(async (): Promise<RetryResult | null> => {
    if (busy.current) return null;
    busy.current = true;
    setRetrying(true);
    setError(null);
    try {
      return await retry(orderId, payment);
    } catch (e) {
      if (e instanceof PaymentRetryBlockedError) setBlocked(e.message);
      else setError(describeOnlineError(e).message);
      return null;
    } finally {
      busy.current = false;
      setRetrying(false);
    }
  }, [orderId, payment, retry]);

  return { retry: run, isRetrying, blocked, error };
}
