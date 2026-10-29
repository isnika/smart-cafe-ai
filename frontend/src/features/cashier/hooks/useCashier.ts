import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { orderApi, paymentApi } from '@/shared/api';
import type { OrderDetail, PayResult } from '@/shared/types';
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

/**
 * Ranh giới tích hợp cho phase 2: gọi đúng `paymentApi.payOrders` (POST /payment/payments).
 * Từ chối ngay (không gọi API) nếu đơn không đủ điều kiện thu tại quầy.
 */
export function useCollectCash(order: OrderDetail | null) {
  const qc = useQueryClient();
  return useMutation<PayResult, Error, { cashReceived: number }>({
    mutationFn: async ({ cashReceived }) => {
      if (!order || !canCollectAtCounter(order)) throw new Error('Đơn này không thể thu tiền tại quầy.');
      return paymentApi.payOrders({
        orderIds: [order.id],
        method: 'Cash',
        cashReceived,
        idempotencyKey: `cashier-${order.id}-v${order.version}`,
      });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: CASHIER_FEED_KEY });
      void qc.invalidateQueries({ queryKey: ['staff', 'orders'] });
    },
  });
}
