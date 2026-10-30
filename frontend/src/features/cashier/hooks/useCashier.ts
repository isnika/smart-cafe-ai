import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { orderApi, paymentApi } from '@/shared/api';
import type { InvoiceRequestInput, OrderDetail, PayResult } from '@/shared/types';
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
 * Thu tiền mặt tại quầy qua `paymentApi.payOrders` (POST /payment/payments). Từ chối ngay (không gọi API) nếu đơn
 * không đủ điều kiện. Danh sách chỉ cập nhật bằng cách tải lại từ API — không ẩn card ở frontend.
 * Khóa idempotency gắn với phiên bản đơn: bấm lặp trên cùng một đơn luôn trả về cùng một giao dịch.
 */
export function useCollectCash(order: OrderDetail | null) {
  const qc = useQueryClient();
  return useMutation<PayResult, Error, { cashReceived: number; invoice?: InvoiceRequestInput }>({
    mutationFn: async ({ cashReceived, invoice }) => {
      if (!order || !canCollectAtCounter(order)) throw new Error('Đơn này không thể thu tiền tại quầy.');
      return paymentApi.payOrders({
        orderIds: [order.id],
        method: 'Cash',
        cashReceived,
        ...(invoice ? { invoice } : {}),
        idempotencyKey: `cashier-${order.id}-v${order.version}`,
      });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: CASHIER_FEED_KEY });
      void qc.invalidateQueries({ queryKey: ['staff', 'orders'] });
    },
  });
}

export const orderInvoiceKey = (orderId: number) => ['staff', 'invoice', orderId] as const;

/** Hóa đơn chỉ đọc (GET): mở/đóng/tải lại không bao giờ tạo payment hay hóa đơn mới. */
export const useOrderInvoice = (orderId: number) =>
  useQuery({
    queryKey: orderInvoiceKey(orderId),
    queryFn: ({ signal }) => paymentApi.getInvoiceByOrder(orderId, signal),
    retry: false,
    refetchOnWindowFocus: false,
  });
