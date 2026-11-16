import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cashierShiftApi, orderApi, paymentApi } from '@/shared/api';
import type { OrderDetail, PayResult } from '@/shared/types';
import { newKey } from '@/features/online-order/payment';
import { CASHIER_REFETCH_MS } from '../config';
import { canCollectAtCounter } from '../model';

export const CASHIER_FEED_KEY = ['staff', 'orders', 'cashier-feed'] as const;

/**
 * Đơn đang mở (cashier=feed, cũ nhất trước). React Query lo polling: một vòng cho mỗi key, không chồng request,
 * tự dừng khi không còn component nào dùng (unmount) và khi tab trình duyệt ẩn.
 */
export const cashierFeedQuery = () =>
  queryOptions({
    queryKey: CASHIER_FEED_KEY,
    queryFn: ({ signal }) => orderApi.listOrders({ cashier: 'feed', pageSize: 100 }, signal),
    refetchInterval: CASHIER_REFETCH_MS,
  });

export const useCashierFeed = () => useQuery(cashierFeedQuery());

export const cashierShiftQuery = () => queryOptions({
  queryKey: ['staff', 'cashier-shift', 'current'] as const,
  queryFn: () => cashierShiftApi.getCurrentCashierShift(),
  retry: false,
});

export const useCurrentCashierShift = () => useQuery(cashierShiftQuery());

const cashAttemptKeys = new Map<string, string>();
const cashPaymentIds = new Map<string, number>();
export const resetCashPaymentAttempt = (orderId: number) => {
  cashAttemptKeys.delete(String(orderId));
  cashPaymentIds.delete(String(orderId));
};

/**
 * Tạo và xác nhận giao dịch cashier v1. Một key cho một lần thu; lỗi/retry giữ key, thành công xóa để lần mới tạo key mới.
 */
export function useCollectCash(order: OrderDetail | null) {
  const qc = useQueryClient();
  const shift = useCurrentCashierShift();
  return useMutation<PayResult, Error, { cashReceived: number; newAttempt?: boolean }>({
    mutationFn: async ({ cashReceived, newAttempt }) => {
      if (!order || !canCollectAtCounter(order)) throw new Error('Đơn này không thể thu tiền tại quầy.');
      if (!shift.data || shift.data.status !== 'Open') throw new Error('Cần mở ca thu ngân trước khi thu tiền.');
      const id = String(order.id);
      if (newAttempt || !cashAttemptKeys.has(id)) cashAttemptKeys.set(id, newKey());
      const key = cashAttemptKeys.get(id)!;
      cashAttemptKeys.set(id, key);
      const priorPaymentId = cashPaymentIds.get(id);
      const created = priorPaymentId
        ? await paymentApi.getPaymentById(priorPaymentId)
        : await paymentApi.createPayment({
            branchId: order.branchId,
            paymentMethod: 'Cash',
            allocations: [{ orderId: order.id, allocatedAmount: order.finalAmount }],
            cashierShiftId: shift.data.id,
          }, { idempotencyKey: key });
      cashPaymentIds.set(id, created.payment.id);
      const confirmed = created.payment.status === 'Success'
        ? created
        : await paymentApi.confirmCashPayment(created.payment.id, { cashierShiftId: shift.data.id, cashReceived });
      return confirmed;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: CASHIER_FEED_KEY });
      void qc.invalidateQueries({ queryKey: ['staff', 'orders'] });
    },
    onSuccess: () => {
      if (order) resetCashPaymentAttempt(order.id);
      void qc.invalidateQueries({ queryKey: cashierShiftQuery().queryKey });
      void qc.invalidateQueries({ queryKey: CASHIER_FEED_KEY });
    },
  });
}

export const getCashPaymentAttemptId = (orderId: number) => cashPaymentIds.get(String(orderId));

export const orderInvoiceKey = (orderId: number) => ['staff', 'invoice', orderId] as const;

/** Hóa đơn chỉ đọc (GET): mở/đóng/tải lại không bao giờ tạo payment hay hóa đơn mới. */
export const useOrderInvoice = (orderId: number) =>
  useQuery({
    queryKey: orderInvoiceKey(orderId),
    queryFn: ({ signal }) => paymentApi.getInvoiceByOrder(orderId, signal),
    retry: false,
    refetchOnWindowFocus: false,
  });
