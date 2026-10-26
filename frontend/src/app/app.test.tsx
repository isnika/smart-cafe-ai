// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useDineInCartStore } from '@/features/dine-in/store';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { mockConfig, url } from '@/mocks/utils';
import { catalogApi } from '@/shared/api';
import { latte, loginAs, resetWorld, TABLE_CODE } from '@/test/helpers';
import { polyfillDialog, renderApp } from '@/test/renderApp';

const server = setupServer(...handlers);
beforeAll(() => {
  server.listen();
  polyfillDialog();
});
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
beforeEach(resetWorld);

const hrefs = () => screen.queryAllByRole('link').map((a) => a.getAttribute('href') ?? '');

describe('Home page (/home) – khách vãng lai', () => {
  it('hiển thị không cần đăng nhập, có header, hero, món từ catalog API, hướng dẫn gọi món', async () => {
    const menu = await catalogApi.listProducts({ branchId: 1 });
    const { router } = renderApp('/home');

    expect(await screen.findByRole('heading', { level: 1, name: /Một ly ngon/ })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/home'); // không bị chuyển sang /login
    const loginLinks = screen.getAllByRole('link', { name: 'Đăng nhập' }); // header + footer
    expect(loginLinks.length).toBeGreaterThan(0);
    expect(loginLinks.every((a) => a.getAttribute('href') === '/login')).toBe(true);
    expect(await screen.findByText(menu[0]!.name)).toBeTruthy(); // dữ liệu thật từ MSW, không hard-code
    expect(screen.getByRole('heading', { name: 'Gọi món tại bàn' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Trải nghiệm/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Đăng xuất/ })).toBeNull();
  });

  it('chip danh mục (lấy từ API) lọc danh sách món', async () => {
    renderApp('/home');
    const group = await screen.findByRole('group', { name: 'Danh mục món' });
    await screen.findAllByRole('article');
    fireEvent.click(within(group).getByRole('button', { name: 'Bánh ngọt' }));
    await waitFor(() => {
      const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
      expect(names.some((n) => /croissant/i.test(n ?? ''))).toBe(true);
      expect(names.some((n) => /Cà phê sữa đá/.test(n ?? ''))).toBe(false);
    });
  });

  it('trạng thái loading → lỗi (có Thử lại) → empty', async () => {
    mockConfig.latencyMs = 20;
    server.use(http.get(url('/catalog/products'), () => HttpResponse.json({ message: 'Máy chủ lỗi' }, { status: 500 })));
    renderApp('/home');
    expect(screen.getByLabelText('Đang tải thực đơn')).toBeTruthy();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Không tải được thực đơn');
    expect(within(alert).getByRole('button', { name: 'Thử lại' })).toBeTruthy();
    cleanup();

    server.use(http.get(url('/catalog/products'), () => HttpResponse.json([])));
    renderApp('/home');
    expect(await screen.findByText('Danh mục này hiện chưa có món để hiển thị.')).toBeTruthy();
  });

  it('CTA điều hướng đúng route và không có link tới bàn giả', async () => {
    const { router } = renderApp('/home');
    await screen.findAllByRole('article');
    expect(hrefs().some((h) => h.startsWith('/dine-in'))).toBe(false);
    expect(screen.getAllByRole('link', { name: /Đặt món/ })[0]!.getAttribute('href')).toBe('/');
    expect(screen.getAllByRole('link', { name: 'Xem thực đơn' })[0]!.getAttribute('href')).toBe('/menu');
    await act(() => router.navigate('/menu'));
    expect(await screen.findByRole('heading', { name: 'Thực đơn' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Thêm / })).toBeNull(); // menu công khai chỉ để xem
  });
});

describe('Chọn hình thức đặt món (/)', () => {
  it('hiển thị, Giao hàng/Mang đi dùng được (mở luồng Online), không có link bàn giả', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Bạn muốn đặt món thế nào?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Giao hàng' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Mang đi' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('link', { name: 'Xem menu trước' }).getAttribute('href')).toBe('/home');
    expect(hrefs().some((h) => h.startsWith('/dine-in'))).toBe(false);
  });

  it('nhập mã bàn sai → báo lỗi từ server, không điều hướng; mã đúng → vào /dine-in/table/:code', async () => {
    const { router } = renderApp('/');
    fireEvent.click(screen.getByRole('button', { name: 'Nhập mã bàn' }));
    const input = await screen.findByLabelText('Mã bàn');

    fireEvent.change(input, { target: { value: 'QR-KHONG-CO' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vào bàn' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/không hợp lệ/i);
    expect(router.state.location.pathname).toBe('/');

    fireEvent.change(input, { target: { value: TABLE_CODE } });
    fireEvent.click(screen.getByRole('button', { name: 'Vào bàn' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/dine-in/table/${TABLE_CODE}`));
    expect(await screen.findByText('Smart Cafe QR Ordering')).toBeTruthy();
  });
});

describe('Các route cũ vẫn hoạt động', () => {
  it('/dine-in/table/:code mở menu bàn; /login hiển thị form đăng nhập', async () => {
    renderApp(`/dine-in/table/${TABLE_CODE}`);
    expect(await screen.findByText('Smart Cafe QR Ordering')).toBeTruthy();
    cleanup();
    renderApp('/login');
    expect((await screen.findAllByText('Đăng nhập')).length).toBeGreaterThan(0);
  });

  it('/staff/queue khi chưa đăng nhập vẫn chuyển về /login', async () => {
    const { router } = renderApp('/staff/queue');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});

describe('Checkout → xác nhận (Dine-in)', () => {
  async function arrive() {
    const r = renderApp(`/dine-in/table/${TABLE_CODE}`);
    await screen.findByText('Smart Cafe QR Ordering');
    await waitFor(() => expect(useDineInCartStore.getState().tableSessionId).not.toBeNull());
    act(() => useDineInCartStore.getState().addLine(latte, 2));
    await act(() => r.router.navigate('/dine-in/checkout'));
    return r;
  }

  it('đặt thành công: loading → màn xác nhận (mã đơn, QR, món) → giỏ trống → F5 không tạo đơn mới', async () => {
    mockConfig.latencyMs = 60;
    const { router, unmount } = await arrive();
    const btn = await screen.findByRole('button', { name: 'Xác nhận đặt món' });
    fireEvent.click(btn);
    fireEvent.click(btn); // bấm đúp
    await waitFor(() => expect(screen.getByRole('button', { name: /Đang gửi đơn/ }).getAttribute('aria-busy')).toBe('true'));

    expect(await screen.findByText('#SC00001')).toBeTruthy();
    expect(router.state.location.pathname).toMatch(/^\/dine-in\/pay\/counter\/\d+$/);
    expect(screen.getByRole('img', { name: /Mã QR của đơn SC00001/ })).toBeTruthy();
    expect(screen.getByText(/Cà phê sữa đá/)).toBeTruthy();
    expect(screen.getByText('Bàn 01', { exact: false })).toBeTruthy();
    expect(db.orders).toHaveLength(1);
    expect(useDineInCartStore.getState().lines).toEqual([]);
    expect(screen.queryByText(/theo dõi/i)).toBeNull(); // không có tracking cho khách

    // F5: dựng lại app tại đúng URL xác nhận → chỉ đọc đơn đã lưu, không POST
    const path = router.state.location.pathname;
    unmount();
    renderApp(path);
    expect(await screen.findByText('#SC00001')).toBeTruthy();
    expect(db.orders).toHaveLength(1);
  });

  it('API lỗi: hiện lỗi + thử lại, giỏ không bị xoá, không có đơn', async () => {
    server.use(http.post(url('/orders-svc/orders'), () => HttpResponse.json({ message: 'Máy chủ đang bận' }, { status: 503 }), { once: true }));
    const { router } = await arrive();
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận đặt món' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Máy chủ đang bận');
    expect(useDineInCartStore.getState().lines).toHaveLength(1);
    expect(db.orders).toHaveLength(0);
    expect(router.state.location.pathname).toBe('/dine-in/checkout');

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' })); // lần sau server trả bình thường
    expect(await screen.findByText('#SC00001')).toBeTruthy();
    expect(db.orders).toHaveLength(1);
  });

  it('giỏ rỗng: không cho đặt', async () => {
    renderApp('/dine-in/checkout');
    expect(await screen.findByText('Chưa có món để đặt')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xác nhận đặt món' })).toBeNull();
    expect(db.orders).toHaveLength(0);
  });
});

describe('Luồng đầy đủ: Home → bàn → đặt món → xác nhận → hàng đợi nhân viên', () => {
  it('đơn khách đặt hiện trong staff queue, mở được chi tiết và nhân viên xác nhận đơn', async () => {
    const { router, unmount } = renderApp('/home');
    await screen.findAllByRole('article');
    await act(() => router.navigate('/'));
    fireEvent.click(screen.getByRole('button', { name: 'Nhập mã bàn' }));
    fireEvent.change(await screen.findByLabelText('Mã bàn'), { target: { value: TABLE_CODE } });
    fireEvent.click(screen.getByRole('button', { name: 'Vào bàn' }));
    await screen.findByText('Smart Cafe QR Ordering');
    await waitFor(() => expect(useDineInCartStore.getState().tableSessionId).not.toBeNull());
    act(() => useDineInCartStore.getState().addLine(latte, 1));
    await act(() => router.navigate('/cart'));
    fireEvent.click(await screen.findByRole('button', { name: 'Tiến hành đặt hàng' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận đặt món' }));
    await screen.findByText('#SC00001');
    unmount();

    // Nhân viên đăng nhập và mở hàng đợi
    loginAs('Staff');
    const staff = renderApp('/staff/queue');
    const column = await screen.findByRole('region', { name: 'Mới nhận' });
    expect(await within(column).findByText('#SC00001')).toBeTruthy();
    expect(within(column).getByText('Bàn 01')).toBeTruthy();
    expect(within(column).getByText('1 món')).toBeTruthy();

    fireEvent.click(within(column).getByText('#SC00001'));
    await screen.findByRole('heading', { name: 'Đơn #SC00001' });
    expect(screen.getByText(/Cà phê sữa đá/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đơn' }));
    await waitFor(() => expect(db.orders[0]!.status).toBe('Confirmed'));
    expect(staff.router.state.location.pathname).toMatch(/^\/staff\/orders\/\d+$/);
  });
});
