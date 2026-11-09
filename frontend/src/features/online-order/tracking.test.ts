import { describe, expect, it } from 'vitest';
import type { OrderStatus } from '@/shared/types';
import { PAYMENT_STATUS_LABEL, formatVnDateTime, isFailedStatus, orderKindLabel, trackingStatusLabel } from './tracking';

describe('trackingStatusLabel — đủ 10 trạng thái', () => {
  const cases: [OrderStatus, 'Delivery' | 'Pickup' | 'Dine_In', string][] = [
    ['Pending_Payment', 'Delivery', 'Chờ thanh toán'],
    ['Pending', 'Pickup', 'Đã nhận đơn'],
    ['Confirmed', 'Pickup', 'Quán đã xác nhận'],
    ['Preparing', 'Delivery', 'Đang pha chế'],
    ['Ready', 'Delivery', 'Sẵn sàng giao'],
    ['Ready', 'Pickup', 'Sẵn sàng nhận món'],
    ['Ready', 'Dine_In', 'Món đã xong'],
    ['Shipping', 'Delivery', 'Đang giao hàng'],
    ['Served', 'Dine_In', 'Đã phục vụ'],
    ['Completed', 'Delivery', 'Hoàn tất'],
    ['Cancelled', 'Pickup', 'Đã huỷ'],
    ['Rejected', 'Delivery', 'Quán đã từ chối'],
  ];
  it.each(cases)('%s (%s) → %s', (status, fulfillment, label) => {
    expect(trackingStatusLabel(status, fulfillment)).toBe(label);
  });

  it('Served và Completed phân biệt được', () => {
    expect(trackingStatusLabel('Served', 'Dine_In')).not.toBe(trackingStatusLabel('Completed', 'Dine_In'));
  });
});

describe('formatVnDateTime — giờ Việt Nam qua parseUtc', () => {
  it('ISO có Z → +7', () => expect(formatVnDateTime('2026-11-07T03:30:00Z')).toContain('10:30'));
  it('naive (DB, không timezone) → coi là UTC → +7', () => expect(formatVnDateTime('2026-11-07 03:30:00')).toContain('10:30'));
  it('offset +07:00 giữ đúng thời điểm', () => expect(formatVnDateTime('2026-11-07T10:30:00+07:00')).toContain('10:30'));
  it('qua nửa đêm UTC → sang ngày VN kế tiếp', () => expect(formatVnDateTime('2026-11-07T20:00:00Z')).toMatch(/03:00.*08\/11\/2026|08\/11\/2026.*03:00/));
  it('rỗng/không hợp lệ → —', () => {
    expect(formatVnDateTime(null)).toBe('—');
    expect(formatVnDateTime('không phải ngày')).toBe('—');
  });
});

describe('phân loại', () => {
  it('Online vs Dine-in', () => {
    expect(orderKindLabel({ orderSource: 'Online', fulfillmentType: 'Delivery' })).toBe('Online · Giao hàng');
    expect(orderKindLabel({ orderSource: 'Online', fulfillmentType: 'Pickup' })).toBe('Online · Mang đi');
    expect(orderKindLabel({ orderSource: 'QR', fulfillmentType: 'Dine_In', tableNumber: 'A5' })).toBe('Tại quán · Bàn A5');
    expect(orderKindLabel({ orderSource: 'POS', fulfillmentType: 'Dine_In' })).toBe('Tại quán');
  });
  it('isFailedStatus chỉ Cancelled/Rejected', () => {
    expect((['Cancelled', 'Rejected'] as const).every(isFailedStatus)).toBe(true);
    expect(isFailedStatus('Completed')).toBe(false);
  });
  it('mọi payment_status đều có nhãn', () => {
    expect(Object.keys(PAYMENT_STATUS_LABEL).sort()).toEqual(['Paid', 'Partially_Refunded', 'Refunded', 'Unpaid']);
  });
});
