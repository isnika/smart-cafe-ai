import { formatVnd } from '@/shared/lib';
import type { OrderLineInput } from '@/shared/types';
import type { QrCart } from '@/shared/api/order';

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
  /** lineTotal do server trả (pricing◇). Có → hiển thị thay cho số tự tính; xoá khi đang optimistic. */
  serverLineTotal?: number | null;
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

/** Ưu tiên số tiền server trả; chỉ tự tính khi server không trả (offline/mock/optimistic) — chỉ để HIỂN THỊ. */
export const lineTotal = (line: DineInCartLine): number => line.serverLineTotal ?? lineUnitTotal(line) * line.quantity;

export const countItems = (lines: readonly DineInCartLine[]): number => lines.reduce((n, l) => n + l.quantity, 0);

/** TẠM TÍNH ĐỂ HIỂN THỊ khi chưa có pricing◇ từ server (đang optimistic / offline / mock). Không bao giờ gửi lên server. */
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

/** "Size M, Trân châu" – dòng mô tả dưới tên món. */
export const describeLine = (l: Pick<DineInCartLine, 'variantName' | 'options'>): string =>
  [l.variantName !== 'Standard' ? `Size ${l.variantName}` : null, ...l.options.map((o) => o.optionName)]
    .filter(Boolean)
    .join(', ');

/** "Từ X" khi các variant có giá khác nhau; null khi món không có giá bán. */
export function priceLabel(p: { price: number | null; maxPrice: number | null }): string | null {
  if (p.price === null) return null;
  return p.maxPrice !== null && p.maxPrice > p.price ? `Từ ${formatVnd(p.price)}` : formatVnd(p.price);
}


/** Thông tin hiển thị (tên/giá/ảnh) khách đã thấy lúc thêm món; dùng khi server không trả snapshot trong giỏ. */
export interface LineDisplayMeta {
  productId: number;
  productName: string;
  image?: string | null;
  variantName: string;
  unitPrice: number;
  options: Record<number, { optionName: string; extraPrice: number }>;
}

/** Cart server → dòng hiển thị. key = id dòng giỏ trên server; tên/giá lấy từ server, thiếu thì từ meta đã nhớ. */
export function cartToLines(cart: QrCart, meta: ReadonlyMap<number, LineDisplayMeta>): DineInCartLine[] {
  return cart.items.map((it) => {
    const m = meta.get(it.variantId);
    const unitPrice = it.unitPrice ?? m?.unitPrice ?? 0;
    return {
      key: String(it.id),
      productId: it.productId ?? m?.productId ?? 0,
      productName: it.productName ?? m?.productName ?? `Món #${it.variantId}`,
      image: it.productImage ?? m?.image ?? null,
      variantId: it.variantId,
      variantName: it.variantName ?? m?.variantName ?? 'Standard',
      unitPrice,
      options: it.options.map((o) => ({
        optionId: o.optionId,
        optionName: o.optionName ?? m?.options[o.optionId]?.optionName ?? `Tuỳ chọn #${o.optionId}`,
        extraPrice: o.unitPrice ?? m?.options[o.optionId]?.extraPrice ?? 0,
        quantity: o.quantity,
      })),
      ...(it.note ? { note: it.note } : {}),
      quantity: it.quantity,
      serverLineTotal: it.lineTotal ?? null,
    };
  });
}
