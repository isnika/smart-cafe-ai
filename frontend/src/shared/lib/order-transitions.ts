import type { FulfillmentType, OrderStatus } from '@/shared/types';

type TransitionTable = Readonly<Record<OrderStatus, readonly OrderStatus[]>>;

const BASE: TransitionTable = {
  Pending_Payment: ['Pending', 'Cancelled'], // → Pending khi cổng thanh toán báo Success (hệ thống, không phải nút bấm)
  Pending: ['Confirmed', 'Rejected', 'Cancelled'],
  Confirmed: ['Preparing', 'Cancelled'],
  Preparing: ['Ready', 'Cancelled'], // huỷ khi đang pha: UI cảnh báo nguyên liệu đã dùng không hoàn được
  Ready: [],
  Shipping: [],
  Served: [],
  Completed: [],
  Cancelled: [],
  Rejected: [],
};

export const ORDER_TRANSITIONS: Readonly<Record<FulfillmentType, TransitionTable>> = {
  Delivery: { ...BASE, Ready: ['Shipping'], Shipping: ['Completed'] },
  Pickup: { ...BASE, Ready: ['Completed'] },
  Dine_In: { ...BASE, Ready: ['Served'], Served: ['Completed'] },
};

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['Completed', 'Cancelled', 'Rejected'];

/** `ChangeOrderStatusInput.note` bắt buộc khi chuyển sang các trạng thái này. */
export const NOTE_REQUIRED_STATUSES: readonly OrderStatus[] = ['Cancelled', 'Rejected'];

export function getNextStatuses(fulfillmentType: FulfillmentType, from: OrderStatus): readonly OrderStatus[] {
  return ORDER_TRANSITIONS[fulfillmentType][from];
}

export function canTransition(fulfillmentType: FulfillmentType, from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[fulfillmentType][from].includes(to);
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

export function requiresStatusNote(to: OrderStatus): boolean {
  return NOTE_REQUIRED_STATUSES.includes(to);
}