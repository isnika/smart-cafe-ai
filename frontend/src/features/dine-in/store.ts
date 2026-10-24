import { create } from 'zustand';
import {
  buildLineKey,
  MAX_LINE_QUANTITY,
  type DineInCartLine,
  type NewCartLine,
} from './cart';

interface DineInCartState {
  /** Giỏ thuộc về đúng 1 phiên bàn; đổi phiên → giỏ cũ bị bỏ. */
  tableSessionId: number | null;
  lines: DineInCartLine[];

  bindSession: (tableSessionId: number) => void;
  addLine: (line: NewCartLine, quantity?: number) => void;
  increment: (key: string) => void;
  decrement: (key: string) => void;
  removeLine: (key: string) => void;
  clear: () => void;
}

const clamp = (n: number) => Math.min(MAX_LINE_QUANTITY, n);

// Tổng số lượng / tổng tiền KHÔNG lưu trong state: dùng selector (cart.ts) để luôn suy ra từ `lines`.
export const useDineInCartStore = create<DineInCartState>((set) => ({
  tableSessionId: null,
  lines: [],

  bindSession: (tableSessionId) =>
    set((s) => (s.tableSessionId === tableSessionId ? s : { tableSessionId, lines: [] })),

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

  clear: () => set({ lines: [] }),
}));
