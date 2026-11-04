import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { envelopeError, url } from '@/mocks/utils';
import { orderApi } from '@/shared/api';
import { getClientKey } from '@/shared/api/guest';
import { latte, resetWorld, startTableSession, TABLE_CODE } from '@/test/helpers';
import { countItems, lineTotal, toOrderLines, type NewCartLine } from './cart';
import { selectSubTotal, useDineInCartStore } from './store';
import { isValidTableCode } from './validators';

const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => {
  resetWorld();
  server.events.removeAllListeners();
});

const state = () => useDineInCartStore.getState();
const sugar = (optionId: number) => ({ optionId, optionName: '100% đường', extraPrice: 0, quantity: 1 });
const pearl = { optionId: 104, optionName: 'Trân châu', extraPrice: 10_000, quantity: 1 };
const croissant: NewCartLine = { productId: 7, productName: 'Bánh croissant', variantId: 71, variantName: 'Standard', unitPrice: 35_000, options: [] };

describe('P2 giỏ server-side → zustand', () => {
  it('thêm món: state = giỏ server (id dòng, pricing◇ do server tính)', async () => {
    await startTableSession();
    expect(await state().addLine(latte, 2)).toBe(true);
    await state().addLine(croissant);
    expect(state().cartId).toBe(db.carts[0]!.id);
    expect(state().lines.map((l) => [l.variantId, l.quantity, l.key])).toEqual([[12, 2, '1'], [71, 1, '2']]);
    expect(countItems(state().lines)).toBe(3);
    expect(state().serverSubTotal).toBe(2 * 45_000 + 35_000);
    expect(selectSubTotal(state())).toBe(125_000);
    expect(lineTotal(state().lines[0]!)).toBe(90_000);
    expect(state().lines[0]!.options.map((o) => o.optionName)).toEqual(['100% đường', 'Trân châu']);
  });

  it('ensureCart idempotent: POST /carts trả cùng giỏ (200) và chỉ tạo 1 giỏ', async () => {
    await startTableSession();
    const ctx = { sessionCode: state().sessionCode! };
    const a = await orderApi.ensureCart(ctx, 1);
    const b = await orderApi.ensureCart(ctx, 1);
    expect(b.id).toBe(a.id);
    expect(db.carts).toHaveLength(1);
    await state().addLine(latte);
    await state().addLine(croissant);
    expect(db.carts).toHaveLength(1); // store chỉ gọi POST /carts khi chưa biết giỏ
  });

  it('thêm lại cùng món + option (khác thứ tự) → server gộp một dòng (PUT, không thêm dòng)', async () => {
    await startTableSession();
    await state().addLine({ ...latte, options: [sugar(101), pearl] });
    await state().addLine({ ...latte, options: [pearl, sugar(101)] });
    expect(state().lines).toHaveLength(1);
    expect(state().lines[0]?.quantity).toBe(2);
    expect(db.carts[0]!.items).toHaveLength(1);
  });

  it('khác option / ghi chú → dòng riêng', async () => {
    await startTableSession();
    await state().addLine(latte);
    await state().addLine({ ...latte, options: [sugar(101)] });
    await state().addLine({ ...latte, note: 'ít đá' });
    expect(state().lines).toHaveLength(3);
  });

  it('sửa số lượng (PUT) và xoá dòng (DELETE + GET) đồng bộ state với server', async () => {
    await startTableSession();
    await state().addLine(latte);
    await state().addLine(croissant);
    const key = state().lines[0]!.key;
    await state().increment(key);
    expect(state().lines[0]?.quantity).toBe(2);
    expect(db.carts[0]!.items[0]?.quantity).toBe(2);
    await state().decrement(key);
    expect(db.carts[0]!.items[0]?.quantity).toBe(1);
    await state().decrement(key); // về 0 → xoá dòng
    expect(state().lines.map((l) => l.variantId)).toEqual([71]);
    expect(db.carts[0]!.items).toHaveLength(1);
    expect(state().serverSubTotal).toBe(35_000);
    await state().removeLine(state().lines[0]!.key);
    expect(state().lines).toEqual([]);
    expect(db.carts[0]!.items).toEqual([]);
  });

  it('bấm + liên tiếp: các thao tác chạy tuần tự, không mất lượt', async () => {
    await startTableSession();
    await state().addLine(croissant);
    const key = state().lines[0]!.key;
    await Promise.all([state().increment(key), state().increment(key), state().increment(key)]);
    expect(state().lines[0]?.quantity).toBe(4);
    expect(db.carts[0]!.items[0]?.quantity).toBe(4);
  });

  it('clear → DELETE /carts/current (Abandoned) và state rỗng; thêm món sau đó tạo giỏ mới', async () => {
    await startTableSession();
    await state().addLine(croissant);
    await state().clear();
    expect(db.carts[0]!.status).toBe('Abandoned');
    expect(state().lines).toEqual([]);
    expect(state().cartId).toBeNull();
    await state().addLine(croissant);
    expect(db.carts).toHaveLength(2);
    expect(state().cartId).toBe(db.carts[1]!.id);
  });

  it('422 OUT_OF_STOCK: rollback optimistic, thông báo theo tên món, giỏ không đổi', async () => {
    await startTableSession();
    await state().addLine(croissant);
    const key = state().lines[0]!.key;
    db.unavailableVariants.add('1:71');
    expect(await state().increment(key)).toBe(false);
    expect(state().lines[0]?.quantity).toBe(1);
    expect(state().error).toMatchObject({ code: 'OUT_OF_STOCK', itemName: 'Bánh croissant' });
    expect(state().error?.message).toContain('Bánh croissant');
    expect(db.carts[0]!.items[0]?.quantity).toBe(1);

    // Thêm món hết hàng mới → không vào giỏ
    expect(await state().addLine({ ...croissant, variantId: 41, productName: 'Matcha', productId: 4, variantName: 'M' })).toBe(false);
    expect(state().lines).toHaveLength(1);
    expect(state().error?.message).toContain('Matcha');
    state().clearError();
    expect(state().error).toBeNull();
  });

  it('lỗi mạng khi sửa: rollback về bản trước, báo lỗi có thể thử lại', async () => {
    await startTableSession();
    await state().addLine(croissant);
    server.use(http.put(url('/carts/current/items/:id'), () => envelopeError(503, 'X', 'busy'), { once: true }));
    expect(await state().increment(state().lines[0]!.key)).toBe(false);
    expect(state().lines[0]?.quantity).toBe(1);
    expect(state().error?.retryable).toBe(true);
  });

  it('reload (store trống, cùng client key + mã phiên) → loadCart lấy lại đúng giỏ của server', async () => {
    await startTableSession();
    await state().addLine(latte, 2);
    const { sessionCode, tableSessionId, branchId } = state();
    useDineInCartStore.setState({ tableSessionId: null, tableCode: null, sessionCode: null, cartId: null, lines: [], serverSubTotal: null });
    state().bindSession(tableSessionId!, TABLE_CODE, sessionCode!, branchId!);
    await state().loadCart();
    expect(state().lines.map((l) => [l.variantId, l.quantity])).toEqual([[12, 2]]);
    expect(state().lines[0]!.productName).toBe('Cà phê sữa đá'); // tên từ snapshot server
    expect(getClientKey()).toBe(db.carts[0]!.clientKey);
  });

  it('chưa có giỏ trên server (404) → state rỗng, không lỗi', async () => {
    await startTableSession();
    await state().loadCart();
    expect(state().lines).toEqual([]);
    expect(state().error).toBeNull();
  });

  it('mã phiên bị server từ chối (403) → báo quét lại QR và quên mã đã lưu', async () => {
    await startTableSession();
    useDineInCartStore.setState({ sessionCode: 'sai-ma' });
    expect(await state().addLine(croissant)).toBe(false);
    expect(state().error?.message).toMatch(/quét lại/);
  });

  it('chưa có phiên bàn → từ chối, không gọi API', async () => {
    expect(await state().addLine(croissant)).toBe(false);
    expect(state().error?.code).toBe('NO_SESSION');
  });

  it('giỏ không rò sang phiên bàn khác; bind lại cùng phiên thì giữ nguyên', async () => {
    await startTableSession();
    await state().addLine(croissant);
    const id = state().tableSessionId!;
    state().bindSession(id);
    expect(state().lines).toHaveLength(1);
    state().bindSession(id + 1);
    expect(state().tableSessionId).toBe(id + 1);
    expect(state().lines).toEqual([]);
    expect(state().cartId).toBeNull();
  });

  it('toOrderLines khớp OrderLineInput (variantId + option, không gửi giá)', async () => {
    await startTableSession();
    await state().addLine({ ...latte, note: '  ít đá ' }, 2);
    expect(toOrderLines(state().lines)).toEqual([
      { variantId: 12, quantity: 2, options: [{ optionId: 101, quantity: 1 }, { optionId: 104, quantity: 1 }], note: 'ít đá' },
    ]);
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
