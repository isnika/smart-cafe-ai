import { describe, expect, it } from 'vitest';
import type { OrderDetail } from '@/shared/types';
import { computeDayStats } from './stats';

const NOW = new Date('2026-10-30T05:00:00Z').getTime();
const make = (over: Partial<OrderDetail>) =>
  ({ id: 1, orderCode: 'SC1', orderSource: 'QR', status: 'Pending', paymentStatus: 'Unpaid', finalAmount: 50_000, createdAt: '2026-10-30T04:00:00Z', ...over }) as OrderDetail;

describe('computeDayStats', () => {
  it('rỗng → toàn số 0 (không bịa số liệu)', () => {
    expect(computeDayStats([], NOW)).toEqual({ total: 0, open: 0, completed: 0, collectedAmount: 0, collectedOrders: 0, awaitingCounter: 0 });
  });

  it('chỉ tính đơn tạo trong ngày; tiền đã thu chỉ cộng đơn Paid; chờ thu chỉ đếm đơn tại quầy chưa trả', () => {
    const stats = computeDayStats(
      [
        make({ id: 1 }), // chờ thu, đang xử lý
        make({ id: 2, status: 'Completed', paymentStatus: 'Paid', finalAmount: 80_000 }),
        make({ id: 3, orderSource: 'Online', status: 'Ready', paymentStatus: 'Paid', finalAmount: 20_000 }),
        make({ id: 4, status: 'Cancelled' }),
        make({ id: 5, createdAt: '2026-10-28T04:00:00Z', status: 'Completed', paymentStatus: 'Paid' }), // hôm khác
      ],
      NOW,
    );
    expect(stats).toEqual({ total: 4, open: 2, completed: 1, collectedAmount: 100_000, collectedOrders: 2, awaitingCounter: 1 });
  });
});
