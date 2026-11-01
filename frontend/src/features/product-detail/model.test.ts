import { describe, expect, it } from 'vitest';
import { lineUnitTotal } from '@/features/dine-in/cart';
import type { ProductDetail, ProductOptionGroupView, ProductVariantView } from '@/shared/types';
import {
  buildDraft,
  firstMissingGroup,
  formatRating,
  formatReviewDate,
  initialPicks,
  initialVariantId,
  isSoldOut,
  parseProductId,
  togglePick,
  variantPriceHint,
} from './model';

const variant = (id: number, variantName: string, price: number, isAvailable = true): ProductVariantView => ({
  id, productId: 1, variantName, price, sortOrder: id, status: 'Active', isAvailable,
});

const group = (over: Partial<ProductOptionGroupView> & Pick<ProductOptionGroupView, 'id'>): ProductOptionGroupView => ({
  productId: 1, name: 'G', selectionType: 'Single', isRequired: false, minSelect: 0, maxSelect: 1, sortOrder: 1, options: [], ...over,
});

const opt = (id: number, groupId: number, extraPrice = 0, over: Partial<ProductOptionGroupView['options'][number]> = {}) => ({
  id, groupId, optionName: `o${id}`, extraPrice, isDefault: false, sortOrder: id, status: 'Active' as const, isAvailable: true, ...over,
});

describe('parseProductId', () => {
  it('chỉ nhận số nguyên dương thuần chữ số', () => {
    expect(parseProductId('12')).toBe(12);
    for (const bad of [undefined, '', '0', '-1', '1.5', '1e3', 'abc', '12abc', ' 1', '01', '99999999999999999999']) {
      expect(parseProductId(bad)).toBeNull();
    }
  });
});

describe('size', () => {
  const vs = [variant(11, 'S', 29_000), variant(12, 'M', 35_000), variant(13, 'L', 39_000)];

  it('gợi ý giá: size rẻ nhất là "Gốc", size khác là chênh lệch', () => {
    expect(vs.map((v) => variantPriceHint(vs, v))).toEqual(['Gốc', '+ 6.000đ', '+ 10.000đ']);
  });

  it('chọn sẵn size đầu tiên còn hàng; hết sạch thì null và coi như hết hàng', () => {
    expect(initialVariantId([variant(11, 'S', 1, false), variant(12, 'M', 2)])).toBe(12);
    const none = [variant(11, 'S', 1, false)];
    expect(initialVariantId(none)).toBeNull();
    expect(isSoldOut(none)).toBe(true);
    expect(isSoldOut([])).toBe(true);
    expect(isSoldOut(vs)).toBe(false);
  });
});

describe('option group', () => {
  const sugar = group({
    id: 1, name: 'Đường', isRequired: true, minSelect: 1,
    options: [opt(101, 1, 0, { isDefault: true }), opt(102, 1)],
  });
  const topping = group({
    id: 2, name: 'Topping', selectionType: 'Multiple', maxSelect: 2,
    options: [opt(104, 2, 10_000), opt(105, 2, 8_000), opt(106, 2, 12_000), opt(107, 2, 5_000, { isDefault: true, isAvailable: false })],
  });
  const groups = [sugar, topping];

  it('chọn sẵn option mặc định còn hàng (bỏ option mặc định đã hết)', () => {
    expect(initialPicks(groups)).toEqual({ 1: [101], 2: [] });
  });

  it('Single bắt buộc: đổi lựa chọn, bấm lại không bỏ chọn', () => {
    let p = initialPicks(groups);
    p = togglePick(groups, p, 1, 102);
    expect(p[1]).toEqual([102]);
    p = togglePick(groups, p, 1, 102);
    expect(p[1]).toEqual([102]);
  });

  it('Single tuỳ chọn: bấm lại thì bỏ chọn', () => {
    const optional = group({ id: 3, options: [opt(301, 3)] });
    const p = togglePick([optional], togglePick([optional], {}, 3, 301), 3, 301);
    expect(p[3]).toEqual([]);
  });

  it('Multiple: bật/tắt và không vượt quá maxSelect', () => {
    let p = initialPicks(groups);
    p = togglePick(groups, p, 2, 104);
    p = togglePick(groups, p, 2, 105);
    expect(p[2]).toEqual([104, 105]);
    expect(togglePick(groups, p, 2, 106)).toBe(p); // đã đủ 2 → giữ nguyên
    expect(togglePick(groups, p, 2, 104)[2]).toEqual([105]);
  });

  it('nhóm không tồn tại → không đổi gì', () => {
    const p = initialPicks(groups);
    expect(togglePick(groups, p, 99, 1)).toBe(p);
  });

  it('firstMissingGroup: nhóm bắt buộc chưa chọn, hoặc chưa đủ minSelect', () => {
    expect(firstMissingGroup(groups, { 1: [], 2: [] })?.name).toBe('Đường');
    expect(firstMissingGroup(groups, initialPicks(groups))).toBeUndefined();
    const atLeastTwo = group({ id: 5, name: 'Chọn 2', selectionType: 'Multiple', minSelect: 2, maxSelect: 3, options: [opt(501, 5), opt(502, 5)] });
    expect(firstMissingGroup([atLeastTwo], { 5: [501] })?.name).toBe('Chọn 2');
    expect(firstMissingGroup([atLeastTwo], { 5: [501, 502] })).toBeUndefined();
  });
});

describe('buildDraft → giá tạm tính', () => {
  const detail: Pick<ProductDetail, 'id' | 'name' | 'image'> = { id: 1, name: 'Cà phê sữa đá', image: null };
  const topping = group({ id: 2, selectionType: 'Multiple', maxSelect: 2, options: [opt(104, 2, 10_000), opt(106, 2, 12_000)] });

  it('giá 1 ly = giá size + tổng option đã chọn; giá dòng = giá 1 ly × số lượng', () => {
    const draft = buildDraft(detail, variant(12, 'M', 35_000), [topping], { 2: [104, 106] });
    expect(draft).toMatchObject({ productId: 1, productName: 'Cà phê sữa đá', variantId: 12, variantName: 'M', unitPrice: 35_000 });
    expect(draft!.options.map((o) => o.optionId)).toEqual([104, 106]);
    expect(lineUnitTotal(draft!)).toBe(57_000);
    expect(lineUnitTotal(draft!) * 3).toBe(171_000);
  });

  it('chưa có size → null', () => {
    expect(buildDraft(detail, null, [topping], {})).toBeNull();
  });
});

describe('định dạng', () => {
  it('điểm trung bình dùng dấu phẩy, luôn 1 chữ số thập phân', () => {
    expect(formatRating(4.428)).toBe('4,4');
    expect(formatRating(5)).toBe('5,0');
  });

  it('ngày review: dd/MM/yyyy; timestamp hỏng → "—"', () => {
    expect(formatReviewDate('2026-10-28T09:15:00Z')).toMatch(/^\d{2}\/10\/2026$/);
    expect(formatReviewDate('không phải ngày')).toBe('—');
  });
});
