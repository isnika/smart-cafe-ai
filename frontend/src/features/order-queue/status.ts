import type { FulfillmentType, OrderDetail, OrderStatus } from '@/shared/types';
import { getNextStatuses, parseUtc } from '@/shared/lib';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  Pending_Payment: 'Chờ thanh toán',
  Pending: 'Mới nhận',
  Confirmed: 'Đã xác nhận',
  Preparing: 'Đang pha chế',
  Ready: 'Sẵn sàng trả món',
  Shipping: 'Đang giao',
  Served: 'Đã phục vụ',
  Completed: 'Hoàn thành',
  Cancelled: 'Đã huỷ',
  Rejected: 'Đã từ chối',
};

export const FULFILLMENT_LABEL: Record<FulfillmentType, string> = {
  Dine_In: 'Tại quán',
  Delivery: 'Giao hàng',
  Pickup: 'Mang đi',
};

/** Các cột Kanban theo thứ tự xử lý. */
export const QUEUE_COLUMNS = ['Pending', 'Confirmed', 'Preparing', 'Ready'] as const satisfies readonly OrderStatus[];
export type QueueStatus = (typeof QUEUE_COLUMNS)[number];

export const COLUMN_STYLE: Record<QueueStatus, { head: string; dot: string }> = {
  Pending: { head: 'bg-info-soft text-info-strong', dot: 'bg-info' },
  Confirmed: { head: 'bg-ai-from/10 text-ai-from', dot: 'bg-ai-from' },
  Preparing: { head: 'bg-accent-50 text-accent-700', dot: 'bg-accent-500' },
  Ready: { head: 'bg-success-soft text-success-strong', dot: 'bg-success' },
};

/** Nhãn nút "bước tiếp theo" theo loại đơn; chỉ khai báo các bước thực sự tồn tại trong ORDER_TRANSITIONS. */
const ADVANCE_LABEL: Partial<Record<FulfillmentType, Partial<Record<OrderStatus, string>>>> = {
  Dine_In: { Pending: 'Xác nhận đơn', Confirmed: 'Bắt đầu pha chế', Preparing: 'Hoàn tất pha chế', Ready: 'Xác nhận hoàn thành & Trả món', Served: 'Hoàn thành đơn' },
  Pickup: { Pending: 'Xác nhận đơn', Confirmed: 'Bắt đầu pha chế', Preparing: 'Hoàn tất pha chế', Ready: 'Giao khách & hoàn thành' },
  Delivery: { Pending: 'Xác nhận đơn', Confirmed: 'Bắt đầu pha chế', Preparing: 'Hoàn tất pha chế', Ready: 'Giao cho shipper', Shipping: 'Xác nhận đã giao' },
};

/** Trạng thái kế tiếp trên đường "đi thẳng" (bỏ Cancelled/Rejected). */
export function nextAdvanceStatus(order: Pick<OrderDetail, 'fulfillmentType' | 'status'>): OrderStatus | null {
  return getNextStatuses(order.fulfillmentType, order.status).find((s) => s !== 'Cancelled' && s !== 'Rejected') ?? null;
}

export const advanceLabel = (order: Pick<OrderDetail, 'fulfillmentType' | 'status'>): string | null =>
  ADVANCE_LABEL[order.fulfillmentType]?.[order.status] ?? null;

/** Pending → Rejected (từ chối đơn mới); các trạng thái sau → Cancelled. null = không huỷ được. */
export function cancelTarget(order: Pick<OrderDetail, 'fulfillmentType' | 'status'>): 'Rejected' | 'Cancelled' | null {
  const next = getNextStatuses(order.fulfillmentType, order.status);
  if (next.includes('Rejected')) return 'Rejected';
  if (next.includes('Cancelled')) return 'Cancelled';
  return null;
}

export function whereLabel(order: Pick<OrderDetail, 'fulfillmentType' | 'tableNumber'>): string {
  return order.fulfillmentType === 'Dine_In' && order.tableNumber ? `Bàn ${order.tableNumber}` : FULFILLMENT_LABEL[order.fulfillmentType];
}

export const itemCount = (order: Pick<OrderDetail, 'items'>): number => order.items.reduce((n, i) => n + i.quantity, 0);

export function minutesSince(createdAt: string, now = Date.now()): number {
  const d = parseUtc(createdAt);
  return d ? Math.max(0, Math.floor((now - d.getTime()) / 60_000)) : 0;
}

export const timeLabel = (iso: string): string => {
  const d = parseUtc(iso);
  return d ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—';
};
