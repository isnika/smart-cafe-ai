import { create } from 'zustand';
import type { OrderDetail } from '@/shared/types';

/**
 * Đơn khách vừa đặt, giữ trong sessionStorage để trang xác nhận F5 vẫn hiển thị được
 * mà KHÔNG phải gửi lại đơn (trang đó chỉ đọc, không bao giờ POST).
 * Khách không có API xem đơn nên đây là nguồn dữ liệu duy nhất cho màn hình xác nhận.
 */
const STORAGE_KEY = 'smartcafe.dinein.placed';
const MAX_KEPT = 5;

function load(): OrderDetail[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as OrderDetail[]) : [];
  } catch {
    return [];
  }
}

function save(orders: OrderDetail[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  } catch {
    /* storage bị chặn → chỉ sống trong RAM */
  }
}

interface PlacedOrdersState {
  orders: OrderDetail[];
  record: (order: OrderDetail) => void;
  get: (orderId: number) => OrderDetail | undefined;
}

export const usePlacedOrders = create<PlacedOrdersState>((set, get) => ({
  orders: load(),
  record: (order) => {
    const next = [order, ...get().orders.filter((o) => o.id !== order.id)].slice(0, MAX_KEPT);
    save(next);
    set({ orders: next });
  },
  get: (orderId) => get().orders.find((o) => o.id === orderId),
}));
