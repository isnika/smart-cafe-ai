// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { ConsumptionChart } from '@/features/manager-inventory/components/ConsumptionChart';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { MOCK_PASSWORD, resetAuthMock } from '@/mocks/handlers/identity';
import { url } from '@/mocks/utils';
import { configureHttp, identityApi } from '@/shared/api';
import { resetWorld } from '@/test/helpers';
import { polyfillDialog, renderApp } from '@/test/renderApp';
import { addDays, toIsoDate } from './model';

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
});
beforeEach(async () => {
  resetWorld();
  resetAuthMock();
  const session = await identityApi.login({ identifier: 'manager@smartcafe.vn', password: MOCK_PASSWORD });
  useAuthStore.getState().applySession(session);
});

const today = () => toIsoDate(new Date());
const pathD = (testId: string) => (screen.getByTestId(testId) as unknown as SVGPathElement).getAttribute('d') ?? '';
const rowsOf = (type: string, targetId?: number) =>
  db.forecasts.filter((f) => f.isLatest && f.forecastType === type && (targetId === undefined || f.targetId === targetId));

describe('/manager/forecast', () => {
  it('hiển thị biểu đồ doanh thu (thực tế vs dự báo), độ chính xác, nhận định và gợi ý nhập từ dữ liệu mock', async () => {
    renderApp('/manager/forecast');
    expect(screen.getByRole('heading', { name: /Dự báo nhu cầu AI/ })).toBeTruthy();
    expect(screen.getByText('AI đang tải dữ liệu')).toBeTruthy();

    const chart = await screen.findByRole('img', { name: /Biểu đồ doanh thu: 14 ngày/ });
    expect(chart.getAttribute('aria-label')).toContain('dự báo 7 ngày tới');
    expect(pathD('forecast-predicted-line').match(/L/g)).toHaveLength(13); // 14 điểm: 7 quá khứ + 7 dự báo
    expect(pathD('forecast-actual-line').match(/L/g)).toHaveLength(6); // chỉ 7 ngày đã qua có số thực tế
    expect(screen.getByTestId('forecast-band')).toBeTruthy();
    const legend = screen.getByRole('list', { name: 'Chú giải' });
    expect(within(legend).getByText('Lịch sử thực tế')).toBeTruthy();
    expect(within(legend).getByText('Dự báo AI')).toBeTruthy();

    expect(screen.getByText(/Độ chính xác gần đây: \d+(,\d)?%/)).toBeTruthy();
    expect(screen.getByText(/Doanh thu dự báo 7 ngày tới khoảng/)).toBeTruthy();
    expect(screen.getByText(/có nguy cơ thiếu trong 7 ngày tới/)).toBeTruthy();
    expect(screen.queryByText('AI đang học dữ liệu')).toBeNull();
  });

  it('nguyên liệu: mặc định chọn nguyên liệu gấp nhất, cột thực tế khác cột dự báo, đổi nguyên liệu cập nhật biểu đồ', async () => {
    renderApp('/manager/forecast');
    const select = (await screen.findByLabelText('Chọn nguyên liệu')) as HTMLSelectElement;
    await waitFor(() => expect(select.selectedOptions[0]?.textContent).toContain('Trân châu đen')); // hết hàng → hết từ hôm nay
    const chart = await screen.findByRole('img', { name: /Tiêu thụ thực tế gần nhất và dự báo/ });
    expect(chart.querySelectorAll('rect.fill-ai-from')).toHaveLength(7);
    expect(chart.querySelectorAll('rect.fill-primary-400')).toHaveLength(3);
    expect(chart.querySelector('rect.fill-primary-700')).toBeNull(); // không tô đậm "hôm nay" ở màn dự báo

    fireEvent.change(select, { target: { value: '2' } });
    const arabica = await screen.findByRole('img', { name: /Tiêu thụ thực tế gần nhất và dự báo/ });
    const expected = rowsOf('Ingredient_Usage', 2).filter((f) => f.forecastDate >= today() && f.forecastDate <= addDays(today(), 6)).reduce((s, f) => s + f.predictedValue, 0);
    expect(arabica.getAttribute('aria-label')).toContain(`tổng ${new Intl.NumberFormat('vi-VN').format(expected + rowsOf('Ingredient_Usage', 2).filter((f) => f.forecastDate < today() && f.forecastDate >= addDays(today(), -3)).reduce((s, f) => s + (f.actualValue ?? 0), 0))}`);
  });

  it('đổi tab 30/90 ngày dài thêm biểu đồ mà không gọi lại API', async () => {
    let calls = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/intelligence/forecasts')) calls += 1;
    });
    renderApp('/manager/forecast');
    await screen.findByRole('img', { name: /Biểu đồ doanh thu: 14 ngày/ });
    const before = calls;
    fireEvent.click(screen.getByRole('button', { name: '30 ngày tới' }));
    expect(await screen.findByRole('img', { name: /Biểu đồ doanh thu: 37 ngày/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '30 ngày tới' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '90 ngày tới' }));
    expect(await screen.findByRole('img', { name: /Biểu đồ doanh thu: 97 ngày/ })).toBeTruthy();
    expect(screen.getByText(/Doanh thu dự báo 90 ngày tới/)).toBeTruthy();
    expect(calls).toBe(before);
  });

  it('"Tạo đơn nhập từ gợi ý" mở bản nháp chỉ-đọc, liệt kê nguyên liệu thiếu, không gọi API ghi', async () => {
    const writes: string[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method !== 'GET') writes.push(`${request.method} ${request.url}`);
    });
    renderApp('/manager/forecast');
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo đơn nhập từ gợi ý' }));
    const dialog = (await screen.findByRole('heading', { name: 'Bản nháp đơn nhập' })).closest('dialog') as HTMLElement;
    const table = within(dialog).getByRole('table');
    expect(within(table).getByText('Trân châu đen')).toBeTruthy();
    expect(within(table).getByText('Cà phê hạt Arabica')).toBeTruthy();
    expect(within(table).queryByText('Cà phê hạt Robusta')).toBeNull(); // tồn đủ
    expect(dialog.textContent).toContain('chưa gửi đơn cho nhà cung cấp');
    expect(writes).toEqual([]);
  });

  it('lỗi doanh thu: hiện lỗi + nút "Thử lại", bấm lại thì hiển thị biểu đồ', async () => {
    let failing = true;
    server.use(
      http.get(url('/intelligence/forecasts'), ({ request }) =>
        failing && request.url.includes('forecastType=Revenue') ? HttpResponse.json({ message: 'Dịch vụ AI bận', code: 'SERVER_BUSY' }, { status: 503 }) : undefined,
      ),
    );
    renderApp('/manager/forecast');
    expect(await screen.findByText('Không tải được dự báo doanh thu')).toBeTruthy();
    expect(screen.getByText('Dịch vụ AI bận')).toBeTruthy();
    failing = false;
    fireEvent.click(screen.getAllByRole('button', { name: 'Thử lại' })[0]);
    expect(await screen.findByRole('img', { name: /Biểu đồ doanh thu/ })).toBeTruthy();
  });

  it('lỗi nguyên liệu không làm mất biểu đồ doanh thu', async () => {
    server.use(
      http.get(url('/intelligence/forecasts'), ({ request }) =>
        request.url.includes('Ingredient_Usage') ? HttpResponse.json({ message: 'Lỗi', code: 'X' }, { status: 500 }) : undefined,
      ),
    );
    renderApp('/manager/forecast');
    expect(await screen.findByText('Không tải được dự báo nguyên liệu')).toBeTruthy();
    expect(await screen.findByRole('img', { name: /Biểu đồ doanh thu/ })).toBeTruthy();
  });

  it('chưa có dự báo nào → empty state, không có biểu đồ', async () => {
    server.use(http.get(url('/intelligence/forecasts'), () => HttpResponse.json([])));
    renderApp('/manager/forecast');
    expect(await screen.findByText('Chưa có dữ liệu dự báo cho chi nhánh này')).toBeTruthy();
    expect(screen.getByText('Chưa có dự báo tiêu thụ nguyên liệu')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /Biểu đồ doanh thu/ })).toBeNull();
    expect(screen.queryByText('AI đang học dữ liệu')).toBeNull();
  });

  it('chưa đủ lịch sử → "AI đang học dữ liệu", độ chính xác chưa xác định, nút tạo đơn bị vô hiệu hoá', async () => {
    const stripped = db.forecasts.filter((f) => f.isLatest).map((f) => ({ ...f, actualValue: f.forecastDate < today() && f.forecastDate < addDays(today(), -2) ? null : f.actualValue }));
    server.use(http.get(url('/intelligence/forecasts'), () => HttpResponse.json(stripped.filter((f) => f.forecastType === 'Revenue'))));
    renderApp('/manager/forecast');
    expect(await screen.findByText('AI đang học dữ liệu')).toBeTruthy();
    expect(screen.getByText('Độ chính xác: chưa xác định')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Tạo đơn nhập thủ công/ }).getAttribute('href')).toBe('/manager/inventory');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Tạo đơn nhập từ gợi ý' }) as HTMLButtonElement).disabled).toBe(true));
  });

  it('tài khoản chưa gán chi nhánh → thông báo, không gọi API dự báo', async () => {
    useAuthStore.setState({ branchId: null });
    let called = false;
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/intelligence/forecasts')) called = true;
    });
    renderApp('/manager/forecast');
    expect(await screen.findByText('Tài khoản chưa được gán chi nhánh')).toBeTruthy();
    expect(called).toBe(false);
  });

  it('chỉ Quản lý vào được route', async () => {
    resetWorld();
    const session = await identityApi.login({ identifier: 'staff@smartcafe.vn', password: MOCK_PASSWORD });
    useAuthStore.getState().applySession(session);
    renderApp('/manager/forecast');
    await waitFor(() => expect(screen.queryByRole('heading', { name: /Dự báo nhu cầu AI/ })).toBeNull());
  });
});

