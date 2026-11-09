import { buildLineKey, MAX_LINE_QUANTITY, type NewCartLine } from '@/features/dine-in/cart';
import { canReorder, reorderFulfillment } from '@/features/orders/reorder';
import { isApiError, myOrderApi, orderApi } from '@/shared/api';
import type { OnlineCartCtx, QrCart, QrCartItem, QrCartItemInput } from '@/shared/api/order';
import type { OrderItemDetail } from '@/shared/types';
import { runOnlineCartExclusive } from './cart-sync';
import { ONLINE_BRANCH_ID } from './config';
import { useOnlineCartStore, type OnlineFulfillment } from './store';

/**
 * Đặt lại đơn cũ QUA API giỏ Online (POST /carts, POST /carts/current/items?source=Online, Bearer).
 *
 *  1. GET /orders/me/{id}  → món của đơn cũ (chỉ lấy variantId, quantity, note, options[].optionId/quantity).
 *  2. Mở giỏ Online mới (đúng hình thức nhận hàng của đơn cũ) rồi thêm TỪNG món bằng addCartItem.
 *  3. Món lỗi (hết hàng / ngừng bán / không tồn tại / 422…) được ghi lại riêng, các món còn lại vẫn được thêm.
 *  4. Giá: KHÔNG bao giờ gửi giá cũ. Body chỉ có variant_id, quantity, note, options[{option_id, quantity}];
 *     tên/giá hiển thị trong store lấy từ giỏ do SERVER trả (GET /carts/current), không lấy từ đơn cũ.
 *
 * Store Zustand chỉ là cache giao diện của giỏ server (usePricing đồng bộ store → server và sẽ XOÁ dòng server không có trong
 * store), nên sau khi server xác nhận ≥ 1 món, store được dựng lại từ giỏ server. Không có món nào được copy từ đơn cũ vào store.
 * Giỏ Dine-in (QR) không bị đụng tới: không dùng ctx QR, header guest hay store Dine-in.
 */

export type ReorderFailureReason =
  /** 422 OUT_OF_STOCK (hết hàng). */
  | 'out_of_stock'
  /** Món/biến thể/tuỳ chọn ngừng bán (mã lỗi dạng UNAVAILABLE / INACTIVE / DISCONTINUED). */
  | 'unavailable'
  /** 404: không còn tồn tại. */
  | 'not_found'
  /** 4xx khác (422 không rõ nguyên nhân, 400 option sai, 409…): server từ chối món này. */
  | 'rejected'
  /** Lỗi mạng / 5xx: chưa biết món có hợp lệ không. */
  | 'error';

export interface ReorderLineRef {
  /** Id dòng món trong đơn cũ (nếu nhiều dòng giống nhau được gộp: id dòng đầu tiên). */
  orderItemId: number;
  variantId: number;
  productName: string;
  variantName: string;
  quantity: number;
}

export interface ReorderFailure extends ReorderLineRef {
  reason: ReorderFailureReason;
  /** HTTP status của lỗi (0 = mất kết nối). */
  status: number;
  code: string | null;
  /** Thông điệp do API cung cấp (null nếu API không có). */
  serverMessage: string | null;
}

export interface ReorderSkipped extends ReorderLineRef {
  reason: 'reward_item' | 'invalid_quantity';
}

export type ReorderStatus =
  | 'added_all'
  | 'partial'
  | 'none_added'
  /** Giỏ Online hiện tại đang có món và replaceExisting=false: chưa đụng tới gì. */
  | 'blocked'
  /** Đơn Dine-in / không phải đơn Online: không đặt lại được. */
  | 'not_reorderable'
  /** Đơn không còn dòng nào đặt lại được (vd chỉ có món thưởng). */
  | 'nothing_to_reorder';

