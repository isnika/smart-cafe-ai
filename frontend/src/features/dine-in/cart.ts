import type { OrderLineInput } from '@/shared/types';

/** Giá/tên chỉ để HIỂN THỊ. Server tính lại tiền từ variantId + optionId khi tạo đơn. */
export interface CartLineOption {
  optionId: number;
  optionName: string;
  extraPrice: number;
  /** trên mỗi 1 unit của dòng (khớp OrderLineInput.options[].quantity) */
  quantity: number;
}

export interface DineInCartLine {
  /** Định danh dòng: cùng variant + cùng option + cùng ghi chú → cùng key → gộp số lượng. */
  key: string;
  productId: number;
  productName: string;
  image?: string | null;
  variantId: number;
  variantName: string;
  unitPrice: number;
  options: CartLineOption[];
  note?: string;
  quantity: number;
}

export type NewCartLine = Omit<DineInCartLine, 'key' | 'quantity'>;

export const MAX_LINE_QUANTITY = 99;

/** Sắp xếp option theo id để thứ tự người dùng bấm không tạo ra hai dòng khác nhau. */
export function buildLineKey(line: Pick<NewCartLine, 'variantId' | 'options' | 'note'>): string {
  const opts = [...line.options]
    .sort((a, b) => a.optionId - b.optionId)
    .map((o) => `${o.optionId}x${o.quantity}`)
    .join(',');
  return `${line.variantId}|${opts}|${line.note?.trim() ?? ''}`;
}

/** Giá 1 unit gồm cả option. */
export const lineUnitTotal = (line: Pick<DineInCartLine, 'unitPrice' | 'options'>): number =>
  line.unitPrice + line.options.reduce((sum, o) => sum + o.extraPrice * o.quantity, 0);

export const lineTotal = (line: DineInCartLine): number => lineUnitTotal(line) * line.quantity;

export const countItems = (lines: readonly DineInCartLine[]): number => lines.reduce((n, l) => n + l.quantity, 0);

export const calcSubTotal = (lines: readonly DineInCartLine[]): number => lines.reduce((sum, l) => sum + lineTotal(l), 0);

/** Dữ liệu cho `CreateQrDineInOrderInput.lines` ở giai đoạn 2. */
export function toOrderLines(lines: readonly DineInCartLine[]): OrderLineInput[] {
  return lines.map((l) => ({
    variantId: l.variantId,
    quantity: l.quantity,
    ...(l.options.length ? { options: l.options.map((o) => ({ optionId: o.optionId, quantity: o.quantity })) } : {}),
    ...(l.note?.trim() ? { note: l.note.trim() } : {}),
  }));
}
