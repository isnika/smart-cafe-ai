// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { computeDayStats } from '@/features/staff-dashboard/stats';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { MOCK_PASSWORD, resetAuthMock } from '@/mocks/handlers/identity';
import { seedDemoOrders } from '@/mocks/seed';
import { url } from '@/mocks/utils';
import { configureHttp, identityApi } from '@/shared/api';
import { formatVnd } from '@/shared/lib';
import { resetWorld } from '@/test/helpers';
import { polyfillDialog, renderApp } from '@/test/renderApp';
import { averageOrderValue, cancelRate, formatPercent } from './model';

const server = setupServer(...handlers);
beforeAll(() => {
  server.listen();
  polyfillDialog();
  configureHttp({ getToken: () => useAuthStore.getState().accessToken });
});
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
});
beforeEach(async () => {
  // Chỉ đóng băng Date (không đụng timer) ở 12:00 trưa: đơn seed (tạo 3–200 phút trước) luôn rơi vào cùng một ngày,
  // nên test không phụ thuộc giờ chạy (vd. ngay sau nửa đêm).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 30, 12, 0, 0));
  resetWorld();
  seedDemoOrders(); // DB test mặc định không có đơn; dùng đúng bộ đơn demo mà app chạy trong trình duyệt
  resetAuthMock();
  // Đăng nhập Manager THẬT qua mock identity để token được handler đơn/kho chấp nhận.
  const session = await identityApi.login({ identifier: 'manager@smartcafe.vn', password: MOCK_PASSWORD });
  useAuthStore.getState().applySession(session);
});

const kpi = (label: string) => screen.getByRole('group', { name: label });
const stockCard = () => screen.getByRole('heading', { name: 'Cảnh báo kho' }).parentElement as HTMLElement;

