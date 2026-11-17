import { useCallback, useRef, useState } from 'react';
import type { OrderDetail } from '@/shared/types';
import { describeOnlineError, PaymentInitError } from '../errors';
import { initiatePayment, needsGateway, type PaymentChoice, type PaymentNext } from '../payment';
import { placeOnlineOrder } from '../submit';

export interface CheckoutResult {
  order: OrderDetail;
  next: PaymentNext;
}

/**
 * Hai bước TÁCH BẠCH:
 *  1) tạo đơn (nghiệp vụ đơn hàng – API/mock đơn hàng hiện có)
 *  2) khởi tạo thanh toán (payment.ts): COD bỏ qua; VNPay/Momo → POST /payments, trả bước kế tiếp (redirect/cổng mock)
 * Nếu bước 2 lỗi sau khi đơn đã tạo (giỏ đã dọn), lần bấm tiếp theo chỉ lặp bước 2 trên cùng đơn — không tạo đơn thứ hai.
 */
export function useOnlineCheckout() {
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  // Cờ đồng bộ: chặn lần bấm thứ hai trước cả khi React kịp render lại nút ở trạng thái disabled.
  const busy = useRef(false);
  // Đơn đã tạo nhưng chưa khởi tạo được thanh toán.
  const created = useRef<OrderDetail | null>(null);
  // Bản state của `created` để trang checkout biết còn đơn chờ khởi tạo thanh toán (giỏ cục bộ đã dọn sau khi tạo đơn).
  const [pendingOrder, setPendingOrder] = useState<OrderDetail | null>(null);

  const submit = useCallback(
    async (args: { method: PaymentChoice; note?: string; voucherCode?: string }): Promise<CheckoutResult | null> => {
      if (busy.current) return null;
      busy.current = true;
      setSubmitting(true);
      setError(null);
      try {
        if (created.current && !needsGateway(args.method)) {
          throw new PaymentInitError('ORDER_AWAITING_PAYMENT', 'Đơn hàng đã được tạo và đang chờ thanh toán online. Vui lòng chọn Visa/Master hoặc MoMo để tiếp tục.');
        }
        const order =
          created.current ??
          (await placeOnlineOrder({
            method: args.method,
            ...(args.note ? { note: args.note } : {}),
            ...(args.voucherCode ? { voucherCode: args.voucherCode } : {}),
          }));
        if (needsGateway(args.method)) {
          created.current = order;
          setPendingOrder(order);
        }
        const next = await initiatePayment(order, args.method);
        created.current = null;
        setPendingOrder(null);
        return { order, next };
      } catch (e) {
        setError(describeOnlineError(e));
        return null;
      } finally {
        busy.current = false;
        setSubmitting(false);
      }
    },
    [],
  );

  return { submit, isSubmitting, error, pendingOrder };
}
