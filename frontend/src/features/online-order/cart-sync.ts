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
  const owner = useAuthStore.getState().user?.id;
  const checkOwner = () => { if (!owner || useAuthStore.getState().user?.id !== owner) throw new Error('Phiên đăng nhập đã thay đổi.'); };
  const ctx: OnlineCartCtx = { source: 'Online', fulfillmentType };
  checkOwner();
  let cart: QrCart | undefined;
  try { cart = await orderApi.getCurrentCart(ctx); }
  catch (e) { if (!isApiError(e) || e.status !== 404) throw e; }
  checkOwner();
  // Online chỉ có MỘT giỏ Active/user: đổi Giao hàng ↔ Mang đi hoặc đổi chi nhánh → bỏ giỏ cũ, mở giỏ mới đúng ngữ cảnh.
  if (cart && (cart.fulfillmentType !== fulfillmentType || cart.branchId !== branchId)) {
    await orderApi.clearCart(ctx);
    assertAccount();
    cart = undefined;
  }
  if (!cart) {
    checkOwner();
    cart = undefined;
  }
  if (!cart) {
    cart = await orderApi.ensureCart(ctx, branchId);
    assertAccount();
    checkOwner();
  }

  const wanted = new Map<string, DineInCartLine>();
  for (const line of lines) {
    const sig = sigOfLine(line);
    const previous = wanted.get(sig);
    wanted.set(sig, previous ? { ...line, quantity: previous.quantity + line.quantity } : { ...line });
  }

  const existing = new Map<string, QrCartItem[]>();
  for (const item of cart.items) {
    const sig = sigOfItem(item);
    existing.set(sig, [...(existing.get(sig) ?? []), item]);
  }

  let changed = false;
  for (const [sig, items] of existing) {
    assertAccount();
    checkOwner();
    const line = wanted.get(sig);
    if (!line) {
      for (const item of items) {
        await orderApi.removeCartItem(ctx, item.id);
        assertAccount();
        changed = true;
      }
      continue;
    }

    const serverQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    // Keep previously merged duplicate rows intact when their aggregate quantity already matches.
    if (serverQuantity === line.quantity) continue;

    let remaining = line.quantity;
    const maxLineQuantity = 100;
    for (const item of items) {
      assertAccount();
      const quantity = Math.min(maxLineQuantity, remaining);
      remaining -= quantity;
      if (quantity === 0) await orderApi.removeCartItem(ctx, item.id);
      else if (item.quantity !== quantity) {
        await orderApi.updateCartItem(ctx, item.id, {
          variantId: line.variantId,
          quantity,
          note: line.note ?? null,
          options: line.options.map((o) => ({ optionId: o.optionId, quantity: o.quantity })),
        });
      } else continue;
      assertAccount();
      changed = true;
    }
    while (remaining > 0) {
      assertAccount();
      const quantity = Math.min(100, remaining);
      await orderApi.addCartItem(ctx, {
        variantId: line.variantId,
        quantity,
        note: line.note ?? null,
        options: line.options.map((o) => ({ optionId: o.optionId, quantity: o.quantity })),
      });
      remaining -= quantity;
      assertAccount();
      changed = true;
    }
    wanted.delete(sig);
  }
  for (const [sig, line] of wanted) {
    if (existing.has(sig)) continue;
    let remaining = line.quantity;
    while (remaining > 0) {
      assertAccount();
      checkOwner();
      const quantity = Math.min(100, remaining);
      await orderApi.addCartItem(ctx, {
        variantId: line.variantId,
        quantity,
        note: line.note ?? null,
        options: line.options.map((o) => ({ optionId: o.optionId, quantity: o.quantity })),
      });
      remaining -= quantity;
      assertAccount();
      changed = true;
    }
  }
  // Xoá dòng trả 204 không body → lấy lại giỏ để có pricing◇ mới nhất.
  assertAccount();
  checkOwner();
  return changed ? orderApi.getCurrentCart(ctx) : cart;
}

/** Làm cho giỏ server khớp `lines` rồi trả giỏ (id + pricing◇ do server tính). */
export const syncOnlineCart = (args: SyncArgs): Promise<QrCart> => enqueue((assertAccount) => sync(args, assertAccount));
