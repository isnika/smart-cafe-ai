import { create } from 'zustand';
import { clearSessionCode, orderApi } from '@/shared/api';
import type { QrCart, QrCartCtx, QrCartItemInput } from '@/shared/api/order';
import { isApiError } from '@/shared/api';
import {
  buildLineKey,
  calcSubTotal,
  cartToLines,
  MAX_LINE_QUANTITY,
  type DineInCartLine,
  type LineDisplayMeta,
  type NewCartLine,
} from './cart';
import { DINE_IN_BRANCH_ID } from './config';
import { describeApiError, type DineInErrorInfo } from './errors';

/**
 * Giỏ Dine-in: zustand chỉ là BỘ NHỚ ĐỆM UI của giỏ server-side (POST/GET /carts…).
 * Mọi thêm/sửa/xoá gọi API rồi thay state bằng giỏ server trả về → server là nguồn sự thật duy nhất.
 */
interface DineInCartState {
  /** Giỏ thuộc về đúng 1 phiên bàn; đổi phiên → giỏ cũ bị bỏ. */
  tableSessionId: number | null;
  tableCode: string | null;
  /** session_code → header X-Table-Session-Code cho mọi call guest. */
  sessionCode: string | null;
  branchId: number | null;
  /** Id giỏ Active trên server (cần cho POST /orders); null = chưa có/đã chuyển Converted. */
  cartId: number | null;
  lines: DineInCartLine[];
  /** pricing.sub_total do server tính; null khi đang optimistic / server không trả → UI rơi về calcSubTotal. */
  serverSubTotal: number | null;
  /** Số thao tác giỏ đang chờ server. */
  pending: number;
  error: (DineInErrorInfo & { itemName?: string }) | null;

  bindSession: (tableSessionId: number, tableCode?: string, sessionCode?: string, branchId?: number) => void;
  loadCart: () => Promise<void>;
  addLine: (line: NewCartLine, quantity?: number) => Promise<boolean>;
  increment: (key: string) => Promise<boolean>;
  decrement: (key: string) => Promise<boolean>;
  removeLine: (key: string) => Promise<boolean>;
  /** Bỏ giỏ trên server (Abandoned) rồi xoá state. */
  clear: () => Promise<void>;
  /** Xoá state cục bộ (sau khi POST /orders thành công: giỏ server đã Converted). */
  resetLocal: () => void;
  clearError: () => void;
}

const clamp = (n: number) => Math.min(MAX_LINE_QUANTITY, n);
const EMPTY = { cartId: null, lines: [] as DineInCartLine[], serverSubTotal: null };

/** Tên/giá món đã thấy lúc thêm vào giỏ (server không bắt buộc trả snapshot). */
const displayMeta = new Map<number, LineDisplayMeta>();

// ── Hàng đợi tuần tự: các thao tác giỏ không bao giờ chạy chồng nhau (tránh race thêm/sửa/xoá) ──
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}
/** Chờ mọi thao tác giỏ đang chạy xong (submit gọi trước khi gửi đơn). */
export const flushCartQueue = (): Promise<void> => queue.then(() => undefined);

const lineSignature = (l: Pick<DineInCartLine, 'variantId' | 'options' | 'note'>) =>
  buildLineKey({ variantId: l.variantId, options: l.options, note: l.note });

const toInput = (l: DineInCartLine, quantity: number): QrCartItemInput => ({
  variantId: l.variantId,
  quantity,
  note: l.note ?? null,
  options: l.options.map((o) => ({ optionId: o.optionId, quantity: o.quantity })),
});