export interface ReorderResult {
  status: ReorderStatus;
  orderId: number;
  fulfillmentType: OnlineFulfillment | null;
  added: ReorderLineRef[];
  failed: ReorderFailure[];
  skipped: ReorderSkipped[];
  /** Giỏ Online do server trả sau khi thêm (giá, tổng do server tính). null nếu không có bước giỏ nào chạy. */
  cart: QrCart | null;
  /** Số món đang có trong giỏ cũ khi status='blocked'. */
  existingCartItemCount: number;
  /** Chỉ true khi giỏ có ≥ 1 món thêm thành công. */
  canProceedToCheckout: boolean;
}

export interface ReorderOptions {
  /**
   * true (mặc định): giỏ Online đang hoạt động bị bỏ (Abandoned) và mở giỏ mới → "giỏ mới".
   * false: nếu giỏ đang có món thì dừng với status='blocked' và KHÔNG thay đổi gì (để UI hỏi khách rồi gọi lại với true).
   */
  replaceExisting?: boolean;
  signal?: AbortSignal;
}

// ── Lập kế hoạch từ đơn cũ ─────────────────────────────────────────────
interface PlannedLine {
  key: string;
  input: QrCartItemInput;
  ref: ReorderLineRef;
  /** Chỉ để HIỂN THỊ khi server không trả tên; không bao giờ gửi đi, không dùng để lấy giá. */
  source: OrderItemDetail;
}

const refOf = (i: OrderItemDetail, quantity: number): ReorderLineRef => ({
  orderItemId: i.id,
  variantId: i.variantId,
  productName: i.productName,
  variantName: i.variantName,
  quantity,
});

function planLines(items: readonly OrderItemDetail[]): { lines: PlannedLine[]; skipped: ReorderSkipped[] } {
  const lines = new Map<string, PlannedLine>();
  const skipped: ReorderSkipped[] = [];
  for (const i of items) {
    if (i.isRewardItem) {
      skipped.push({ ...refOf(i, i.quantity), reason: 'reward_item' }); // món thưởng loyalty không đặt lại được
      continue;
    }
    if (!Number.isInteger(i.quantity) || i.quantity < 1) {
      skipped.push({ ...refOf(i, i.quantity), reason: 'invalid_quantity' });
      continue;
    }
    const options = i.options.map((o) => ({ optionId: o.optionId, quantity: Math.max(1, o.quantity) }));
    const note = i.note?.trim() ? i.note.trim() : null;
    const key = buildLineKey({ variantId: i.variantId, note: note ?? undefined, options: options.map((o) => ({ ...o, optionName: '', extraPrice: 0 })) });
    const dup = lines.get(key);
    if (dup) {
      // Cùng variant + option + ghi chú → một dòng giỏ (giống buildLineKey của giỏ); cộng số lượng.
      const quantity = Math.min(MAX_LINE_QUANTITY, dup.input.quantity + i.quantity);
      dup.input = { ...dup.input, quantity };
      dup.ref = { ...dup.ref, quantity };
      continue;
    }
    // Body chỉ gồm định danh + số lượng. KHÔNG có unitPrice/lineTotal/optionsUnitTotal/productName.
    lines.set(key, {
      key,
      source: i,
      ref: refOf(i, Math.min(MAX_LINE_QUANTITY, i.quantity)),
      input: { variantId: i.variantId, quantity: Math.min(MAX_LINE_QUANTITY, i.quantity), note, options },
    });
  }
  return { lines: [...lines.values()], skipped };
}

// ── Phân loại lỗi từng món ─────────────────────────────────────────────
const UNAVAILABLE_CODE = /UNAVAILABLE|INACTIVE|DISCONTINUED|NOT_AVAILABLE|NOT_SELLABLE/i;

export function classifyAddError(e: unknown): Pick<ReorderFailure, 'reason' | 'status' | 'code' | 'serverMessage'> {
  if (!isApiError(e)) return { reason: 'error', status: 0, code: null, serverMessage: null };
  const code = e.code ?? null;
  const serverMessage = e.message.trim() ? e.message : null;
  const base = { status: e.status, code, serverMessage };
  if (code === 'OUT_OF_STOCK') return { reason: 'out_of_stock', ...base };
  if (code !== null && UNAVAILABLE_CODE.test(code)) return { reason: 'unavailable', ...base };
  if (e.status === 404) return { reason: 'not_found', ...base };
  if (e.status >= 400 && e.status < 500) return { reason: 'rejected', ...base };
  return { reason: 'error', ...base };
}