describe('ConsumptionChart dùng chung (không hồi quy)', () => {
  const data = [
    { date: '2026-10-30', label: '30/10', value: 10 },
    { date: '2026-10-31', label: '31/10', value: 20 },
    { date: '2026-11-01', label: '01/11', value: 30 },
  ];

  it('mặc định (màn Kho): tô đậm cột cuối, mô tả "7 ngày gần nhất", chú thích trung bình/ngày', () => {
    const { container } = render(<ConsumptionChart data={data} unit="g" />);
    expect(container.querySelectorAll('rect.fill-primary-700')).toHaveLength(1);
    expect(container.querySelectorAll('rect.fill-primary-400')).toHaveLength(2);
    expect(container.querySelector('rect.fill-ai-from')).toBeNull();
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Tiêu thụ 7 ngày gần nhất: tổng 60 g. 30/10: 10; 31/10: 20; 01/11: 30.');
    expect(screen.getByText('Trung bình 20 g/ngày · đơn vị: g')).toBeTruthy();
  });

  it('cột forecast dùng màu AI và được ghi "(dự báo)" ở tooltip/mô tả', () => {
    const { container } = render(<ConsumptionChart data={[data[0], { ...data[1], forecast: true }]} unit="g" highlightLast={false} />);
    expect(container.querySelectorAll('rect.fill-ai-from')).toHaveLength(1);
    expect(container.querySelector('rect.fill-primary-700')).toBeNull();
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('31/10: 20 (dự báo)');
    expect(container.querySelector('title')?.textContent).toBe('30/10: 10 g');
  });
});