export const useDineInCartStore = create<DineInCartState>((set, get) => {
  const ctx = (): QrCartCtx | null => {
    const { sessionCode } = get();
    return sessionCode ? { sessionCode } : null;
  };

  /** Thay state bằng giỏ server. Giỏ không còn Active (Converted/Abandoned) → coi như chưa có giỏ. */
  function apply(cart: QrCart) {
    if (cart.status !== 'Active') {
      set({ ...EMPTY });
      return;
    }
    set({
      cartId: cart.id,
      lines: cartToLines(cart, displayMeta),
      serverSubTotal: cart.pricing?.subTotal ?? null,
    });
  }

  function fail(err: unknown, itemName?: string) {
    const info = describeApiError(err, { itemName });
    set({ error: { ...info, ...(itemName ? { itemName } : {}) } });
    // 401/403: mã phiên không còn dùng được → bỏ mã đã lưu để lần vào bàn sau mở phiên mới.
    if (isApiError(err) && (err.status === 401 || err.status === 403)) {
      const { tableCode } = get();
      if (tableCode) clearSessionCode(tableCode);
    }
    return info;
  }

  const track = async <T,>(task: () => Promise<T>): Promise<T> => {
    set((s) => ({ pending: s.pending + 1 }));
    try {
      return await task();
    } finally {
      set((s) => ({ pending: s.pending - 1 }));
    }
  };

  const fetchCart = async (c: QrCartCtx): Promise<void> => {
    try {
      apply(await orderApi.getCurrentCart(c));
    } catch (e) {
      if (isApiError(e) && e.status === 404) set({ ...EMPTY }); // chưa có giỏ Active
      else throw e;
    }
  };

  interface Plan {
    run: (c: QrCartCtx) => Promise<void>;
    /** Dòng hiển thị tức thì trong lúc chờ server (rollback nếu lỗi). */
    optimistic?: DineInCartLine[];
    itemName?: string;
  }

  /**
   * Thao tác ghi: xếp hàng tuần tự; `prepare` chạy NGAY TRƯỚC KHI gọi API nên luôn thấy state mới nhất
   * (bấm + liên tiếp không bị mất lượt). Lỗi → rollback về bản trước khi bấm + báo lỗi theo món.
   */
  function mutate(prepare: () => Plan | null): Promise<boolean> {
    const c = ctx();
    if (!c) {
      set({ error: { code: 'NO_SESSION', message: 'Chưa có phiên bàn. Vui lòng quét lại mã QR trên bàn.', retryable: false, reloadCart: false } });
      return Promise.resolve(false);
    }
    return enqueue(() =>
      track(async () => {
        const plan = prepare();
        if (!plan) return false;
        const snapshot = { lines: get().lines, serverSubTotal: get().serverSubTotal };
        if (plan.optimistic) set({ lines: plan.optimistic, serverSubTotal: null });
        set({ error: null });
        try {
          await plan.run(c);
          return true;
        } catch (e) {
          set(snapshot);
          const info = fail(e, plan.itemName);
          if (info.reloadCart) {
            try {
              await fetchCart(c);
            } catch {
              /* giữ bản rollback */
            }
          }
          return false;
        }
      }),
    );
  }

  const findLine = (key: string) => get().lines.find((l) => l.key === key);

  const removalPlan = (line: DineInCartLine): Plan => ({
    itemName: line.productName,
    optimistic: get().lines.filter((l) => l.key !== line.key),
    run: async (c) => {
      await orderApi.removeCartItem(c, Number(line.key));
      await fetchCart(c); // 204 không có body → lấy lại giỏ (pricing◇ mới)
    },
  });

  const quantityPlan = (line: DineInCartLine, q: number): Plan => ({
    itemName: line.productName,
    optimistic: get().lines.map((l) => (l.key === line.key ? { ...l, quantity: q, serverLineTotal: null } : l)),
    run: async (c) => apply(await orderApi.updateCartItem(c, Number(line.key), toInput(line, q))),
  });

  const changeQuantity = (key: string, delta: number) =>
    mutate(() => {
      const line = findLine(key);
      if (!line) return null;
      const next = line.quantity + delta;
      return next <= 0 ? removalPlan(line) : quantityPlan(line, clamp(next));
    });

  return {
    tableSessionId: null,
    tableCode: null,
    sessionCode: null,
    branchId: null,
    cartId: null,
    lines: [],
    serverSubTotal: null,
    pending: 0,
    error: null,

    bindSession: (tableSessionId, tableCode, sessionCode, branchId) => {
      const changed = get().tableSessionId !== tableSessionId;
      if (changed) {
        set({
          tableSessionId,
          tableCode: tableCode ?? null,
          sessionCode: sessionCode ?? null,
          branchId: branchId ?? null,
          error: null,
          ...EMPTY,
        });
        if (sessionCode) void get().loadCart(); // F5 / vào lại bàn: nạp giỏ server của phiên này
        return;
      }
      const patch: Partial<Pick<DineInCartState, 'tableCode' | 'sessionCode' | 'branchId'>> = {};
      if (tableCode && get().tableCode !== tableCode) patch.tableCode = tableCode;
      if (sessionCode && get().sessionCode !== sessionCode) patch.sessionCode = sessionCode;
      if (branchId !== undefined && get().branchId !== branchId) patch.branchId = branchId;
      if (Object.keys(patch).length > 0) set(patch);
    },

    loadCart: () => {
      const c = ctx();
      if (!c) return Promise.resolve();
      return enqueue(() =>
        track(async () => {
          try {
            await fetchCart(c);
          } catch (e) {
            fail(e);
          }
        }),
      );
    },

    addLine: (line, quantity = 1) => {
      if (!Number.isInteger(quantity) || quantity < 1) return Promise.resolve(false);
      displayMeta.set(line.variantId, {
        productId: line.productId,
        productName: line.productName,
        image: line.image ?? null,
        variantName: line.variantName,
        unitPrice: line.unitPrice,
        options: Object.fromEntries(line.options.map((o) => [o.optionId, { optionName: o.optionName, extraPrice: o.extraPrice }])),
      });
      return mutate(() => ({
        itemName: line.productName,
        run: async (c) => {
          // POST /carts idempotent (200|201): chỉ gọi khi chưa biết giỏ.
          if (get().cartId === null) {
            const cart = await orderApi.ensureCart(c, get().branchId ?? DINE_IN_BRANCH_ID);
            set({ cartId: cart.id });
          }
          const sig = buildLineKey(line);
          const existing = get().lines.find((l) => lineSignature(l) === sig);
          apply(
            existing
              ? await orderApi.updateCartItem(c, Number(existing.key), toInput(existing, clamp(existing.quantity + quantity)))
              : await orderApi.addCartItem(c, {
                  variantId: line.variantId,
                  quantity: clamp(quantity),
                  note: line.note ?? null,
                  options: line.options.map((o) => ({ optionId: o.optionId, quantity: o.quantity })),
                }),
          );
        },
      }));
    },

    increment: (key) => changeQuantity(key, 1),
    decrement: (key) => changeQuantity(key, -1),
    removeLine: (key) =>
      mutate(() => {
        const line = findLine(key);
        return line ? removalPlan(line) : null;
      }),

    clear: async () => {
      const c = ctx();
      if (!c || get().cartId === null) {
        set({ ...EMPTY });
        return;
      }
      await mutate(() => ({
        run: async (cc) => {
          await orderApi.clearCart(cc);
          set({ ...EMPTY });
        },
      }));
    },

    resetLocal: () => set({ ...EMPTY, error: null }),
    clearError: () => set({ error: null }),
  };
});

/** pricing◇ từ server; chưa có (optimistic/offline/mock) → tạm tính để HIỂN THỊ. */
export const selectSubTotal = (s: Pick<DineInCartState, 'serverSubTotal' | 'lines'>): number =>
  s.serverSubTotal ?? calcSubTotal(s.lines);

/** Chỉ dành cho test. */
export function resetCartInternals(): void {
  displayMeta.clear();
  queue = Promise.resolve();
}
