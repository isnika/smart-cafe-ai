import type { NewCartLine } from '@/features/dine-in/cart';
import { formatVnd, parseUtc } from '@/shared/lib';
import type { ProductDetail, ProductOptionGroupView, ProductVariantView } from '@/shared/types';

/** groupId → các optionId đang chọn. */
export type Picks = Record<number, number[]>;

/** Chỉ nhận số nguyên dương viết thuần chữ số ("12"); "1e3", "0", "-1", "1.5", "abc" đều không hợp lệ. */
export function parseProductId(raw: string | undefined): number | null {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

export const sortVariants = (variants: readonly ProductVariantView[]): ProductVariantView[] =>
  [...variants].sort((a, b) => a.sortOrder - b.sortOrder);

export const sortGroups = (groups: readonly ProductOptionGroupView[]): ProductOptionGroupView[] =>
  [...groups].sort((a, b) => a.sortOrder - b.sortOrder);

/** Hết hàng ⇔ không còn variant nào bán được (kể cả khi món không còn variant Active). */
export const isSoldOut = (variants: readonly ProductVariantView[]): boolean => !variants.some((v) => v.isAvailable);

/** Variant chọn sẵn: variant đầu tiên còn hàng (theo sortOrder). */
export const initialVariantId = (variants: readonly ProductVariantView[]): number | null =>
  variants.find((v) => v.isAvailable)?.id ?? null;

/** Chọn sẵn các option mặc định còn hàng. */
export const initialPicks = (groups: readonly ProductOptionGroupView[]): Picks =>
  Object.fromEntries(groups.map((g) => [g.id, g.options.filter((o) => o.isDefault && o.isAvailable).map((o) => o.id)]));

/**
 * Bấm vào 1 option.
 * - Single: chọn option đó; bấm lại option đang chọn thì bỏ chọn, trừ khi nhóm bắt buộc.
 * - Multiple: bật/tắt; không vượt quá maxSelect.
 */
export function togglePick(groups: readonly ProductOptionGroupView[], picked: Picks, groupId: number, optionId: number): Picks {
  const group = groups.find((g) => g.id === groupId);
  if (!group) return picked;
  const current = picked[groupId] ?? [];
  if (group.selectionType === 'Single') {
    return { ...picked, [groupId]: current.includes(optionId) && !group.isRequired ? [] : [optionId] };
  }
  if (current.includes(optionId)) return { ...picked, [groupId]: current.filter((id) => id !== optionId) };
  if (current.length >= group.maxSelect) return picked;
  return { ...picked, [groupId]: [...current, optionId] };
}

/** Nhóm đầu tiên chưa chọn đủ (nhóm bắt buộc cần ≥ 1; nhóm có minSelect cần ≥ minSelect). */
export const firstMissingGroup = (groups: readonly ProductOptionGroupView[], picked: Picks): ProductOptionGroupView | undefined =>
  groups.find((g) => (picked[g.id]?.length ?? 0) < Math.max(g.minSelect, g.isRequired ? 1 : 0));

/** Dòng giỏ hàng từ lựa chọn hiện tại; null khi chưa có variant. Giá chỉ để hiển thị – server tính lại khi tạo đơn. */
export function buildDraft(
  detail: Pick<ProductDetail, 'id' | 'name' | 'image'>,
  variant: ProductVariantView | null,
  groups: readonly ProductOptionGroupView[],
  picked: Picks,
): NewCartLine | null {
  if (!variant) return null;
  return {
    productId: detail.id,
    productName: detail.name,
    image: detail.image,
    variantId: variant.id,
    variantName: variant.variantName,
    unitPrice: variant.price,
    options: groups.flatMap((g) =>
      g.options
        .filter((o) => picked[g.id]?.includes(o.id))
        .map((o) => ({ optionId: o.id, optionName: o.optionName, extraPrice: o.extraPrice, quantity: 1 })),
    ),
  };
}

/** Dòng phụ dưới tên size: "Gốc" cho size rẻ nhất, các size khác là chênh lệch so với size gốc ("+ 6.000đ"). */
export function variantPriceHint(variants: readonly ProductVariantView[], variant: ProductVariantView): string {
  const base = Math.min(...variants.map((v) => v.price));
  const delta = variant.price - base;
  return delta > 0 ? `+ ${formatVnd(delta)}` : 'Gốc';
}

/** "4,4" – điểm trung bình theo cách viết của người Việt. */
export const formatRating = (value: number): string =>
  new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);

/** "28/10/2026" theo giờ máy người dùng; "—" nếu timestamp không hợp lệ. */
export function formatReviewDate(createdAt: string): string {
  const d = parseUtc(createdAt);
  if (!d) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
