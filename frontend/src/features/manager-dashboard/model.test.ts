import { describe, expect, it } from 'vitest';
import type { InventoryItemView, OrderDetail } from '@/shared/types';
import { computeDayStats } from '@/features/staff-dashboard/stats';
import { averageOrderValue, cancelRate, formatCompactVnd, formatPercent, lowStockTop, orderMix, revenueByHour } from './model';

/** Dựng mốc thời gian theo GIỜ ĐỊA PHƯƠNG (tháng 1-12) để test không phụ thuộc múi giờ máy chạy. */
const local = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute, 0);
const NOW = local(30, 15).getTime();

const order = (over: Partial<OrderDetail> & { at?: Date }): OrderDetail => {
  const { at = local(30, 9), ...rest } = over;
  return {
    id: 1, orderCode: 'SC1', orderSource: 'QR', fulfillmentType: 'Dine_In', status: 'Pending', paymentStatus: 'Unpaid', finalAmount: 50_000,
    createdAt: at.toISOString(), ...rest,
  } as OrderDetail;
};

const stock = (name: string, available: number, reorderLevel: number): InventoryItemView =>
  ({
    id: 1, branchId: 1, ingredientId: 1, quantityInStock: available, reservedQuantity: 0, reorderLevel, averageCost: 100, version: 1,
    updatedAt: '2026-10-30T08:00:00Z', ingredientName: name, unit: 'g', available, isLow: available <= reorderLevel,
  }) as InventoryItemView;

describe('revenueByHour', () => {
  it('luôn trả đủ 24 mốc 0–23h, rỗng thì toàn 0', () => {
    const rows = revenueByHour([], NOW);
    expect(rows).toHaveLength(24);
    expect(rows.map((r) => r.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i));
    expect(rows.every((r) => r.amount === 0 && r.orders === 0)).toBe(true);
  });

  it('chỉ cộng đơn Paid, gom theo giờ địa phương của createdAt', () => {
    const rows = revenueByHour(
      [
        order({ id: 1, paymentStatus: 'Paid', finalAmount: 40_000, at: local(30, 8, 5) }),
        order({ id: 2, paymentStatus: 'Paid', finalAmount: 60_000, at: local(30, 8, 59) }),
        order({ id: 3, paymentStatus: 'Paid', finalAmount: 25_000, at: local(30, 14, 0) }),
        order({ id: 4, paymentStatus: 'Unpaid', finalAmount: 99_000, at: local(30, 8, 30) }), // chưa thu → bỏ
        order({ id: 5, paymentStatus: 'Refunded', finalAmount: 77_000, at: local(30, 8, 30) }), // không phải Paid → bỏ
      ],
      NOW,
    );
    expect(rows[8]).toEqual({ hour: 8, amount: 100_000, orders: 2 });
    expect(rows[14]).toEqual({ hour: 14, amount: 25_000, orders: 1 });
    expect(rows.reduce((sum, r) => sum + r.amount, 0)).toBe(125_000);
  });

  it('bỏ đơn của ngày khác (kể cả sát nửa đêm) và khớp collectedAmount của computeDayStats', () => {
    const orders = [
      order({ id: 1, paymentStatus: 'Paid', finalAmount: 30_000, at: local(30, 0, 1) }),
      order({ id: 2, paymentStatus: 'Paid', finalAmount: 45_000, at: local(30, 23, 59) }),
      order({ id: 3, paymentStatus: 'Paid', finalAmount: 500_000, at: local(29, 23, 59) }), // hôm qua
      order({ id: 4, paymentStatus: 'Paid', finalAmount: 500_000, at: local(31, 0, 0) }), // ngày mai
    ];
    const rows = revenueByHour(orders, NOW);
    expect(rows[0].amount).toBe(30_000);
    expect(rows[23].amount).toBe(45_000);
    expect(rows.reduce((sum, r) => sum + r.amount, 0)).toBe(computeDayStats(orders, NOW).collectedAmount);
  });
});

describe('averageOrderValue', () => {
  it('= collectedAmount / collectedOrders', () => {
    expect(averageOrderValue({ collectedAmount: 150_000, collectedOrders: 3 })).toBe(50_000);
  });

  it('chia cho 0 → 0, không NaN', () => {
    const value = averageOrderValue({ collectedAmount: 0, collectedOrders: 0 });
    expect(value).toBe(0);
    expect(Number.isNaN(value)).toBe(false);
  });
});

