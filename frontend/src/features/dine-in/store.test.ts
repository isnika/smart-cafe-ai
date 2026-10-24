import { beforeEach, describe, expect, it } from 'vitest';
import { calcSubTotal, countItems, lineTotal, toOrderLines, type NewCartLine } from './cart';
import { useDineInCartStore } from './store';
import { isValidTableCode } from './validators';

const sugar = (optionId: number, name = '100% đường') => ({ optionId, optionName: name, extraPrice: 0, quantity: 1 });
const pearl = { optionId: 104, optionName: 'Trân châu', extraPrice: 10_000, quantity: 1 };
const cheese = { optionId: 106, optionName: 'Kem cheese', extraPrice: 12_000, quantity: 1 };

const coffee = (over: Partial<NewCartLine> = {}): NewCartLine => ({
  productId: 1, productName: 'Cà phê sữa đá', variantId: 12, variantName: 'M', unitPrice: 35_000,
  options: [sugar(101), pearl], ...over,
});

const state = () => useDineInCartStore.getState();

beforeEach(() => {
  useDineInCartStore.setState({ tableSessionId: null, lines: [] });
  state().bindSession(1);
});

describe('dine-in cart store', () => {
  it('thêm món, tính tổng số lượng và tổng tiền (gồm option)', () => {
    state().addLine(coffee(), 2);
    state().addLine({ productId: 7, productName: 'Bánh croissant', variantId: 71, variantName: 'Standard', unitPrice: 35_000, options: [] });
    expect(countItems(state().lines)).toBe(3);
    expect(calcSubTotal(state().lines)).toBe(2 * 45_000 + 35_000);
  });

  it('thêm lại cùng món + cùng option (khác thứ tự) → gộp một dòng', () => {
    state().addLine(coffee({ options: [sugar(101), pearl, cheese] }));
    state().addLine(coffee({ options: [cheese, pearl, sugar(101)] }));
    expect(state().lines).toHaveLength(1);
    expect(state().lines[0]?.quantity).toBe(2);
  });

  it('khác option / khác variant / khác ghi chú → dòng riêng', () => {
    state().addLine(coffee());
    state().addLine(coffee({ options: [sugar(101), cheese] }));
    state().addLine(coffee({ variantId: 13, variantName: 'L' }));
    state().addLine(coffee({ note: 'ít đá' }));
    expect(state().lines).toHaveLength(4);
  });

  it('tăng / giảm; giảm về 0 thì bỏ dòng', () => {
    state().addLine(coffee());
    const key = state().lines[0]!.key;
    state().increment(key);
    expect(state().lines[0]?.quantity).toBe(2);
    state().decrement(key);
    state().decrement(key);
    expect(state().lines).toHaveLength(0);
  });

  it('xoá dòng và xoá toàn bộ giỏ', () => {
    state().addLine(coffee());
    state().addLine(coffee({ variantId: 13, variantName: 'L' }));
    state().removeLine(state().lines[0]!.key);
    expect(state().lines).toHaveLength(1);
    state().clear();
    expect(state().lines).toEqual([]);
  });

  it('giới hạn 99 mỗi dòng và bỏ qua số lượng không hợp lệ', () => {
    state().addLine(coffee(), 98);
    state().addLine(coffee(), 5);
    expect(state().lines[0]?.quantity).toBe(99);
    state().addLine(coffee({ variantId: 99 }), 0);
    state().addLine(coffee({ variantId: 98 }), 1.5);
    expect(state().lines).toHaveLength(1);
  });

  it('giỏ không rò sang phiên bàn khác; bind lại cùng phiên thì giữ nguyên', () => {
    state().addLine(coffee());
    state().bindSession(1);
    expect(state().lines).toHaveLength(1);
    state().bindSession(2);
    expect(state().tableSessionId).toBe(2);
    expect(state().lines).toEqual([]);
  });

  it('toOrderLines khớp OrderLineInput (variantId + option, không gửi giá)', () => {
    state().addLine(coffee({ note: '  ít đá ' }), 2);
    state().addLine({ productId: 7, productName: 'Bánh', variantId: 71, variantName: 'Standard', unitPrice: 35_000, options: [] });
    expect(toOrderLines(state().lines)).toEqual([
      { variantId: 12, quantity: 2, options: [{ optionId: 101, quantity: 1 }, { optionId: 104, quantity: 1 }], note: 'ít đá' },
      { variantId: 71, quantity: 1 },
    ]);
    expect(lineTotal(state().lines[0]!)).toBe(90_000);
  });
});

describe('isValidTableCode', () => {
  it('nhận mã QR hợp lệ, từ chối rỗng / ký tự lạ / quá dài', () => {
    expect(isValidTableCode('QR-B1-T05')).toBe(true);
    expect(isValidTableCode(undefined)).toBe(false);
    expect(isValidTableCode('')).toBe(false);
    expect(isValidTableCode('a b')).toBe(false);
    expect(isValidTableCode('<script>')).toBe(false);
    expect(isValidTableCode('x'.repeat(65))).toBe(false);
  });
});
