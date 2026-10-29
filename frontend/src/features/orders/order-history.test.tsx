// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { useOnlineCartStore } from '@/features/online-order/store';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { resetAuthMock } from '@/mocks/handlers/identity';
import { seedDemoOrders } from '@/mocks/seed';
import { mockConfig, url } from '@/mocks/utils';
import { configureHttp } from '@/shared/api/http';
import { resetWorld } from '@/test/helpers';
import { polyfillDialog, renderApp } from '@/test/renderApp';
import { orderSummary, orderTimeLabel } from './format';

const server = setupServer(...handlers);
beforeAll(() => {
  server.listen();
  polyfillDialog();
  // Giống main.tsx: gắn token của auth store vào http client.
  configureHttp({ getToken: () => useAuthStore.getState().accessToken, onUnauthorized: () => useAuthStore.getState().clear() });
});
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
beforeEach(() => {
  resetWorld();
  resetAuthMock();
  seedDemoOrders();
  useOnlineCartStore.setState({ fulfillmentType: null, lines: [], voucherCode: null, delivery: null });
});

const signIn = (email: string) => useAuthStore.getState().login({ identifier: email, password: '123456' });
const ownOrders = (userId: string) => db.orders.filter((o) => o.userId === userId);
const codesOnScreen = () => screen.queryAllByRole('article').map((el) => el.getAttribute('aria-label'));

