import { db, nowNaive } from './db';

/**
 * Dữ liệu demo cho màn Bàn & phiên bàn (chỉ dev, gọi từ enableMocking SAU seedDemoOrders — không chạy trong test mặc định).
 * seedDemoOrders đã mở sẵn phiên Active cho bàn 1–5; ở đây: bàn 4 (đơn đã Served) và bàn 5 chuyển Payment_Pending,
 * thêm 1 phiên Completed và 1 phiên Cancelled cũ cho bàn 2 để bộ lọc có dữ liệu. Idempotent.
 */
export function seedDemoTableSessions(): void {
  if (db.sessions.some((s) => s.status === 'Completed' || s.status === 'Cancelled')) return;
  for (const tableId of [4, 5]) {
    const open = db.sessions.find((s) => s.tableId === tableId && s.status === 'Active');
    if (open) open.status = 'Payment_Pending';
  }
  const past = (status: 'Completed' | 'Cancelled', minutesAgo: number) => {
    db.sessions.push({
      id: ++db.seq.session, tableId: 2, sessionCode: `seed-past-${status}-${db.seq.session}`, customerId: null, status,
      openedAt: nowNaive(-(minutesAgo + 40) * 60_000), expiresAt: nowNaive(-(minutesAgo - 200) * 60_000), closedAt: nowNaive(-minutesAgo * 60_000),
    });
  };
  past('Completed', 300);
  past('Cancelled', 200);
}
