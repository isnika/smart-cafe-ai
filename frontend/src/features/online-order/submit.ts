import { useAuthStore } from '@/features/auth/store';
import { toOrderLines, type DineInCartLine } from '@/features/dine-in/cart';
import { usePlacedOrders } from '@/features/dine-in/placed-orders';
import { SubmitOrderError } from '@/features/dine-in/submit';
import { isApiError, orderApi, storeApi } from '@/shared/api';
import type { CreateOnlineOrderInput } from '@/shared/api/order';
import type { OrderDetail } from '@/shared/types';
import { onlineBranchBlock } from './branch-policy';
import { syncOnlineCart } from './cart-sync';
import { isMockMode, isVoucherEnabled, ONLINE_BRANCH_ID } from './config';
import { toPaymentMethod, type PaymentChoice } from './payment';
import { useOnlineCartStore, type DeliveryDetails, type OnlineFulfillment } from './store';

/**
 * Body POST /orders của đơn Online (spec "4. Order / Đặt hàng"):
 * {cart_id, order_source:'Online', fulfillment_type, branch_id, delivery_*, note}.
 * KHÔNG có user_id (server lấy từ JWT), voucher_code (Engagement ngoài phạm vi; chỉ mock), giá/tổng tiền (server tính),
 * address_id (địa chỉ gửi dạng một chuỗi + lat/lng).
 */
export function buildOnlineOrderInput(args: {
  cartId: number;
  fulfillmentType: OnlineFulfillment;
  delivery?: DeliveryDetails;
  note?: string;
  voucherCode?: string;
}): CreateOnlineOrderInput {
  const note = args.note?.trim();
  const common = {
    cartId: args.cartId,
    branchId: ONLINE_BRANCH_ID,
    ...(note ? { note } : {}),
    ...(args.voucherCode && isVoucherEnabled() ? { voucherCode: args.voucherCode } : {}),
  };
  if (args.fulfillmentType === 'Pickup') return { ...common, fulfillmentType: 'Pickup' };
  if (!args.delivery) throw new SubmitOrderError('MISSING_DELIVERY', 'Vui lòng nhập thông tin giao hàng.');
  const d = args.delivery;
  return {
    ...common,
    fulfillmentType: 'Delivery',
    deliveryName: d.receiverName,
    deliveryPhone: d.phone,
    deliveryAddress: d.addressLine,
    ...(typeof d.latitude === 'number' && typeof d.longitude === 'number'
      ? { deliveryLatitude: d.latitude, deliveryLongitude: d.longitude }
      : {}),
  };
}

// ── Chống tạo đơn trùng ───────────────────────────────────────────────
// 1) Đang gửi thì mọi lời gọi thêm dùng chung 1 promise.
// 2) Idempotency-Key sinh MỘT lần cho một thao tác đặt đơn và giữ nguyên khi retry cùng nội dung
//    (server có thể đã tạo đơn nhưng response bị mất). Retry dùng LẠI cart_id đã gửi — không đồng bộ lại giỏ,
//    vì giỏ đã Converted sẽ bị mở giỏ mới và payload khác key cũ.
// 3) Đặt thành công → bỏ key; lần đặt mới (kể cả cùng nội dung) sinh key mới. Nội dung đổi → key mới.
let attempt: { signature: string; key: string; cartId: number | null } | null = null;
let inflight: { signature: string; promise: Promise<OrderDetail> } | null = null;

const newKey = () => globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function attemptFor(signature: string): NonNullable<typeof attempt> {
  if (!attempt || attempt.signature !== signature) attempt = { signature, key: newKey(), cartId: null };
  return attempt;
}

/** Chỉ dành cho test. */
export function resetOnlineSubmitState(): void {
  attempt = null;
  inflight = null;
}

/**
 * Tạo đơn Online từ giỏ hiện tại: kiểm tra chi nhánh → đồng bộ giỏ server → POST /orders.
 * Chỉ xoá giỏ cục bộ SAU KHI server trả đơn thành công; lỗi thì giữ nguyên để thử lại.
 * KHÔNG gọi POST /payments (COD: Pending/Unpaid; VNPay/Momo: để Workload 2 xử lý) — chọn phương thức chỉ dùng để
 * nhận diện luồng và (mock) gợi ý Pending_Payment.
 */
export function placeOnlineOrder(opts: { note?: string; voucherCode?: string; method?: PaymentChoice } = {}): Promise<OrderDetail> {
  const { fulfillmentType, lines, delivery } = useOnlineCartStore.getState();
  if (fulfillmentType === null) {
    return Promise.reject(new SubmitOrderError('NO_FULFILLMENT', 'Vui lòng chọn Giao hàng hoặc Mang đi.'));
  }
  if (lines.length === 0) return Promise.reject(new SubmitOrderError('EMPTY_CART', 'Giỏ hàng đang trống.'));

  const { user, roleName } = useAuthStore.getState();
  if (!user || roleName !== 'Customer') {
    return Promise.reject(new SubmitOrderError('NOT_SIGNED_IN', 'Vui lòng đăng nhập bằng tài khoản khách hàng để đặt hàng.'));
  }
  if (fulfillmentType === 'Delivery' && !delivery) {
    return Promise.reject(new SubmitOrderError('MISSING_DELIVERY', 'Vui lòng nhập thông tin giao hàng.'));
  }

  const voucherCode = isVoucherEnabled() ? opts.voucherCode : undefined;
  const signature = JSON.stringify([
    user.id, fulfillmentType, toOrderLines(lines), fulfillmentType === 'Delivery' ? delivery : null,
    opts.note?.trim() ?? '', voucherCode ?? '', opts.method ?? '',
  ]);
  if (inflight?.signature === signature) return inflight.promise;

  const run = async (): Promise<OrderDetail> => {
    const branch = await storeApi.getBranch(ONLINE_BRANCH_ID);
    const destination =
      delivery && typeof delivery.latitude === 'number' && typeof delivery.longitude === 'number'
        ? { latitude: delivery.latitude, longitude: delivery.longitude }
        : null;
    const block = onlineBranchBlock(branch, { fulfillmentType, destination });
    if (block) throw new SubmitOrderError('BRANCH_UNAVAILABLE', block);

    const current = attemptFor(signature);
    if (current.cartId === null) {
      const cart = await syncOnlineCart({ fulfillmentType, branchId: ONLINE_BRANCH_ID, lines: snapshot(lines) });
      current.cartId = cart.id;
    }

    const input = buildOnlineOrderInput({
      cartId: current.cartId,
      fulfillmentType,
      ...(delivery ? { delivery } : {}),
      ...(opts.note ? { note: opts.note } : {}),
      ...(voucherCode ? { voucherCode } : {}),
    });
    const order = await orderApi.createOnlineOrder(input, {
      idempotencyKey: current.key,
      ...(isMockMode() && opts.method ? { mockPaymentMethod: toPaymentMethod(opts.method) } : {}),
    });
    usePlacedOrders.getState().record(order);
    useOnlineCartStore.getState().clearOrder();
    attempt = null;
    return order;
  };

  const promise = run()
    .catch((e: unknown) => {
      // Key đã gắn với payload khác (409 IDEMPOTENCY_CONFLICT) → lần gửi sau phải dùng key mới + đồng bộ lại giỏ.
      if (isApiError(e) && e.is('IDEMPOTENCY_CONFLICT')) attempt = null;
      throw e;
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
  inflight = { signature, promise };
  return promise;
}

const snapshot = (lines: readonly DineInCartLine[]): DineInCartLine[] => lines.map((l) => ({ ...l }));
