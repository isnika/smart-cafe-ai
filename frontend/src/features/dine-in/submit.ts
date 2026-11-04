import { isApiError, orderApi } from '@/shared/api';
import type { CreateQrOrderInput } from '@/shared/api/order';
import type { OrderDetail } from '@/shared/types';
import { useAuthStore } from '@/features/auth/store';
import { toOrderLines, type DineInCartLine } from './cart';
import { DINE_IN_BRANCH_ID } from './config';
import { usePlacedOrders } from './placed-orders';
import { flushCartQueue, useDineInCartStore } from './store';

export type SubmitErrorCode = 'EMPTY_CART' | 'NO_SESSION' | 'NO_CART' | 'NOT_SIGNED_IN' | 'MISSING_DELIVERY' | 'NO_FULFILLMENT';

/** Lỗi do FE chặn trước khi gọi API (khác với ApiError từ server). */
export class SubmitOrderError extends Error {
  readonly code: SubmitErrorCode;
  constructor(code: SubmitErrorCode, message: string) {
    super(message);
    this.name = 'SubmitOrderError';
    this.code = code;
  }
}

export const MAX_NOTE_LENGTH = 300;

/** Body POST /orders: chỉ tham chiếu cart_id + ngữ cảnh bàn. KHÔNG có giá/tổng tiền (server snapshot + tính). */
export function buildCreateOrderInput(args: {
  cartId: number;
  tableSessionId: number;
  branchId?: number | null;
  note?: string;
}): CreateQrOrderInput {
  const note = args.note?.trim();
  return {
    cartId: args.cartId,
    branchId: args.branchId ?? DINE_IN_BRANCH_ID,
    tableSessionId: args.tableSessionId,
    ...(note ? { note } : {}),
  };
}

// ── Chống tạo đơn trùng ───────────────────────────────────────────────
// 1) Đang gửi thì mọi lời gọi thêm dùng chung 1 promise (bấm liên tục / double-submit).
// 2) Idempotency-Key sinh MỘT lần cho mỗi "lần gửi" và giữ nguyên khi retry cùng giỏ + ghi chú
//    (server có thể đã tạo đơn nhưng response bị mất) → không sinh đơn thứ hai.
//    Giỏ đổi (id giỏ, dòng, số lượng, ghi chú) → chữ ký đổi → key mới. Thành công → bỏ key.
let attempt: { signature: string; key: string } | null = null;
let inflight: { signature: string; promise: Promise<OrderDetail> } | null = null;

const newKey = () => globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function keyFor(signature: string): string {
  if (!attempt || attempt.signature !== signature) attempt = { signature, key: newKey() };
  return attempt.key;
}

/** Chỉ dành cho test. */
export function resetSubmitState(): void {
  attempt = null;
  inflight = null;
}

const signatureOf = (cartId: number, tableSessionId: number, lines: readonly DineInCartLine[], note: string) =>
  JSON.stringify([cartId, tableSessionId, lines.map((l) => l.key), toOrderLines(lines), note]);

/**
 * Gửi giỏ server-side thành đơn Dine-in (POST /orders {cart_id,…} + Idempotency-Key).
 * Chỉ xoá giỏ local SAU KHI server trả đơn thành công (giỏ server → Converted); lỗi thì giữ nguyên để thử lại.
 */
export async function placeDineInOrder(opts: { note?: string } = {}): Promise<OrderDetail> {
  // Chờ các thao tác giỏ đang bay (thêm/sửa/xoá) xong để gửi đúng bản server đang giữ.
  await flushCartQueue();
  const { tableSessionId, tableCode, sessionCode, branchId, cartId, lines } = useDineInCartStore.getState();
  if (tableSessionId === null || !sessionCode) {
    throw new SubmitOrderError('NO_SESSION', 'Chưa có phiên bàn. Vui lòng quét lại mã QR trên bàn.');
  }
  if (lines.length === 0) throw new SubmitOrderError('EMPTY_CART', 'Giỏ hàng đang trống.');
  if (cartId === null) throw new SubmitOrderError('NO_CART', 'Chưa đồng bộ được giỏ hàng. Vui lòng thử lại.');

  const note = opts.note?.trim() ?? '';
  const signature = signatureOf(cartId, tableSessionId, lines, note);
  if (inflight?.signature === signature) return inflight.promise;

  const idempotencyKey = keyFor(signature);
  const promise = orderApi
    .createQrOrder(buildCreateOrderInput({ cartId, tableSessionId, branchId, note }), {
      sessionCode,
      idempotencyKey,
      accessToken: useAuthStore.getState().accessToken,
    })
    .then((order) => {
      usePlacedOrders.getState().record(order, { sessionCode, tableCode });
      useDineInCartStore.getState().resetLocal();
      attempt = null;
      return order;
    })
    .catch((e: unknown) => {
      // Key đã gắn với payload khác (409 IDEMPOTENCY_CONFLICT) → lần gửi sau phải dùng key mới.
      if (isApiError(e) && e.is('IDEMPOTENCY_CONFLICT')) attempt = null;
      // 409/422: giỏ server có thể đã khác (hết món…) → tải lại để màn giỏ phản ánh đúng.
      if (isApiError(e) && (e.status === 409 || e.status === 422)) void useDineInCartStore.getState().loadCart();
      throw e;
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
  inflight = { signature, promise };
  return promise;
}
