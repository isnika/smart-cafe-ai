import { useAuthStore } from '@/features/auth/store';
import { toOrderLines, type DineInCartLine } from '@/features/dine-in/cart';
import { usePlacedOrders } from '@/features/dine-in/placed-orders';
import { SubmitOrderError } from '@/features/dine-in/submit';
import { orderApi } from '@/shared/api';
import type { CreateOnlineDeliveryOrderInput, CreateOnlinePickupOrderInput, OrderDetail } from '@/shared/types';
import { ONLINE_BRANCH_ID } from './config';
import { useOnlineCartStore, type DeliveryDetails, type OnlineFulfillment } from './store';

export type OnlineOrderInput = CreateOnlineDeliveryOrderInput | CreateOnlinePickupOrderInput;

/**
 * Đơn Online dùng ĐÚNG hợp đồng tạo đơn đang có (cùng POST /orders-svc/orders và cùng db với hàng đợi nhân viên).
 * Không gửi `payAt`: server coi như "counter" → đơn vào trạng thái Pending và xuất hiện trong hàng đợi.
 * (payAt = 'online' sẽ để đơn ở Pending_Payment chờ cổng thanh toán – chưa có ở giai đoạn này.)
 * Phương thức thanh toán khách chọn KHÔNG nằm trong input: chưa có trường tương ứng trong hợp đồng đơn hàng.
 */
export function buildOnlineOrderInput(args: {
  fulfillmentType: OnlineFulfillment;
  lines: readonly DineInCartLine[];
  userId: string;
  delivery?: DeliveryDetails;
  note?: string;
  voucherCode?: string;
  idempotencyKey: string;
}): OnlineOrderInput {
  const note = args.note?.trim();
  const common = {
    orderSource: 'Online' as const,
    branchId: ONLINE_BRANCH_ID,
    userId: args.userId,
    lines: toOrderLines(args.lines),
    idempotencyKey: args.idempotencyKey,
    ...(note ? { note } : {}),
    ...(args.voucherCode ? { voucherCode: args.voucherCode } : {}),
  };
  if (args.fulfillmentType === 'Pickup') return { ...common, fulfillmentType: 'Pickup' };
  if (!args.delivery) throw new SubmitOrderError('MISSING_DELIVERY', 'Vui lòng nhập thông tin giao hàng.');
  return {
    ...common,
    fulfillmentType: 'Delivery',
    deliveryName: args.delivery.receiverName,
    deliveryPhone: args.delivery.phone,
    deliveryAddress: args.delivery.addressLine,
  };
}

// ── Chống tạo đơn trùng (cùng cơ chế với Dine-in) ─────────────────────
// 1) Đang gửi thì mọi lời gọi thêm dùng chung 1 promise.
// 2) Cùng nội dung → cùng idempotencyKey nên gửi lại sau lỗi mạng không sinh đơn thứ hai.
let attempt: { signature: string; key: string } | null = null;
let inflight: { signature: string; promise: Promise<OrderDetail> } | null = null;

const newKey = () => globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function keyFor(signature: string): string {
  if (!attempt || attempt.signature !== signature) attempt = { signature, key: newKey() };
  return attempt.key;
}

/** Chỉ dành cho test. */
export function resetOnlineSubmitState(): void {
  attempt = null;
  inflight = null;
}

/**
 * Tạo đơn Online từ giỏ hiện tại. Chỉ xoá giỏ SAU KHI server trả đơn thành công;
 * lỗi thì giỏ giữ nguyên để khách thử lại. KHÔNG xử lý thanh toán – việc đó nằm ở payment.ts.
 */
export function placeOnlineOrder(opts: { note?: string; voucherCode?: string } = {}): Promise<OrderDetail> {
  const { fulfillmentType, lines, delivery } = useOnlineCartStore.getState();
  if (fulfillmentType === null) {
    return Promise.reject(new SubmitOrderError('NO_FULFILLMENT', 'Vui lòng chọn Giao hàng hoặc Mang đi.'));
  }
  if (lines.length === 0) return Promise.reject(new SubmitOrderError('EMPTY_CART', 'Giỏ hàng đang trống.'));

  const { user, roleName } = useAuthStore.getState();
  if (!user || roleName !== 'Customer') {
    return Promise.reject(new SubmitOrderError('NOT_SIGNED_IN', 'Vui lòng đăng nhập bằng tài khoản khách hàng để đặt hàng.'));
  }

  const signature = JSON.stringify([user.id, fulfillmentType, toOrderLines(lines), delivery, opts.note?.trim() ?? '', opts.voucherCode ?? '']);
  if (inflight?.signature === signature) return inflight.promise;

  let input: OnlineOrderInput;
  try {
    input = buildOnlineOrderInput({
      fulfillmentType,
      lines,
      userId: user.id,
      ...(delivery ? { delivery } : {}),
      ...(opts.note ? { note: opts.note } : {}),
      ...(opts.voucherCode ? { voucherCode: opts.voucherCode } : {}),
      idempotencyKey: keyFor(signature),
    });
  } catch (e) {
    return Promise.reject(e);
  }

  const promise = orderApi
    .createOrder(input)
    .then((order) => {
      usePlacedOrders.getState().record(order);
      useOnlineCartStore.getState().clearOrder();
      attempt = null;
      return order;
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
  inflight = { signature, promise };
  return promise;
}
