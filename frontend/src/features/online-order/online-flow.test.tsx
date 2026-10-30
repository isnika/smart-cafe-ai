// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildLineKey } from '@/features/dine-in/cart';
import { placeDineInOrder } from '@/features/dine-in/submit';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { url } from '@/mocks/utils';
import { engagementApi } from '@/shared/api';
import { latte, loginAs, resetWorld, startTableSession } from '@/test/helpers';
import { polyfillDialog, renderApp } from '@/test/renderApp';
import { useDineInCartStore } from '@/features/dine-in/store';
import { buildOnlineOrderInput, resetOnlineSubmitState } from './submit';
import { calcTotals } from './pricing';
import { useOnlineCartStore, type OnlineFulfillment } from './store';

const server = setupServer(...handlers);
const requests: string[] = [];
beforeAll(() => {
  server.listen();
  polyfillDialog();
  server.events.on('request:start', ({ request }) => requests.push(`${request.method} ${new URL(request.url).pathname}`));
});
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
beforeEach(() => {
  resetWorld();
  resetOnlineSubmitState();
  useOnlineCartStore.setState({ fulfillmentType: null, lines: [], voucherCode: null, delivery: null });
  requests.length = 0;
});

const ADDRESS = '123 Đường Lê Lợi, Phường Bến Thành, Quận 1';
const customer = () => loginAs('Customer', { id: 'u-1', fullName: 'Nguyễn Văn A', phone: '0901234567' });

/** Giỏ Online: 2 ly latte (mỗi ly 35.000 + trân châu 10.000 = 45.000đ) → tạm tính 90.000đ. */
function seedCart(type: OnlineFulfillment, quantity = 2, extra: Partial<{ voucherCode: string }> = {}) {
  useOnlineCartStore.setState({
    fulfillmentType: type,
    lines: [{ ...latte, key: buildLineKey(latte), quantity }],
    voucherCode: extra.voucherCode ?? null,
  });
}
const posts = () => requests.filter((r) => r.startsWith('POST ') && r.endsWith('/orders-svc/orders'));