describe('/orders — lịch sử đơn hàng', () => {
  it('hiển thị đúng và chỉ đơn của khách đang đăng nhập (mã, trạng thái, tổng tiền, số sản phẩm)', async () => {
    await signIn('customer@smartcafe.vn');
    renderApp('/orders');

    expect(screen.getByLabelText('Đang tải đơn hàng')).toBeTruthy();
    const cards = await screen.findAllByRole('article');
    const mine = ownOrders('u-customer');
    const others = ownOrders('u-customer2');
    expect(cards).toHaveLength(mine.length);
    for (const o of mine) expect(codesOnScreen()).toContain(`Đơn #${o.orderCode}`);
    for (const o of others) expect(codesOnScreen()).not.toContain(`Đơn #${o.orderCode}`);

    const completed = mine.find((o) => o.status === 'Completed')!;
    const card = screen.getByRole('article', { name: `Đơn #${completed.orderCode}` });
    expect(within(card).getByText('Hoàn tất')).toBeTruthy();
    expect(card.textContent).toContain(orderSummary(completed));
    expect(card.textContent).toContain(`${completed.items.reduce((n, i) => n + i.quantity, 0)} sản phẩm`);
    expect(card.textContent).toMatch(/\d\.\d{3}đ/);
  });

  it('khách khác đăng nhập thì thấy đơn của họ, không lẫn đơn của khách trước', async () => {
    await signIn('customer2@smartcafe.vn');
    renderApp('/orders');
    await screen.findAllByRole('article');
    expect(codesOnScreen().sort()).toEqual(ownOrders('u-customer2').map((o) => `Đơn #${o.orderCode}`).sort());
  });

  it('tab Hoàn tất / Đã huỷ lọc theo trạng thái', async () => {
    await signIn('customer@smartcafe.vn');
    renderApp('/orders');
    await screen.findAllByRole('article');
    const mine = ownOrders('u-customer');

    fireEvent.click(screen.getByRole('tab', { name: 'Hoàn tất' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(mine.filter((o) => o.status === 'Completed').length));
    expect(screen.getAllByRole('article').every((a) => within(a).queryByText('Hoàn tất'))).toBe(true);

    fireEvent.click(screen.getByRole('tab', { name: 'Đã huỷ' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(mine.filter((o) => ['Cancelled', 'Rejected'].includes(o.status)).length));
    expect(screen.getAllByRole('article').every((a) => within(a).queryByText('Đã huỷ'))).toBe(true);
  });

  it('thẻ đơn dẫn tới trang theo dõi đơn đã có', async () => {
    await signIn('customer@smartcafe.vn');
    const { router } = renderApp('/orders');
    const order = ownOrders('u-customer')[0]!;
    fireEvent.click(await screen.findByRole('link', { name: `Xem chi tiết đơn #${order.orderCode}` }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/orders/${order.id}`));
  });

  it('"Đặt lại" đưa món của đơn cũ vào giỏ Online và mở giỏ hàng', async () => {
    await signIn('customer@smartcafe.vn');
    const { router } = renderApp('/orders');
    const order = ownOrders('u-customer').find((o) => o.status === 'Completed')!;
    const card = await screen.findByRole('article', { name: `Đơn #${order.orderCode}` });
    fireEvent.click(within(card).getByRole('button', { name: 'Đặt lại' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/cart'));
    const cart = useOnlineCartStore.getState();
    expect(cart.fulfillmentType).toBe(order.fulfillmentType === 'Delivery' ? 'Delivery' : 'Pickup');
    expect(cart.lines.map((l) => [l.variantId, l.quantity])).toEqual(order.items.map((i) => [i.variantId, i.quantity]));
  });

  it('danh sách trống → thông báo và nút về thực đơn / trang chủ', async () => {
    await signIn('customer2@smartcafe.vn');
    db.orders.splice(0, db.orders.length, ...db.orders.filter((o) => o.userId !== 'u-customer2'));
    renderApp('/orders');
    expect(await screen.findByText('Bạn chưa có đơn hàng nào.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem thực đơn' }).getAttribute('href')).toBe('/menu');
    expect(screen.getByRole('link', { name: 'Về trang chủ' }).getAttribute('href')).toBe('/home');
  });

  it('lỗi tải → báo lỗi và Thử lại tải được dữ liệu', async () => {
    await signIn('customer@smartcafe.vn');
    server.use(http.get(url('/orders-svc/orders'), () => HttpResponse.json({ message: 'Máy chủ lỗi' }, { status: 500 }), { once: true }));
    renderApp('/orders');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Không tải được đơn hàng');
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect((await screen.findAllByRole('article')).length).toBe(ownOrders('u-customer').length);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('chưa đăng nhập → chuyển về /login, không gọi API đơn hàng', async () => {
    let called = false;
    server.use(http.get(url('/orders-svc/orders'), () => { called = true; return HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 20 }); }));
    mockConfig.enforceAuth = true;
    const { router } = renderApp('/orders');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(called).toBe(false);
  });

  it('phiên hết hạn (401) → bị đưa về /login thay vì hiện dữ liệu cũ', async () => {
    await signIn('customer@smartcafe.vn');
    server.use(http.get(url('/orders-svc/orders'), () => HttpResponse.json({ message: 'Hết phiên', code: 'UNAUTHORIZED' }, { status: 401 })));
    const { router } = renderApp('/orders');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('nhân viên vào /orders bị đưa về trang của nhân viên (RequireRole)', async () => {
    await signIn('staff@smartcafe.vn');
    const { router } = renderApp('/orders');
    await waitFor(() => expect(router.state.location.pathname).toBe('/staff'));
  });
});

describe('định dạng hiển thị', () => {
  const now = new Date(2026, 9, 26, 15, 0, 0); // 26/10/2026 15:00 giờ máy
  const iso = (d: Date) => d.toISOString();

  it('Hôm nay / Hôm qua / ngày cũ', () => {
    expect(orderTimeLabel(iso(new Date(2026, 9, 26, 9, 5)), now)).toBe('Hôm nay, 09:05');
    expect(orderTimeLabel(iso(new Date(2026, 9, 25, 14, 25)), now)).toBe('Hôm qua, 14:25');
    expect(orderTimeLabel(iso(new Date(2026, 9, 12, 8, 30)), now)).toBe('12 Tháng 10, 08:30');
    expect(orderTimeLabel(iso(new Date(2025, 11, 31, 23, 59)), now)).toBe('31 Tháng 12, 2025, 23:59');
    expect(orderTimeLabel('rác', now)).toBe('—');
  });

  it('tóm tắt món: một món / nhiều món', () => {
    const item = (productName: string) => ({ productName }) as never;
    expect(orderSummary({ items: [item('Cà phê sữa đá')] })).toBe('Cà phê sữa đá');
    expect(orderSummary({ items: [item('Cà phê sữa đá'), item('Croissant')] })).toBe('Cà phê sữa đá và 1 món khác');
    expect(orderSummary({ items: [] })).toBe('Không có món');
  });
});
