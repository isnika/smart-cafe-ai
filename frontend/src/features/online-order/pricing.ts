import type { OnlineFulfillment } from './store';

export interface OrderTotals {
  subTotal: number;
  /** Đã kẹp về [0, subTotal]. */
  discount: number;
  deliveryFee: number;
  total: number;
}

/**
 * Cùng công thức với Order.finalAmount: subTotal - voucherDiscount + deliveryFee.
 * Giỏ hàng và checkout đều gọi hàm này nên tổng tiền không thể lệch nhau.
 */
export function calcTotals(args: { subTotal: number; discount: number; deliveryFee: number }): OrderTotals {
  const discount = Math.min(Math.max(0, args.discount), args.subTotal);
  const deliveryFee = Math.max(0, args.deliveryFee);
  return { subTotal: args.subTotal, discount, deliveryFee, total: args.subTotal - discount + deliveryFee };
}

export const FULFILLMENT_BADGE: Record<OnlineFulfillment, string> = {
  Delivery: 'Giao hàng',
  Pickup: 'Mang đi',
};
