import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  buildLineKey,
  MAX_LINE_QUANTITY,
  type DineInCartLine,
  type NewCartLine,
} from '@/features/dine-in/cart';

/** Online chỉ có 2 hình thức; Dine_In thuộc luồng QR và không bao giờ đi qua store này. */
export type OnlineFulfillment = 'Delivery' | 'Pickup';

/** Thông tin nhận hàng của đơn Delivery (khớp DeliveryInfoInput khi gửi lên server). */
export interface DeliveryDetails {
  receiverName: string;
  phone: string;
  /** Địa chỉ đầy đủ MỘT chuỗi (đã ghép từ địa chỉ đã lưu nếu có) → delivery_address. */
  addressLine: string;
  /** Toạ độ của địa chỉ đã lưu (nếu có) → delivery_latitude/delivery_longitude. */
  latitude?: number;
  longitude?: number;
}

interface CartSnapshot {

  /** null = khách đang duyệt món/chỉnh giỏ, chưa chọn cách nhận hàng. */
  fulfillmentType: OnlineFulfillment | null;
  lines: DineInCartLine[];
  /** Mã đã được người dùng nhập; mức giảm thật luôn do server (validate) trả, không lưu ở đây. */
  voucherCode: string | null;
  delivery: DeliveryDetails | null;
}

interface OnlineCartState extends CartSnapshot {
  ownerId: string | null;
  syncStatus: 'ready' | 'loading' | 'error';
  savedCarts: Record<string, CartSnapshot>;
  /** Bind the local cart to an authenticated user, or to the anonymous shopping session. */
  bindOwner: (ownerId: string | null) => void;

  setFulfillment: (type: OnlineFulfillment | null) => void;
  addLine: (line: NewCartLine, quantity?: number) => void;
  increment: (key: string) => void;
  decrement: (key: string) => void;
  removeLine: (key: string) => void;
  updateLine: (key: string, line: NewCartLine) => void;
  setVoucher: (code: string | null) => void;
  setDelivery: (delivery: DeliveryDetails) => void;
  /** Sau khi đặt đơn: bỏ món + mã giảm giá, giữ hình thức nhận và địa chỉ để lần sau khỏi nhập lại. */
  clearOrder: () => void;
}

const clamp = (n: number) => Math.min(MAX_LINE_QUANTITY, n);
const emptyCart = (): CartSnapshot => ({ fulfillmentType: null, lines: [], voucherCode: null, delivery: null });
const cartSnapshot = (state: CartSnapshot): CartSnapshot => ({
  fulfillmentType: state.fulfillmentType, lines: state.lines,
  voucherCode: state.voucherCode, delivery: state.delivery,
});
const ownerKey = (id: string | null) => id === null ? 'guest' : `user:${id}`;