describe('cancelRate', () => {
  it('= (Cancelled + Rejected) / tổng đơn hôm nay, không tính ngày khác', () => {
    const rate = cancelRate(
      [
        order({ id: 1, status: 'Completed' }),
        order({ id: 2, status: 'Cancelled' }),
        order({ id: 3, status: 'Rejected' }),
        order({ id: 4, status: 'Preparing' }),
        order({ id: 5, status: 'Cancelled', at: local(28, 10) }), // hôm khác
      ],
      NOW,
    );
    expect(rate).toBe(0.5);
  });

  it('không có đơn hôm nay → 0, không NaN', () => {
    expect(cancelRate([], NOW)).toBe(0);
    const onlyOldOrders = cancelRate([order({ status: 'Cancelled', at: local(1, 10) })], NOW);
    expect(onlyOldOrders).toBe(0);
    expect(Number.isNaN(onlyOldOrders)).toBe(false);
  });
});

describe('orderMix', () => {
  it('đếm theo hình thức và nguồn, loại đơn huỷ/từ chối và đơn ngày khác', () => {
    const mix = orderMix(
      [
        order({ id: 1, fulfillmentType: 'Dine_In', orderSource: 'QR' }),
        order({ id: 2, fulfillmentType: 'Dine_In', orderSource: 'POS' }),
        order({ id: 3, fulfillmentType: 'Pickup', orderSource: 'Online', status: 'Completed' }),
        order({ id: 4, fulfillmentType: 'Delivery', orderSource: 'Online', status: 'Cancelled' }), // loại
        order({ id: 5, fulfillmentType: 'Pickup', orderSource: 'POS', status: 'Rejected' }), // loại
        order({ id: 6, fulfillmentType: 'Delivery', orderSource: 'Online', at: local(29, 12) }), // hôm qua
      ],
      NOW,
    );
    expect(mix).toEqual({
      total: 3,
      byFulfillment: { Dine_In: 2, Pickup: 1, Delivery: 0 },
      bySource: { QR: 1, POS: 1, Online: 1 },
    });
  });

  it('rỗng → toàn 0', () => {
    expect(orderMix([], NOW)).toEqual({ total: 0, byFulfillment: { Dine_In: 0, Pickup: 0, Delivery: 0 }, bySource: { QR: 0, POS: 0, Online: 0 } });
  });
});

describe('lowStockTop', () => {
  const items = [
    stock('Ổn', 9_000, 2_000),
    stock('Sắp hết nhiều', 500, 2_000), // 0,25
    stock('Sắp hết ít', 1_800, 2_000), // 0,9
    stock('Hết B', 0, 1_000),
    stock('Hết A', -5, 1_000),
    stock('Hết ngưỡng 0', 0, 0),
  ];

  it('chỉ lấy Sắp hết + Hết hàng; Hết hàng trước, rồi available/reorderLevel tăng dần', () => {
    const names = lowStockTop(items).map((i) => i.ingredientName);
    expect(names).toEqual(['Hết A', 'Hết B', 'Hết ngưỡng 0', 'Sắp hết nhiều', 'Sắp hết ít']);
    expect(names).not.toContain('Ổn');
  });

  it('giới hạn n (mặc định 5) và không đổi mảng gốc', () => {
    const many = Array.from({ length: 9 }, (_, i) => stock(`Hết ${i}`, 0, 100));
    const snapshot = [...many];
    expect(lowStockTop(many)).toHaveLength(5);
    expect(lowStockTop(many, 2)).toHaveLength(2);
    expect(many).toEqual(snapshot);
    expect(lowStockTop([stock('Ổn', 100, 10)])).toEqual([]);
  });
});

describe('định dạng', () => {
  it('formatCompactVnd rút gọn nghìn / triệu', () => {
    expect(formatCompactVnd(0)).toBe('0');
    expect(formatCompactVnd(800)).toBe('800');
    expect(formatCompactVnd(350_000)).toBe('350k');
    expect(formatCompactVnd(1_200_000)).toBe('1,2tr');
    expect(formatCompactVnd(2_000_000)).toBe('2tr');
  });

  it('formatPercent', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.125)).toBe('12,5%');
    expect(formatPercent(1)).toBe('100%');
  });
});
