import { create } from 'zustand';
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
  addressLine: string;
}

interface OnlineCartState {
  /** null = khách chưa chọn "Giao hàng / Mang đi" → các màn Online không hoạt động, giỏ Dine-in vẫn là giỏ hiện hành. */
  fulfillmentType: OnlineFulfillment | null;
  lines: DineInCartLine[];
  /** Mã đã được người dùng nhập; mức giảm thật luôn do server (validate) trả, không lưu ở đây. */
  voucherCode: string | null;
  delivery: DeliveryDetails | null;

  setFulfillment: (type: OnlineFulfillment | null) => void;
  addLine: (line: NewCartLine, quantity?: number) => void;
  increment: (key: string) => void;
  decrement: (key: string) => void;
  removeLine: (key: string) => void;
  setVoucher: (code: string | null) => void;
  setDelivery: (delivery: DeliveryDetails) => void;
  /** Sau khi đặt đơn: bỏ món + mã giảm giá, giữ hình thức nhận và địa chỉ để lần sau khỏi nhập lại. */
  clearOrder: () => void;
}

const clamp = (n: number) => Math.min(MAX_LINE_QUANTITY, n);

// Giỏ Online TÁCH HẲN giỏ Dine-in (store khác, không chung state). Tổng tiền không lưu: suy ra từ `lines` (cart.ts).
export const useOnlineCartStore = create<OnlineCartState>((set) => ({
  fulfillmentType: null,
  lines: [],
  voucherCode: null,
  delivery: null,

  setFulfillment: (fulfillmentType) => set({ fulfillmentType }),

  addLine: (line, quantity = 1) => {
    if (!Number.isInteger(quantity) || quantity < 1) return;
    const key = buildLineKey(line);
    set((s) => {
      const existing = s.lines.find((l) => l.key === key);
      if (existing) {
        return { lines: s.lines.map((l) => (l.key === key ? { ...l, quantity: clamp(l.quantity + quantity) } : l)) };
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

  setVoucher: (voucherCode) => set({ voucherCode }),
  setDelivery: (delivery) => set({ delivery }),
  clearOrder: () => set({ lines: [], voucherCode: null }),
}));
