import type { FulfillmentType, OrderStatus } from '@/shared/types';

/** Nhãn dành cho KHÁCH (khác nhãn nhân viên ở order-queue/status.ts). */
export function customerStatusLabel(status: OrderStatus, fulfillment: FulfillmentType): string {
  switch (status) {
    case 'Pending_Payment':
      return 'Chờ thanh toán';
    case 'Pending':
      return 'Đã nhận đơn';
    case 'Confirmed':
      return 'Quán đã xác nhận';
    case 'Preparing':
      return 'Đang pha chế';
    case 'Ready':
      return fulfillment === 'Delivery' ? 'Sẵn sàng giao' : 'Sẵn sàng nhận món';
    case 'Shipping':
      return 'Đang giao hàng';
    case 'Served':
    case 'Completed':
      return 'Hoàn tất';
    case 'Cancelled':
      return 'Đã huỷ';
    case 'Rejected':
      return 'Quán đã từ chối';
  }
}