/** 401/403 không phải lỗi của một món: dừng hẳn (401 đã qua refresh của http.ts). */
const isFatal = (e: unknown): boolean => !isApiError(e) || e.status === 401 || e.status === 403;

// ── Giỏ ────────────────────────────────────────────────────────────────
async function currentCartOrNull(ctx: OnlineCartCtx, signal?: AbortSignal): Promise<QrCart | null> {
  try {
    return await orderApi.getCurrentCart(ctx, signal);
  } catch (e) {
    if (isApiError(e) && e.status === 404) return null;
    throw e;
  }
}

/** Dòng store từ MỘT dòng của giỏ server. Giá/tên lấy từ server; đơn cũ chỉ bù TÊN khi server không trả. */
function storeLineOf(item: QrCartItem, plan: PlannedLine | undefined): NewCartLine {
  const optionName = (optionId: number): string => plan?.source.options.find((o) => o.optionId === optionId)?.optionName ?? '';
  return {
    productId: item.productId ?? plan?.source.productId ?? 0,
    productName: item.productName ?? plan?.source.productName ?? '',
    variantId: item.variantId,
    variantName: item.variantName ?? plan?.source.variantName ?? '',
    unitPrice: item.unitPrice ?? 0, // giá server; thiếu thì 0 và chờ pricing◇ (serverLineTotal) — không lấy giá đơn cũ
    options: item.options.map((o) => ({
      optionId: o.optionId,
      optionName: o.optionName ?? optionName(o.optionId),
      extraPrice: o.unitPrice ?? 0,
      quantity: o.quantity,
    })),
    ...(item.note ? { note: item.note } : {}),
    ...(item.productImage ? { image: item.productImage } : {}),
    serverLineTotal: item.lineTotal ?? null,
  };
}

/** Làm store khớp ĐÚNG giỏ server (nguồn sự thật) để lần đồng bộ kế tiếp của usePricing không xoá món vừa thêm. */
function mirrorServerCart(cart: QrCart, fulfillmentType: OnlineFulfillment, plans: ReadonlyMap<string, PlannedLine>): void {
  const store = useOnlineCartStore.getState();
  store.clearOrder();
  store.setFulfillment(fulfillmentType);
  for (const item of cart.items) {
    const key = buildLineKey({
      variantId: item.variantId,
      note: item.note ?? undefined,
      options: item.options.map((o) => ({ optionId: o.optionId, quantity: o.quantity, optionName: '', extraPrice: 0 })),
    });
    store.addLine(storeLineOf(item, plans.get(key)), item.quantity);
  }
}

const result = (r: Partial<ReorderResult> & Pick<ReorderResult, 'status' | 'orderId'>): ReorderResult => ({
  fulfillmentType: null,
  added: [],
  failed: [],
  skipped: [],
  cart: null,
  existingCartItemCount: 0,
  canProceedToCheckout: false,
  ...r,
});

/**
 * Đặt lại đơn `orderId` (đơn của chính khách). Ném ApiError khi không đọc được đơn (404 đơn không thuộc khách, 401…) hoặc
 * lỗi hệ thống của giỏ (401/403, mở giỏ thất bại); lỗi của TỪNG món không ném mà nằm trong `failed`.
 */