// Giỏ Online TÁCH HẲN giỏ Dine-in (store khác, không chung state). Tổng tiền không lưu: suy ra từ `lines` (cart.ts).
export const useOnlineCartStore = create<OnlineCartState>()(persist((set) => ({
  ownerId: null,
  savedCarts: {},
  syncStatus: 'ready',
  fulfillmentType: null,
  lines: [],
  voucherCode: null,
  delivery: null,

  bindOwner: (ownerId) => set((state) => {
    if (state.ownerId === ownerId) return state;
    const savedCarts = { ...state.savedCarts, [ownerKey(state.ownerId)]: cartSnapshot(state) };
    // Only an anonymous shopping cart can be adopted on login. Never transfer another user's cart.
    const target = savedCarts[ownerKey(ownerId)]
      ?? (state.ownerId === null && ownerId !== null ? cartSnapshot(state) : emptyCart());
    if (state.ownerId === null && ownerId !== null) delete savedCarts.guest;
    return { ...target, ownerId, savedCarts };
  }),

  setFulfillment: (fulfillmentType) => set({ fulfillmentType }),

  addLine: (line, quantity = 1) => {
    if (!Number.isInteger(quantity) || quantity < 1) return;
    const key = buildLineKey(line);
    set((s) => {
      const existing = s.lines.find((l) => l.key === key);
      if (existing) {
        return { lines: s.lines.map((l) => (l.key === key ? { ...l, quantity: clamp(l.quantity + quantity), serverLineTotal: null } : l)) };
      }
      return { lines: [...s.lines, { ...line, key, quantity: clamp(quantity) }] };
    });
  },

  increment: (key) =>
    set((s) => ({ lines: s.lines.map((l) => (l.key === key ? { ...l, quantity: clamp(l.quantity + 1) } : l)) })),

  // Giảm về 0 thì bỏ dòng.
  decrement: (key) =>
    set((s) => ({
      lines: s.lines.flatMap((l) => (l.key !== key ? [l] : l.quantity <= 1 ? [] : [{ ...l, quantity: l.quantity - 1 }])),
    })),

  removeLine: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),

  updateLine: (key, line) => set((s) => {
    const updated = { ...line, key: buildLineKey(line), quantity: s.lines.find((item) => item.key === key)?.quantity ?? 1 };
    const remaining = s.lines.filter((item) => item.key !== key && item.key !== updated.key);
    const collision = s.lines.find((item) => item.key === updated.key && item.key !== key);
    return { lines: [...remaining, collision ? { ...updated, quantity: clamp(updated.quantity + collision.quantity) } : updated] };
  }),

  setVoucher: (voucherCode) => set({ voucherCode }),
  setDelivery: (delivery) => set({ delivery }),
  clearOrder: () => set({ lines: [], voucherCode: null }),
}), {
  // Không chuyển dữ liệu v1: định dạng cũ không ghi chủ sở hữu, có thể là giỏ tài khoản khác.
  name: 'smartcafe.online-cart.v2',
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    ownerId: null,
    fulfillmentType: state.ownerId ? null : state.fulfillmentType,
    lines: state.ownerId ? [] : state.lines,
    voucherCode: state.ownerId ? null : state.voucherCode,
    delivery: state.ownerId ? null : state.delivery,
  }) as OnlineCartState,
}));

/** Chuyển quyền sở hữu cục bộ khi phiên thay đổi; không bao giờ chuyển giỏ giữa hai tài khoản. */
export function changeOnlineCartOwner(ownerId: string | null): void {
  const previous = useOnlineCartStore.getState().ownerId;
  if (previous === ownerId) return;
  if (previous) {
    try { localStorage.removeItem(`smartcafe.pending-guest-cart.${previous}`); } catch { /* storage unavailable */ }
  }
  if (previous !== null) {
    const state = useOnlineCartStore.getState();
    const savedCarts = { ...state.savedCarts, [ownerKey(previous)]: cartSnapshot(state) };
    useOnlineCartStore.setState({ ...emptyCart(), ...(ownerId ? savedCarts[ownerKey(ownerId)] : undefined), savedCarts, ownerId, syncStatus: ownerId ? 'loading' : 'ready' });
  } else {
    if (ownerId) {
      try {
        const key = `smartcafe.pending-guest-cart.${ownerId}`;
        const current = useOnlineCartStore.getState();
        const saved = localStorage.getItem(key);
        if (!current.lines.length && saved) {
          const pending = JSON.parse(saved) as { lines?: DineInCartLine[]; fulfillmentType?: OnlineFulfillment | null };
          if (Array.isArray(pending.lines)) useOnlineCartStore.setState({ lines: pending.lines, fulfillmentType: pending.fulfillmentType ?? null });
        } else if (current.lines.length) {
          localStorage.setItem(key, JSON.stringify({ lines: current.lines, fulfillmentType: current.fulfillmentType }));
        }
      } catch { /* Keep the current in-memory cart if storage is unavailable. */ }
    }
    const state = useOnlineCartStore.getState();
    const restored = ownerId ? state.savedCarts[ownerKey(ownerId)] : undefined;
    useOnlineCartStore.setState({ ...(restored ?? {}), ownerId, syncStatus: ownerId ? 'loading' : 'ready' });
  }
}

export function clearPendingGuestCart(ownerId: string): void {
  try { localStorage.removeItem(`smartcafe.pending-guest-cart.${ownerId}`); } catch { /* storage unavailable */ }
}
