import { parseUtc } from '@/shared/lib';
import type { FulfillmentType, InventoryItemView, OrderDetail, OrderSource } from '@/shared/types';
import { isAttention, statusOfItem } from '@/features/manager-inventory/model';
import type { DayStats } from '@/features/staff-dashboard/stats';

const sameLocalDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Đơn tạo trong ngày của `now` (giờ địa phương) — cùng cách xác định ngày với computeDayStats. */
function ordersOfToday(orders: readonly OrderDetail[], now: number): { order: OrderDetail; created: Date }[] {
  const today = new Date(now);
  const result: { order: OrderDetail; created: Date }[] = [];
  for (const order of orders) {
    const created = parseUtc(order.createdAt);
    if (created && sameLocalDay(created, today)) result.push({ order, created });
  }
  return result;
}

const isCancelledOrRejected = (order: Pick<OrderDetail, 'status'>) => order.status === 'Cancelled' || order.status === 'Rejected';

// ── Doanh thu theo giờ ────────────────────────────────────────────────
export interface HourlyRevenue {
  /** 0–23, giờ địa phương theo createdAt. */
  hour: number;
  /** Σ finalAmount của đơn Paid tạo trong giờ này (chưa trừ hoàn tiền một phần). */
  amount: number;
  orders: number;
}

/** Luôn đúng 24 mốc 0–23h. "Đã thu" định nghĩa như computeDayStats: paymentStatus = 'Paid'. */
export function revenueByHour(orders: readonly OrderDetail[], now: number): HourlyRevenue[] {
  const buckets: HourlyRevenue[] = Array.from({ length: 24 }, (_, hour) => ({ hour, amount: 0, orders: 0 }));
  for (const { order, created } of ordersOfToday(orders, now)) {
    if (order.paymentStatus !== 'Paid') continue;
    const bucket = buckets[created.getHours()];
    bucket.amount += order.finalAmount;
    bucket.orders += 1;
  }
  return buckets;
}

// ── Chỉ số trung bình / tỉ lệ ─────────────────────────────────────────
/** Giá trị trung bình mỗi đơn đã thu; 0 khi chưa có đơn đã thu. */
export function averageOrderValue(stats: Pick<DayStats, 'collectedAmount' | 'collectedOrders'>): number {
  return stats.collectedOrders > 0 ? stats.collectedAmount / stats.collectedOrders : 0;
}

/** (Cancelled + Rejected) / tổng đơn hôm nay, trong khoảng 0–1; 0 khi chưa có đơn. */
export function cancelRate(orders: readonly OrderDetail[], now: number): number {
  const today = ordersOfToday(orders, now);
  if (today.length === 0) return 0;
  return today.filter(({ order }) => isCancelledOrRejected(order)).length / today.length;
}

// ── Cơ cấu đơn ────────────────────────────────────────────────────────
export interface OrderMix {
  /** Số đơn hôm nay đã loại Cancelled/Rejected. */
  total: number;
  byFulfillment: Record<FulfillmentType, number>;
  bySource: Record<OrderSource, number>;
}

export function orderMix(orders: readonly OrderDetail[], now: number): OrderMix {
  const mix: OrderMix = {
    total: 0,
    byFulfillment: { Dine_In: 0, Pickup: 0, Delivery: 0 },
    bySource: { QR: 0, POS: 0, Online: 0 },
  };
  for (const { order } of ordersOfToday(orders, now)) {
    if (isCancelledOrRejected(order)) continue;
    mix.total += 1;
    mix.byFulfillment[order.fulfillmentType] += 1;
    mix.bySource[order.orderSource] += 1;
  }
  return mix;
}

export const FULFILLMENT_LABEL: Record<FulfillmentType, string> = {
  Dine_In: 'Tại bàn',
  Pickup: 'Mang đi',
  Delivery: 'Giao hàng',
};

export const SOURCE_LABEL: Record<OrderSource, string> = {
  QR: 'QR',
  POS: 'POS',
  Online: 'Online',
};

// ── Cảnh báo kho ──────────────────────────────────────────────────────
/** Mức còn lại so với ngưỡng cảnh báo; ngưỡng 0 thì coi như 0 (không chia cho 0). */
const stockRatio = (item: Pick<InventoryItemView, 'available' | 'reorderLevel'>) => (item.reorderLevel > 0 ? item.available / item.reorderLevel : 0);

/** Chỉ hàng Sắp hết + Hết hàng. Hết hàng lên trước, sau đó available/reorderLevel tăng dần (gần cạn nhất trước). */
export function lowStockTop(items: readonly InventoryItemView[], n = 5): InventoryItemView[] {
  return items
    .filter((item) => isAttention(statusOfItem(item)))
    .sort((a, b) => {
      const outA = statusOfItem(a) === 'out' ? 0 : 1;
      const outB = statusOfItem(b) === 'out' ? 0 : 1;
      return outA - outB || stockRatio(a) - stockRatio(b) || a.ingredientName.localeCompare(b.ingredientName, 'vi');
    })
    .slice(0, Math.max(0, n));
}

// ── Hiển thị ──────────────────────────────────────────────────────────
const trimDecimal = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** 1_250_000 → "1,3tr" · 350_000 → "350k" · 800 → "800". Dùng cho nhãn trục biểu đồ. */
export function formatCompactVnd(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${trimDecimal(amount / 1_000_000)}tr`;
  if (abs >= 1_000) return `${trimDecimal(amount / 1_000)}k`;
  return String(Math.round(amount));
}

/** Làm tròn lên mốc "đẹp" (1/2/5 × 10^k) để trục tiền dễ đọc. */
export function niceCeil(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 5, 10].map((m) => m * magnitude).find((v) => v >= value) ?? value;
}

/** 0.125 → "12,5%". */
export const formatPercent = (ratio: number): string => `${trimDecimal(ratio * 100)}%`;
