import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { isApiError, myOrderApi } from '@/shared/api';
import type { MyOrderDetail, OrderHistoryEntry } from '@/shared/api/order-me.types';
import { isTerminalOrderStatus } from '@/shared/lib';

const POLL_MS = 15_000;

/** 4xx không thử lại (404/403 không tự hết); lỗi mạng/5xx thử lại 1 lần sau 0,5s. */
const retry = (count: number, error: unknown) => !(isApiError(error) && error.status >= 400 && error.status < 500) && count < 1;
const retryDelay = 500;

/**
 * Theo dõi 1 đơn: GET /orders/me/{id} (chi tiết) + GET /orders/{id}/history (timeline, dữ liệu thật).
 * - Poll 15s, dừng khi đơn ở trạng thái cuối; tab ẩn thì React Query tự tạm dừng.
 * - Timeline chỉ lấy từ /history; KHÔNG tạo dòng lịch sử từ order.status hay payment_status.
 */
export function useOrderTracking(orderId: string | undefined) {
  const id = Number(orderId);
  const valid = Number.isInteger(id) && id > 0;

  const detail = useQuery<MyOrderDetail>({
    queryKey: ['order', 'me', id],
    enabled: valid,
    retry,
    retryDelay,
    queryFn: ({ signal }) => myOrderApi.getMyOrder(id, signal),
    refetchInterval: (q) => (q.state.data && isTerminalOrderStatus(q.state.data.status) ? false : POLL_MS),
  });

  const history = useQuery<OrderHistoryEntry[]>({
    queryKey: ['order', 'history', id],
    enabled: valid,
    retry,
    retryDelay,
    queryFn: ({ signal }) => myOrderApi.getOrderHistory(id, signal),
    refetchInterval: () => (detail.data && isTerminalOrderStatus(detail.data.status) ? false : POLL_MS),
  });

  // Detail đã sang trạng thái mới mà history chưa có → lấy lại history đúng 1 lần cho mỗi (version,status).
  const order = detail.data;
  const last = history.data?.[history.data.length - 1];
  const stale = !!order && !!last && last.status !== order.status;
  const refetchedFor = useRef<string | null>(null);
  const { refetch: refetchHistory, isFetching: historyFetching } = history;
  useEffect(() => {
    if (!stale || !order || historyFetching) return;
    const key = `${order.version}:${order.status}`;
    if (refetchedFor.current === key) return;
    refetchedFor.current = key;
    void refetchHistory();
  }, [stale, order, historyFetching, refetchHistory]);

  return {
    order,
    history: history.data,
    historyStale: stale,
    isLoading: valid && detail.isPending,
    isError: !valid || detail.isError,
    notFound: !valid || (isApiError(detail.error) && detail.error.status === 404),
    historyLoading: valid && history.isPending,
    historyError: history.isError,
    refetch: () => void detail.refetch(),
    refetchHistory: () => void history.refetch(),
  };
}
