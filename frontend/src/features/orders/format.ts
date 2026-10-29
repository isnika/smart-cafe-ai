import { parseUtc } from '@/shared/lib';
import type { OrderDetail, OrderStatus } from '@/shared/types';

/** Tab lọc của trang lịch sử đơn. */
export type OrderTab = 'all' | 'completed' | 'cancelled';

export const ORDER_TABS: ReadonlyArray<{ id: OrderTab; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'completed', label: 'Hoàn tất' },
  { id: 'cancelled', label: 'Đã huỷ' },
];

/** Tab → status gửi lên server (undefined = không lọc). Đơn bị quán từ chối được xếp vào "Đã huỷ". */
export const TAB_STATUSES: Record<OrderTab, OrderStatus[] | undefined> = {
  all: undefined,
  completed: ['Completed'],
  cancelled: ['Cancelled', 'Rejected'],
};

const pad = (n: number) => String(n).padStart(2, '0');
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Hôm nay, 14:25" · "Hôm qua, 14:25" · "12 Tháng 10, 08:30" (theo giờ máy người dùng). */
export function orderTimeLabel(createdAt: string, now: Date = new Date()): string {
  const d = parseUtc(createdAt);
  if (!d) return '—';
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days === 0) return `Hôm nay, ${time}`;
  if (days === 1) return `Hôm qua, ${time}`;
  const date = `${d.getDate()} Tháng ${d.getMonth() + 1}`;
  return d.getFullYear() === now.getFullYear() ? `${date}, ${time}` : `${date}, ${d.getFullYear()}, ${time}`;
}

/** "Cà phê sữa đá" · "Cà phê sữa đá và 1 món khác" (đếm theo số dòng món, không theo số lượng). */
export function orderSummary(order: Pick<OrderDetail, 'items'>): string {
  const [first, ...rest] = order.items;
  if (!first) return 'Không có món';
  return rest.length === 0 ? first.productName : `${first.productName} và ${rest.length} món khác`;
}