export async function reorderOnlineOrder(orderId: number, options: ReorderOptions = {}): Promise<ReorderResult> {
  const { replaceExisting = true, signal } = options;
  const order = await myOrderApi.getMyOrder(orderId, signal);
  if (!canReorder(order)) return result({ status: 'not_reorderable', orderId });

  const fulfillmentType = reorderFulfillment(order);
  const { lines, skipped } = planLines(order.items);
  if (lines.length === 0) return result({ status: 'nothing_to_reorder', orderId, fulfillmentType, skipped });

  // Cùng hàng đợi với syncOnlineCart: không chạy chồng với lần đồng bộ giỏ đang diễn ra.
  return runOnlineCartExclusive(async () => {
    const ctx: OnlineCartCtx = { source: 'Online', fulfillmentType };

    const existing = await currentCartOrNull(ctx, signal);
    const existingCount = existing?.items.length ?? 0;
    if (existing && existingCount > 0 && !replaceExisting) {
      return result({ status: 'blocked', orderId, fulfillmentType, skipped, existingCartItemCount: existingCount });
    }
    // Giỏ Online chỉ có MỘT giỏ Active/user → giỏ cũ có món hoặc sai ngữ cảnh thì bỏ, mở giỏ mới (như cart-sync).
    if (existing && (existingCount > 0 || existing.fulfillmentType !== fulfillmentType || existing.branchId !== ONLINE_BRANCH_ID)) {
      await orderApi.clearCart(ctx);
    }
    await orderApi.ensureCart(ctx, ONLINE_BRANCH_ID);

    const added: ReorderLineRef[] = [];
    const failed: ReorderFailure[] = [];
    for (const line of lines) {
      try {
        await orderApi.addCartItem(ctx, line.input);
        added.push(line.ref);
      } catch (e) {
        if (isFatal(e)) throw e;
        failed.push({ ...line.ref, ...classifyAddError(e) });
      }
    }

    // Lấy lại giỏ từ server: giá/tổng do server tính, và phát hiện giỏ biến mất giữa chừng (404 → ném, không báo "tất cả lỗi" sai).
    const cart = await orderApi.getCurrentCart(ctx, signal);
    if (added.length > 0) {
      mirrorServerCart(cart, fulfillmentType, new Map(lines.map((l) => [l.key, l])));
    }
    return result({
      status: added.length === 0 ? 'none_added' : failed.length === 0 ? 'added_all' : 'partial',
      orderId,
      fulfillmentType,
      added,
      failed,
      skipped,
      cart,
      canProceedToCheckout: added.length > 0,
    });
  });
}

// ── Thông báo cho người dùng ───────────────────────────────────────────
const REASON_TEXT: Record<ReorderFailureReason, string> = {
  out_of_stock: 'Đã hết hàng',
  unavailable: 'Hiện ngừng bán',
  not_found: 'Món không còn tồn tại',
  rejected: 'Không thể thêm vào giỏ',
  error: 'Lỗi kết nối, chưa thêm được',
};

export const lineLabel = (l: Pick<ReorderLineRef, 'productName' | 'variantName'>): string =>
  `${l.productName}${l.variantName && l.variantName !== 'Standard' ? ` (${l.variantName})` : ''}`;

/** Dòng "Tên món: nguyên nhân" — ưu tiên thông điệp API cung cấp, không có thì dùng nhãn theo loại lỗi. */
export const describeFailure = (f: ReorderFailure): string => `${lineLabel(f)}: ${f.serverMessage ?? REASON_TEXT[f.reason]}`;

export interface ReorderNotice {
  tone: 'success' | 'warning' | 'error';
  title: string;
  details: string[];
}

export function summarizeReorder(r: ReorderResult): ReorderNotice {
  const details = r.failed.map(describeFailure);
  switch (r.status) {
    case 'added_all':
      return { tone: 'success', title: 'Đã thêm các món vào giỏ hàng.', details: [] };
    case 'partial':
      return { tone: 'warning', title: `Đã thêm ${r.added.length} món vào giỏ. ${r.failed.length} món không thêm được:`, details };
    case 'none_added':
      return { tone: 'error', title: 'Không thể đặt lại: không có món nào thêm được vào giỏ.', details };
    case 'blocked':
      return { tone: 'warning', title: `Giỏ hàng hiện có ${r.existingCartItemCount} món. Đặt lại sẽ thay thế giỏ hiện tại.`, details: [] };
    case 'not_reorderable':
      return { tone: 'error', title: 'Đơn này không thể đặt lại.', details: [] };
    case 'nothing_to_reorder':
      return { tone: 'error', title: 'Đơn này không có món nào có thể đặt lại.', details: [] };
  }
}