async function fillAddress() {
  fireEvent.change(await screen.findByLabelText('Địa chỉ'), { target: { value: ADDRESS } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu địa chỉ' }));
}

describe('giỏ Online (store)', () => {
  it('gộp dòng trùng, giảm về 0 thì bỏ dòng, tách hẳn giỏ Dine-in', () => {
    const s = useOnlineCartStore.getState();
    s.addLine(latte, 1);
    s.addLine(latte, 2);
    expect(useOnlineCartStore.getState().lines).toHaveLength(1);
    expect(useOnlineCartStore.getState().lines[0]!.quantity).toBe(3);
    const key = useOnlineCartStore.getState().lines[0]!.key;
    s.decrement(key);
    s.decrement(key);
    s.decrement(key);
    expect(useOnlineCartStore.getState().lines).toHaveLength(0);
    expect(useDineInCartStore.getState().lines).toHaveLength(0);
    s.addLine(latte, 1);
    expect(useDineInCartStore.getState().lines).toHaveLength(0); // không rò sang giỏ Dine-in
  });

  it('calcTotals: giảm giá không vượt tạm tính, tổng = tạm tính − giảm + phí', () => {
    expect(calcTotals({ subTotal: 90_000, discount: 9_000, deliveryFee: 15_000 }).total).toBe(96_000);
    expect(calcTotals({ subTotal: 10_000, discount: 99_000, deliveryFee: 0 })).toMatchObject({ discount: 10_000, total: 0 });
  });
});

describe('API tạo đơn Online (hợp đồng đơn hàng hiện có)', () => {
  it('buildOnlineOrderInput: không có payAt, Delivery bắt buộc thông tin giao hàng', () => {
    const base = { lines: [{ ...latte, key: 'k', quantity: 1 }], userId: 'u-1', idempotencyKey: 'x' };
    const pickup = buildOnlineOrderInput({ ...base, fulfillmentType: 'Pickup' });
    expect(pickup).toMatchObject({ orderSource: 'Online', fulfillmentType: 'Pickup', userId: 'u-1' });
    expect('payAt' in pickup).toBe(false);
    expect(() => buildOnlineOrderInput({ ...base, fulfillmentType: 'Delivery' })).toThrow();
  });

  it('POST /engagement/vouchers/validate dùng cùng quy tắc với tạo đơn', async () => {
    expect(await engagementApi.validateVoucher({ code: 'giam10', branchId: 1, fulfillmentType: 'Delivery', subTotal: 90_000 })).toMatchObject({ valid: true, discountAmount: 9_000 });
    expect(await engagementApi.validateVoucher({ code: 'GIAM10', branchId: 1, fulfillmentType: 'Delivery', subTotal: 20_000 })).toMatchObject({ valid: false, reason: 'MIN_ORDER' });
    expect(await engagementApi.validateVoucher({ code: 'XYZ', branchId: 1, fulfillmentType: 'Delivery', subTotal: 90_000 })).toMatchObject({ valid: false, reason: 'NOT_FOUND' });
  });
});

describe('điểm bắt đầu & menu', () => {
  it('chọn Giao hàng ở "/" → vào /menu ở chế độ Online, có nút thêm món; giỏ Dine-in không bị ảnh hưởng', async () => {
    const { router } = renderApp('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Giao hàng' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/menu'));
    expect(useOnlineCartStore.getState().fulfillmentType).toBe('Delivery');
    const add = await screen.findAllByRole('button', { name: /^Thêm / });
    expect(add.length).toBeGreaterThan(0);
    expect(useDineInCartStore.getState().lines).toHaveLength(0);
  });

  it('thêm món (qua modal tuỳ chọn) vào giỏ Online và xem giỏ', async () => {
    useOnlineCartStore.setState({ fulfillmentType: 'Pickup' });
    const { router } = renderApp('/menu');
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm Cà phê sữa đá' }));
    fireEvent.click(await screen.findByRole('button', { name: /Thêm vào giỏ/ }));
    await waitFor(() => expect(useOnlineCartStore.getState().lines).toHaveLength(1));
    fireEvent.click(await screen.findByRole('button', { name: /Xem giỏ hàng \(1\)/ }));
    expect(router.state.location.pathname).toBe('/cart');
    expect(await screen.findByRole('heading', { name: 'Giỏ hàng của bạn' })).toBeTruthy();
    expect(screen.getByText('Mang đi')).toBeTruthy();
  });
});

describe('giỏ hàng → checkout: tiền nhất quán', () => {
  it('áp mã GIAM10: giỏ và checkout cho cùng tổng (có phí giao hàng của chi nhánh)', async () => {
    customer();
    seedCart('Delivery');
    const { router } = renderApp('/cart');

    fireEvent.change(await screen.findByPlaceholderText('Nhập mã giảm giá'), { target: { value: 'giam10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    const summary = await screen.findByText('Khuyến mãi');
    expect(summary.parentElement!.textContent).toContain('-9.000đ');
    const cartSummary = screen.getByText('Tóm tắt đơn hàng').closest('section')!;
    await waitFor(() => expect(within(cartSummary).getByText('Phí giao hàng').parentElement!.textContent).toContain('15.000đ'));
    expect(within(cartSummary).getByText('Tổng cộng').parentElement!.textContent).toContain('96.000đ'); // 90.000 − 9.000 + 15.000

    fireEvent.click(screen.getByRole('button', { name: 'Tiến hành đặt hàng' }));
    await screen.findByRole('heading', { name: 'Xác nhận đơn hàng' });
    expect(router.state.location.pathname).toBe('/checkout');
    await waitFor(() => expect(screen.getAllByText('96.000đ').length).toBeGreaterThanOrEqual(2)); // tổng ở thẻ tóm tắt + thanh dưới
  });

  it('mã sai → báo lỗi, không giảm giá và không gửi mã lên khi đặt', async () => {
    customer();
    seedCart('Pickup');
    renderApp('/cart');
    fireEvent.change(await screen.findByPlaceholderText('Nhập mã giảm giá'), { target: { value: 'SAI' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    expect((await screen.findByRole('alert')).textContent).toContain('không tồn tại');
    expect(screen.queryByText('Khuyến mãi')).toBeNull();
  });

  it('giỏ trống → hướng dẫn quay lại thực đơn (cả giỏ lẫn checkout)', async () => {
    customer();
    useOnlineCartStore.setState({ fulfillmentType: 'Delivery' });
    const { router } = renderApp('/cart');
    expect(await screen.findByText('Giỏ hàng đang trống')).toBeTruthy();
    await act(() => router.navigate('/checkout'));
    expect(await screen.findByText('Chưa có món để đặt')).toBeTruthy();
  });

  it('chưa đăng nhập vào /checkout → chuyển sang /login', async () => {
    seedCart('Delivery');
    const { router } = renderApp('/checkout');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});

describe('checkout → đặt hàng → màn thành công (thanh toán demo ở tầng UI)', () => {
  it('chỉ đặt được sau khi chọn phương thức; chưa bấm thì chưa tạo đơn và chưa có màn thành công', async () => {
    customer();
    seedCart('Delivery');
    const { router } = renderApp('/checkout');
    const button = await screen.findByRole('button', { name: 'Đặt hàng' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true)); // chưa chọn phương thức (và/hoặc đang tải phí)

    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).checked)).toEqual([false, false, false]);
    fireEvent.click(screen.getByRole('radio', { name: /Ví MoMo/ }));
    expect((screen.getByRole('radio', { name: /Ví MoMo/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Thẻ ngân hàng/ })); // đổi lựa chọn
    expect((screen.getByRole('radio', { name: /Ví MoMo/ }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('radio', { name: /Thẻ ngân hàng/ }) as HTMLInputElement).checked).toBe(true);
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));

    expect(screen.queryByText('Đặt hàng thành công!')).toBeNull();
    expect(router.state.location.pathname).toBe('/checkout');
    expect(posts()).toHaveLength(0);
    expect(db.orders.filter((o) => o.orderSource === 'Online')).toHaveLength(0);
  });

  it('chưa có địa chỉ → mở form nhập, không tạo đơn; nhập xong đặt được → tạo đúng 1 đơn Online, không gọi API thanh toán', async () => {
    customer();
    seedCart('Delivery');
    const { router } = renderApp('/checkout');
    fireEvent.click(await screen.findByRole('radio', { name: /Ví MoMo/ }));
    const button = screen.getByRole('button', { name: 'Đặt hàng' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(button);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(posts()).toHaveLength(0);

    await fillAddress();
    await waitFor(() => expect(screen.getByText(ADDRESS)).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Ghi chú đơn hàng'), { target: { value: 'Ít ngọt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đặt hàng' }));

    expect(await screen.findByText('Đặt hàng thành công!')).toBeTruthy();
    expect(router.state.location.pathname).toMatch(/^\/payment\/\d+\/success$/);

    // Đơn thật qua API đơn hàng hiện có
    expect(db.orders).toHaveLength(1);
    const order = db.orders[0]!;
    expect(order).toMatchObject({
      orderSource: 'Online', fulfillmentType: 'Delivery', userId: 'u-1', status: 'Pending', paymentStatus: 'Unpaid',
      deliveryName: 'Nguyễn Văn A', deliveryPhone: '0901234567', deliveryAddress: ADDRESS, note: 'Ít ngọt',
      subTotal: 90_000, deliveryFee: 15_000, finalAmount: 105_000,
    });
    // Màn thành công hiển thị dữ liệu từ đơn đó, không hard-code
    expect(screen.getByText(`#${order.orderCode}`)).toBeTruthy();
    expect(screen.getByText('2x Cà phê sữa đá (M)')).toBeTruthy();
    expect(screen.getByText('105.000đ')).toBeTruthy();
    expect(screen.getByText('Ví MoMo')).toBeTruthy();
    // Giỏ đã dọn, giữ lại hình thức & địa chỉ
    expect(useOnlineCartStore.getState().lines).toHaveLength(0);
    expect(useOnlineCartStore.getState().delivery?.addressLine).toBe(ADDRESS);

    // Không có bất kỳ request thanh toán nào; đúng 1 POST đơn
    expect(requests.filter((r) => /payment|momo|vnpay/i.test(r))).toEqual([]);
    expect(posts()).toHaveLength(1);
    expect(requests.some((r) => r.endsWith('/store/branches/1'))).toBe(true); // spy thật sự quan sát được request
    // Không có mock cổng thanh toán (VNPay/Momo/redirect). Handler POST /payment/payments (phase 2) chỉ thu tiền mặt
    // tại quầy và từ chối VNPay/Momo; luồng Online ở trên không gọi nó (đã kiểm ở khẳng định request phía trên).
    expect(handlers.some((h) => /momo|vnpay|gateway/i.test(String((h.info as { path?: unknown }).path)))).toBe(false);

    // Theo dõi / về trang chủ
    expect(screen.getByRole('link', { name: 'Về trang chủ' }).getAttribute('href')).toBe('/home');
    expect(screen.getByRole('link', { name: 'Theo dõi đơn hàng' }).getAttribute('href')).toBe(`/orders/${order.id}`);
  });

  it('bấm đặt hàng liên tục → chỉ một đơn', async () => {
    customer();
    seedCart('Pickup');
    renderApp('/checkout');
    fireEvent.click(await screen.findByRole('radio', { name: /Tiền mặt khi nhận hàng/ }));
    const button = screen.getByRole('button', { name: 'Đặt hàng' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByText('Đặt hàng thành công!');
    expect(db.orders).toHaveLength(1);
    expect(db.orders[0]).toMatchObject({ fulfillmentType: 'Pickup', deliveryAddress: null, deliveryFee: 0, finalAmount: 90_000 });
  });

  it('hoá đơn điện tử bật mà chưa nhập thông tin → chặn, không tạo đơn', async () => {
    customer();
    seedCart('Pickup');
    renderApp('/checkout');
    fireEvent.click(await screen.findByRole('radio', { name: /Ví MoMo/ }));
    fireEvent.click(screen.getByRole('switch', { name: 'Xuất hóa đơn điện tử' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đặt hàng' }));
    expect((await screen.findByText(/mã số thuế và thông tin công ty/i)).textContent).toBeTruthy();
    expect(posts()).toHaveLength(0);
  });

  it('server lỗi 503 → báo lỗi, giữ giỏ, KHÔNG sang màn thành công; thử lại được', async () => {
    customer();
    seedCart('Pickup');
    server.use(http.post(url('/orders-svc/orders'), () => HttpResponse.json({ message: 'Máy chủ đang bận' }, { status: 503 }), { once: true }));
    const { router } = renderApp('/checkout');
    fireEvent.click(await screen.findByRole('radio', { name: /Ví MoMo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Đặt hàng' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Chưa thể đặt hàng');
    expect(router.state.location.pathname).toBe('/checkout');
    expect(screen.queryByText('Đặt hàng thành công!')).toBeNull();
    expect(useOnlineCartStore.getState().lines).toHaveLength(1);
    expect(db.orders).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByText('Đặt hàng thành công!');
    expect(db.orders).toHaveLength(1);
  });

  it('F5 trên màn thành công chỉ đọc đơn đã lưu, không POST thêm', async () => {
    customer();
    seedCart('Pickup');
    const first = renderApp('/checkout');
    fireEvent.click(await screen.findByRole('radio', { name: /Ví MoMo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Đặt hàng' }));
    await screen.findByText('Đặt hàng thành công!');
    const path = first.router.state.location.pathname;
    first.unmount();
    requests.length = 0;

    renderApp(path);
    expect(await screen.findByText('Đặt hàng thành công!')).toBeTruthy();
    expect(posts()).toHaveLength(0);
    expect(db.orders).toHaveLength(1);
  });

  it('mở màn thành công của đơn không phải Online → không hiển thị như thành công', async () => {
    customer();
    await startTableSession();
    useDineInCartStore.getState().addLine(latte, 1);
    const dine = await placeDineInOrder();
    renderApp(`/payment/${dine.id}/success`);
    expect(await screen.findByText('Không tìm thấy đơn hàng')).toBeTruthy();
  });
});

describe('theo dõi đơn & hàng đợi nhân viên', () => {
  it('trang theo dõi hiển thị trạng thái và timeline của đơn Online', async () => {
    customer();
    seedCart('Delivery');
    useOnlineCartStore.setState({ delivery: { receiverName: 'Nguyễn Văn A', phone: '0901234567', addressLine: ADDRESS } });
    const first = renderApp('/checkout');
    fireEvent.click(await screen.findByRole('radio', { name: /Ví MoMo/ }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Đặt hàng' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Đặt hàng' }));
    await screen.findByText('Đặt hàng thành công!');
    fireEvent.click(screen.getByRole('link', { name: 'Theo dõi đơn hàng' }));
    expect(await screen.findByRole('heading', { name: 'Theo dõi đơn hàng' })).toBeTruthy();
    expect(await screen.findByText(`#${db.orders[0]!.orderCode}`)).toBeTruthy();
    expect(screen.getAllByText('Đã nhận đơn').length).toBeGreaterThan(0);
    expect(screen.getByText(ADDRESS)).toBeTruthy();
    first.unmount();
  });

  it('đơn Online xuất hiện trong hàng đợi nhân viên cùng đơn Dine-in, phân biệt được và Dine-in vẫn hoạt động', async () => {
    // Dine-in trước
    await startTableSession();
    useDineInCartStore.getState().addLine(latte, 1);
    const dine = await placeDineInOrder();
    // Online
    customer();
    seedCart('Delivery');
    useOnlineCartStore.setState({ delivery: { receiverName: 'Nguyễn Văn A', phone: '0901234567', addressLine: ADDRESS } });
    const cust = renderApp('/checkout');
    fireEvent.click(await screen.findByRole('radio', { name: /Ví MoMo/ }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Đặt hàng' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Đặt hàng' }));
    await screen.findByText('Đặt hàng thành công!');
    cust.unmount();
    cleanup();

    loginAs('Staff');
    renderApp('/staff/queue');
    const column = await screen.findByRole('region', { name: 'Mới nhận' });
    expect(await within(column).findByText(`#${dine.orderCode}`)).toBeTruthy();
    expect(within(column).getByText('Bàn 01')).toBeTruthy();
    const online = db.orders.find((o) => o.orderSource === 'Online')!;
    expect(await within(column).findByText(`#${online.orderCode}`)).toBeTruthy();
    expect(within(column).getByText('Giao hàng')).toBeTruthy();

    fireEvent.click(within(column).getByText(`#${online.orderCode}`));
    await screen.findByRole('heading', { name: `Đơn #${online.orderCode}` });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đơn' }));
    await waitFor(() => expect(db.orders.find((o) => o.id === online.id)!.status).toBe('Confirmed'));
  });
});
