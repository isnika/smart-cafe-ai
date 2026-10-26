import { useCallback, useRef, useState } from 'react';
import { describeSubmitError } from '@/features/dine-in/hooks/useSubmitOrder';
import type { OrderDetail } from '@/shared/types';
import { confirmPayment, type PaymentChoice } from '../payment';
import { placeOnlineOrder } from '../submit';

/**
 * Hai bước TÁCH BẠCH:
 *  1) tạo đơn (nghiệp vụ đơn hàng – API/mock đơn hàng hiện có)
 *  2) xác nhận thanh toán (payment.ts – DEMO tầng giao diện, điểm thay thế khi có API sandbox)
 * Chỉ trả đơn về (để điều hướng sang màn thành công) khi CẢ HAI xong.
 */
export function useOnlineCheckout() {
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  // Cờ đồng bộ: chặn lần bấm thứ hai trước cả khi React kịp render lại nút ở trạng thái disabled.
  const busy = useRef(false);

  const submit = useCallback(
    async (args: { method: PaymentChoice; note?: string; voucherCode?: string }): Promise<OrderDetail | null> => {
      if (busy.current) return null;
      busy.current = true;
      setSubmitting(true);
      setError(null);
      try {
        const order = await placeOnlineOrder({
          ...(args.note ? { note: args.note } : {}),
          ...(args.voucherCode ? { voucherCode: args.voucherCode } : {}),
        });
        await confirmPayment(order, args.method);
        return order;
      } catch (e) {
        setError(describeSubmitError(e));
        return null;
      } finally {
        busy.current = false;
        setSubmitting(false);
      }
    },
    [],
  );

  return { submit, isSubmitting, error };
}
