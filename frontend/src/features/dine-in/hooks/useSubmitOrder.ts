import { useCallback, useRef, useState } from 'react';
import type { OrderDetail } from '@/shared/types';
import { describeApiError } from '../errors';
import { placeDineInOrder, SubmitOrderError } from '../submit';

/** Thông báo cho khách; lỗi mạng / 5xx cho phép thử lại, lỗi nghiệp vụ (409/422: hết món, phiên đóng…) thì cần quay lại giỏ. */
export function describeSubmitError(err: unknown): { message: string; retryable: boolean } {
  if (err instanceof SubmitOrderError) return { message: err.message, retryable: err.code === 'NO_CART' };
  const { message, retryable } = describeApiError(err);
  return { message, retryable };
}

export function useSubmitDineInOrder() {
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  // Cờ đồng bộ: chặn lần bấm thứ hai trước cả khi React kịp render lại nút ở trạng thái disabled.
  const busy = useRef(false);

  const submit = useCallback(async (note?: string): Promise<OrderDetail | null> => {
    if (busy.current) return null;
    busy.current = true;
    setSubmitting(true);
    setError(null);
    try {
      return await placeDineInOrder({ note });
    } catch (e) {
      setError(describeSubmitError(e));
      return null;
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }, []);

  return { submit, isSubmitting, error };
}
