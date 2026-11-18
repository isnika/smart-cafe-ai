import { buildLineKey, type DineInCartLine } from '@/features/dine-in/cart';
import { ApiError, isApiError, orderApi } from '@/shared/api';
import type { OnlineCartCtx, QrCart, QrCartItem } from '@/shared/api/order';
import type { OnlineFulfillment } from './store';
import { useAuthStore } from '@/features/auth/store';

/**
 * Đồng bộ giỏ Online (UI cache cục bộ) → giỏ server-side của user (POST/GET /carts, …/items?source=Online, Bearer).
 * Dùng LẠI module giỏ của lát 2 (orderApi.ensureCart/getCurrentCart/addCartItem/updateCartItem/removeCartItem
 * với ctx source=Online) — không có client giỏ thứ hai. Server là nguồn sự thật của pricing◇.
 */
const sigOfLine = (l: DineInCartLine) => buildLineKey(l);
const sigOfItem = (it: QrCartItem) =>
  buildLineKey({
    variantId: it.variantId,
    note: it.note ?? undefined,
    options: it.options.map((o) => ({ optionId: o.optionId, quantity: o.quantity, optionName: '', extraPrice: 0 })),
  });

export interface SyncArgs {
  fulfillmentType: OnlineFulfillment;
  branchId: number;
  lines: readonly DineInCartLine[];
  /** Expected owner of the UI snapshot, never sent as a server-side user_id. */
  userId?: string;
}

// Tuần tự hoá: các lần đồng bộ không bao giờ chạy chồng nhau (tránh thêm trùng dòng khi UI đổi liên tục).
let queue: Promise<unknown> = Promise.resolve();
let revision = 0;
const accountChanged = () => new ApiError(409, { code: 'ACCOUNT_CHANGED', message: 'Tài khoản đã thay đổi. Vui lòng mở lại giỏ hàng.' });
const enqueue = <T,>(task: (assertAccount: () => void) => Promise<T>): Promise<T> => {
  const accountId = useAuthStore.getState().user?.id;
  const taskRevision = revision;
  const assertAccount = () => {
    if (taskRevision !== revision || useAuthStore.getState().user?.id !== accountId) throw accountChanged();
  };
  const execute = async () => {
    assertAccount();
    const result = await task(assertAccount);
    assertAccount();
    return result;
  };
  const run = queue.then(execute, execute);
  queue = run.catch(() => undefined);
  return run;
};

/** Chạy một thao tác giỏ Online trong cùng hàng đợi với syncOnlineCart (dùng cho đặt lại đơn) → không chạy chồng nhau. */
export const runOnlineCartExclusive = <T,>(task: (assertAccount: () => void) => Promise<T>): Promise<T> => enqueue(task);

/** Invalidate pending work on account changes; also used to reset tests. */
export function resetOnlineCartSync(): void {
  revision++;
  queue = Promise.resolve();
}

async function sync({ fulfillmentType, branchId, lines, userId }: SyncArgs, assertAccount: () => void): Promise<QrCart> {
  if (!useAuthStore.getState().user?.id || (userId !== undefined && useAuthStore.getState().user?.id !== userId)) throw accountChanged();
  const ctx: OnlineCartCtx = { source: 'Online', fulfillmentType };
  let cart: QrCart | undefined;
  try { cart = await orderApi.getCurrentCart(ctx); }
  catch (e) { if (!isApiError(e) || e.status !== 404) throw e; }
  assertAccount();
  // Online chỉ có MỘT giỏ Active/user: đổi Giao hàng ↔ Mang đi hoặc đổi chi nhánh → bỏ giỏ cũ, mở giỏ mới đúng ngữ cảnh.
  if (cart && (cart.fulfillmentType !== fulfillmentType || cart.branchId !== branchId)) {
    await orderApi.clearCart(ctx);
    assertAccount();
    cart = undefined;
  }
  if (!cart) {
    cart = await orderApi.ensureCart(ctx, branchId);
    assertAccount();
  }

  const wanted = new Map<string, DineInCartLine>();
  for (const l of lines) wanted.set(sigOfLine(l), l);

  let changed = false;
  const seen = new Set<string>();
  for (const it of cart.items) {
    assertAccount();
    const sig = sigOfItem(it);
    const line = wanted.get(sig);
    if (!line || seen.has(sig)) {
      await orderApi.removeCartItem(ctx, it.id);
      assertAccount();
      changed = true;
      continue;
    }
    seen.add(sig);
    if (it.quantity !== line.quantity) {
      await orderApi.updateCartItem(ctx, it.id, {
        variantId: line.variantId,
        quantity: line.quantity,
        note: line.note ?? null,
        options: line.options.map((o) => ({ optionId: o.optionId, quantity: o.quantity })),
      });
      assertAccount();
      changed = true;
    }
  }
  for (const [sig, line] of wanted) {
    assertAccount();
    if (seen.has(sig)) continue;
    await orderApi.addCartItem(ctx, {
      variantId: line.variantId,
      quantity: line.quantity,
      note: line.note ?? null,
      options: line.options.map((o) => ({ optionId: o.optionId, quantity: o.quantity })),
    });
    assertAccount();
    changed = true;
  }
  // Xoá dòng trả 204 không body → lấy lại giỏ để có pricing◇ mới nhất.
  assertAccount();
  return changed ? orderApi.getCurrentCart(ctx) : cart;
}

/** Làm cho giỏ server khớp `lines` rồi trả giỏ (id + pricing◇ do server tính). */
export const syncOnlineCart = (args: SyncArgs): Promise<QrCart> => enqueue((assertAccount) => sync(args, assertAccount));
