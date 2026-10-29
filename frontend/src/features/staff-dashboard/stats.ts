import { isTerminalOrderStatus, parseUtc } from '@/shared/lib';
import type { OrderDetail } from '@/shared/types';
import { cashierGroup } from '@/features/cashier/model';

export interface DayStats {
  /** Mọi đơn tạo trong ngày (kể cả đã huỷ/từ chối). */
  total: number;
  /** Chưa kết thúc (chưa Completed/Cancelled/Rejected). */
  open: number;
  completed: number;
  /** Tổng finalAmount của các đơn có paymentStatus = Paid (chưa trừ hoàn tiền một phần). */
  collectedAmount: number;
  collectedOrders: number;
  /** Đơn tại quầy đang chờ nhân viên thu tiền. */
  awaitingCounter: number;
}

const sameLocalDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Chỉ tính từ dữ liệu đơn thật; ngày theo múi giờ trình duyệt (nhân viên ở cùng múi giờ với quán). */
export function computeDayStats(orders: readonly OrderDetail[], now: number): DayStats {
  const today = new Date(now);
  const stats: DayStats = { total: 0, open: 0, completed: 0, collectedAmount: 0, collectedOrders: 0, awaitingCounter: 0 };
  for (const o of orders) {
    const created = parseUtc(o.createdAt);
    if (!created || !sameLocalDay(created, today)) continue;
    stats.total += 1;
    if (!isTerminalOrderStatus(o.status)) stats.open += 1;
    if (o.status === 'Completed') stats.completed += 1;
    if (o.paymentStatus === 'Paid') {
      stats.collectedAmount += o.finalAmount;
      stats.collectedOrders += 1;
    }
    if (cashierGroup(o) === 'awaiting_counter') stats.awaitingCounter += 1;
  }
  return stats;
}