describe('/manager', () => {
  it('thẻ KPI khớp computeDayStats(db.orders) và các hàm tính thêm', async () => {
    renderApp('/manager');
    const stats = computeDayStats(db.orders, Date.now());
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.collectedOrders).toBeGreaterThan(0);

    expect(await within(await screen.findByRole('group', { name: 'Số đơn hôm nay' })).findByText(String(stats.total))).toBeTruthy();
    expect(within(kpi('Doanh thu đã thu hôm nay')).getByText(formatVnd(stats.collectedAmount))).toBeTruthy();
    expect(within(kpi('Doanh thu đã thu hôm nay')).getByText(/chỉ tính đơn đã thanh toán, chưa trừ hoàn tiền một phần/i)).toBeTruthy();
    expect(within(kpi('Giá trị TB/đơn')).getByText(formatVnd(averageOrderValue(stats)))).toBeTruthy();
    expect(within(kpi('Tỉ lệ huỷ/từ chối')).getByText(formatPercent(cancelRate(db.orders, Date.now())))).toBeTruthy();
  });

  it('biểu đồ doanh thu theo giờ và cơ cấu đơn hiển thị đủ', async () => {
    renderApp('/manager');
    const chart = await screen.findByRole('img', { name: /Doanh thu đã thu theo giờ hôm nay: tổng/ });
    expect(chart.querySelectorAll('title').length).toBe(24);
    expect(screen.getByRole('heading', { name: 'Doanh thu theo giờ hôm nay' })).toBeTruthy();

    const mixCard = screen.getByRole('heading', { name: 'Cơ cấu đơn hôm nay' }).parentElement as HTMLElement;
    for (const label of ['Tại bàn', 'Mang đi', 'Giao hàng', 'QR', 'POS', 'Online']) {
      expect(await within(mixCard).findByText(label)).toBeTruthy();
    }
  });

  it('card cảnh báo kho khớp seed: 1 hết + 3 sắp hết, Hết hàng lên trước', async () => {
    renderApp('/manager');
    const items = await within(stockCard()).findAllByRole('listitem');
    expect(items.map((li) => li.querySelector('p')?.textContent)).toEqual(['Trân châu đen', 'Cà phê hạt Arabica', 'Sữa đặc', 'Bột kem béo']);
    expect(within(items[0]).getByText('Hết hàng')).toBeTruthy();
    for (const li of items.slice(1)) expect(within(li).getByText('Sắp hết')).toBeTruthy();
    expect(within(items[1]).getByText(/Khả dụng 800 \/ ngưỡng 3\.000 g/)).toBeTruthy();

    expect(within(kpi('Nguyên liệu cần nhập')).getByText('4')).toBeTruthy();
    expect(within(kpi('Nguyên liệu cần nhập')).getByText('1 hết hàng')).toBeTruthy();
    expect(within(stockCard()).getByRole('link', { name: 'Xem kho' }).getAttribute('href')).toBe('/manager/inventory');
  });

  it('kho không có hàng cần nhập → "Kho đang ổn"', async () => {
    server.use(http.get(url('/inventory/stock'), () => HttpResponse.json([])));
    renderApp('/manager');
    expect(await within(stockCard()).findByText('Chưa có nguyên liệu nào trong kho')).toBeTruthy();

    server.use(
      http.get(url('/inventory/stock'), () =>
        HttpResponse.json([
          { id: 1, branchId: 1, ingredientId: 1, quantityInStock: 900, reservedQuantity: 0, reorderLevel: 100, averageCost: 1, version: 1, updatedAt: '2026-10-30T05:00:00Z', ingredientName: 'Đường', unit: 'g', available: 900, isLow: false },
        ]),
      ),
    );
    cleanup();
    renderApp('/manager');
    expect(await within(stockCard()).findByText('Kho đang ổn')).toBeTruthy();
  });

  it('orders lỗi: vẫn thấy card kho, các section đơn có nút "Thử lại" và tải lại được', async () => {
    let fail = true;
    server.use(
      http.get(url('/orders-svc/orders'), () => (fail ? HttpResponse.json({ message: 'Máy chủ bận', code: 'SERVER_BUSY' }, { status: 503 }) : undefined)),
    );
    renderApp('/manager');

    const retries = await screen.findAllByRole('button', { name: 'Thử lại' });
    expect(retries).toHaveLength(2); // biểu đồ + cơ cấu đơn
    expect(screen.getAllByText('Không tải được dữ liệu đơn hàng')).toHaveLength(2);
    // Kho độc lập với đơn: vẫn đầy đủ
    expect(await within(stockCard()).findByText('Trân châu đen')).toBeTruthy();
    expect(within(kpi('Nguyên liệu cần nhập')).getByText('4')).toBeTruthy();

    fail = false;
    fireEvent.click(retries[0]);
    expect(await screen.findByRole('img', { name: /Doanh thu đã thu theo giờ hôm nay/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('kho lỗi: đơn vẫn hiển thị, card kho có nút "Thử lại"', async () => {
    server.use(http.get(url('/inventory/stock'), () => HttpResponse.json({ message: 'Kho bận', code: 'SERVER_BUSY' }, { status: 503 })));
    renderApp('/manager');
    expect(await within(stockCard()).findByText('Không tải được dữ liệu kho')).toBeTruthy();
    expect(within(stockCard()).getByRole('button', { name: 'Thử lại' })).toBeTruthy();
    expect(await screen.findByRole('img', { name: /Doanh thu đã thu theo giờ hôm nay/ })).toBeTruthy();
    expect(within(kpi('Số đơn hôm nay')).getByText(String(computeDayStats(db.orders, Date.now()).total))).toBeTruthy();
  });

  it('không có đơn nào → "Chưa có đơn nào hôm nay", KPI về 0 và kho vẫn hiển thị', async () => {
    server.use(http.get(url('/orders-svc/orders'), () => HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 100 })));
    renderApp('/manager');
    expect(await screen.findAllByText('Chưa có đơn nào hôm nay')).toHaveLength(2);
    expect(within(kpi('Số đơn hôm nay')).getByText('0')).toBeTruthy();
    expect(within(kpi('Tỉ lệ huỷ/từ chối')).getByText('0%')).toBeTruthy();
    expect(within(kpi('Giá trị TB/đơn')).getByText(formatVnd(0))).toBeTruthy();
    expect(await within(stockCard()).findByText('Trân châu đen')).toBeTruthy();
  });

  it('branchId null: card kho báo chưa gán chi nhánh, không gọi API kho, phần đơn vẫn chạy', async () => {
    useAuthStore.setState({ branchId: null });
    let stockCalls = 0;
    server.use(
      http.get(url('/inventory/stock'), () => {
        stockCalls += 1;
        return HttpResponse.json([]);
      }),
    );
    renderApp('/manager');

    expect(await within(stockCard()).findByText('Tài khoản chưa được gán chi nhánh')).toBeTruthy();
    expect(await screen.findByRole('img', { name: /Doanh thu đã thu theo giờ hôm nay/ })).toBeTruthy();
    expect(within(kpi('Nguyên liệu cần nhập')).getByText('—')).toBeTruthy();
    await waitFor(() => expect(within(kpi('Số đơn hôm nay')).getByText(String(computeDayStats(db.orders, Date.now()).total))).toBeTruthy());
    expect(stockCalls).toBe(0);
  });

  it('đơn bị cắt (total > items) → ghi chú chưa có API thống kê', async () => {
    const real = db.orders.slice(0, 3);
    server.use(http.get(url('/orders-svc/orders'), () => HttpResponse.json({ items: real, total: 250, page: 1, pageSize: 100 })));
    renderApp('/manager');
    expect(await screen.findByText(/hệ thống có 250 đơn/)).toBeTruthy();
  });
});
