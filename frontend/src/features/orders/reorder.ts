import type { NewCartLine } from '@/features/dine-in/cart';
import type { OnlineFulfillment } from '@/features/online-order/store';
import type { OrderDetail } from '@/shared/types';

/** Đơn Online (Giao hàng / Mang đi) mới đặt lại được; đơn tại bàn gắn với phiên bàn nên không. */
export const canReorder = (order: Pick<OrderDetail, 'orderSource' | 'fulfillmentType'>): boolean =>
  order.orderSource === 'Online' && order.fulfillmentType !== 'Dine_In';

export const reorderFulfillment = (order: Pick<OrderDetail, 'fulfillmentType'>): OnlineFulfillment =>
  order.fulfillmentType === 'Delivery' ? 'Delivery' : 'Pickup';

/**
 * Dòng giỏ từ snapshot của đơn cũ. Giá chỉ để hiển thị: server tính lại từ variantId + optionId khi tạo đơn,
 * nên món đã hết hàng / đổi giá sẽ được server báo lỗi ở bước đặt, không có dữ liệu giả nào được tạo ra.
 */
export function orderToCartLines(order: Pick<OrderDetail, 'items'>): Array<{ line: NewCartLine; quantity: number }> {
  return order.items
    .filter((i) => !i.isRewardItem) // món thưởng loyalty không đặt lại được
    .map((i) => ({
      quantity: i.quantity,
      line: {
        productId: i.productId,
        productName: i.productName,
        variantId: i.variantId,
        variantName: i.variantName,
        unitPrice: i.unitPrice,
        options: i.options.map((o) => ({ optionId: o.optionId, optionName: o.optionName, extraPrice: o.unitPrice, quantity: o.quantity })),
        ...(i.note ? { note: i.note } : {}),
      },
    }));
}
