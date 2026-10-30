// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { seedDemoOrders } from '@/mocks/seed';
import { url } from '@/mocks/utils';
import { loginAs, resetWorld } from '@/test/helpers';
import { polyfillDialog, renderApp } from '@/test/renderApp';
import { formatVnd } from '@/shared/lib';
import { computeDayStats } from '@/features/staff-dashboard/stats';
import { cashierGroup } from './model';

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
beforeEach(() => {
  resetWorld();
  seedDemoOrders();
  loginAs('Staff');
});

const code = (id: number) => db.orders.find((o) => o.id === id)!.orderCode;
const awaiting = () => db.orders.filter((o) => cashierGroup(o) === 'awaiting_counter');
const paidOnline = () => db.orders.filter((o) => cashierGroup(o) === 'paid_online');

describe('/staff — Dashboard', () => {
  it('Staff mở được Dashboard: thẻ thống kê khớp dữ liệu đơn, mặc định tab Tổng quan', async () => {
    renderApp('/staff');
    const total = await screen.findByRole('group', { name: 'Tổng đơn hôm nay' });
    expect(within(total).getByText(String(computeDayStats(db.orders, Date.now()).total))).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Tổng quan ca', selected: true })).toBeTruthy();
    expect(screen.getByText(/đơn đang chờ thu tại quầy/)).toBeTruthy();
  });

  it('lỗi tải thống kê → có thông báo và Thử lại', async () => {
    server.use(http.get(url('/orders-svc/orders'), () => HttpResponse.json({ message: 'Máy chủ lỗi' }, { status: 500 })));
    renderApp('/staff');
    expect((await screen.findByRole('alert')).textContent).toContain('Máy chủ lỗi');
    server.resetHandlers();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('group', { name: 'Đang xử lý' })).toBeTruthy();
  });

  it('chuyển sang Thu ngân bằng tab và bằng link ?tab=cashier', async () => {
    const { router } = renderApp('/staff');
    fireEvent.click(await screen.findByRole('tab', { name: 'Thu ngân' }));
    expect(router.state.location.search).toBe('?tab=cashier');
    expect(await screen.findByRole('region', { name: 'Chờ thu tại quầy' })).toBeTruthy();
    cleanup();
    renderApp('/staff?tab=cashier');
    expect(await screen.findByRole('tab', { name: 'Thu ngân', selected: true })).toBeTruthy();
  });

  it('role guard: khách bị chuyển khỏi /staff, chưa đăng nhập về /login', async () => {
    loginAs('Customer');
    const a = renderApp('/staff?tab=cashier');
    await waitFor(() => expect(a.router.state.location.pathname).toBe('/home'));
    cleanup();
    resetWorld();
    const b = renderApp('/staff');
    await waitFor(() => expect(b.router.state.location.pathname).toBe('/login'));
  });
});

describe('Tab Thu ngân', () => {
  it('phân biệt đơn chờ thu tại quầy và đơn đã trả online, đúng theo dữ liệu', async () => {
    renderApp('/staff?tab=cashier');
    const wait = await screen.findByRole('region', { name: 'Chờ thu tại quầy' });
    const online = screen.getByRole('region', { name: 'Đã trả online' });
    expect(within(wait).getAllByRole('button')).toHaveLength(awaiting().length);
    expect(within(online).getAllByRole('button')).toHaveLength(paidOnline().length);
    for (const o of awaiting()) expect(within(wait).getByText(new RegExp(`#${o.orderCode}`))).toBeTruthy();
    for (const o of paidOnline()) expect(within(online).getByText(new RegExp(`#${o.orderCode}`))).toBeTruthy();
    // Đơn Online đang chờ cổng thanh toán không bị suy diễn là đã trả
    expect(screen.queryByText(new RegExp(`#${code(10)}`))).toBeNull();
  });

  it('tìm theo mã đơn: không phân biệt hoa thường, bỏ khoảng trắng; không khớp → empty state', async () => {
    renderApp('/staff?tab=cashier');
    await screen.findByRole('region', { name: 'Chờ thu tại quầy' });
    const box = screen.getByLabelText('Tìm theo mã đơn / số bàn');

    fireEvent.change(box, { target: { value: `  ${code(6).toLowerCase()}  ` } });
    const hits = screen.getAllByRole('button', { name: /^Mở hóa đơn/ });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.textContent).toContain(`#${code(6)}`);

    fireEvent.change(box, { target: { value: 'KHONGCO' } });
    expect(await screen.findByText(/Không có đơn nào khớp/)).toBeTruthy();
  });

  it('bộ lọc trạng thái kết hợp với tìm kiếm', async () => {
    renderApp('/staff?tab=cashier');
    await screen.findByRole('region', { name: 'Chờ thu tại quầy' });
    fireEvent.click(screen.getByRole('button', { name: /Đã trả online \(/ }));
    expect(screen.queryByRole('region', { name: 'Chờ thu tại quầy' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Mở hóa đơn/ })).toHaveLength(paidOnline().length);
  });

  it('Bill Modal: hiện đủ món/giá/tổng, đóng modal không đổi trạng thái thanh toán, nút thu bị khoá cho tới khi nhập đủ tiền khách đưa', async () => {
    renderApp('/staff?tab=cashier');
    const target = db.orders.find((o) => o.id === 1)!;
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Mở hóa đơn #${target.orderCode}`) }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(`Đơn #${target.orderCode}`)).toBeTruthy();
    expect(within(dialog).getByText('Tổng thanh toán')).toBeTruthy();
    expect(within(dialog).getAllByText(formatVnd(target.finalAmount)).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(target.items[0]!.productName)).toBeTruthy();
    expect(within(dialog).getByText('Chưa thanh toán')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Xác nhận đã thu' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(db.orders.find((o) => o.id === 1)!.paymentStatus).toBe('Unpaid');
  });

  it('đơn đã trả online: modal không có nút thu tiền', async () => {
    renderApp('/staff?tab=cashier');
    const target = paidOnline()[0]!;
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Mở hóa đơn #${target.orderCode}`) }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Đã thanh toán')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Xác nhận đã thu' })).toBeNull();
    expect(within(dialog).getByText(/không thu lại/)).toBeTruthy();
  });

  it('lỗi tải → thông báo + Thử lại; tải lại thành công', async () => {
    server.use(http.get(url('/orders-svc/orders'), () => HttpResponse.json({ message: 'Máy chủ lỗi' }, { status: 500 })));
    renderApp('/staff?tab=cashier');
    expect((await screen.findByRole('alert')).textContent).toContain('Máy chủ lỗi');
    server.resetHandlers();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('region', { name: 'Chờ thu tại quầy' })).toBeTruthy();
  });

  it('empty state khi không có đơn nào', async () => {
    db.orders.length = 0;
    renderApp('/staff?tab=cashier');
    expect(await screen.findByText('Không có đơn nào đang chờ thu tại quầy.')).toBeTruthy();
    expect(screen.getByText('Chưa có đơn trả online nào đang mở.')).toBeTruthy();
  });
});
