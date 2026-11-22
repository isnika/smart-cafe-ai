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
const server500 = (method: 'get' | 'post', path: string, once = false) =>
  http[method](url(path), () => HttpResponse.json({ message: 'Dịch vụ AI bận' }, { status: 503 }), { once });

describe('/manager/forecast', () => {
  it('hiển thị biểu đồ doanh thu (thực tế vs dự báo), độ chính xác, nhận định và gợi ý nhập từ dữ liệu mock', async () => {
    renderApp('/manager/forecast');
    expect(screen.getByRole('heading', { name: /Dự báo nhu cầu AI/ })).toBeTruthy();
    expect(screen.getByText('AI đang tải dữ liệu')).toBeTruthy();

    const chart = await screen.findByRole('img', { name: /Biểu đồ doanh thu: 7 ngày/ });
    expect(chart.getAttribute('aria-label')).toContain('dự báo 7 ngày tới');
    expect(pathD('forecast-predicted-line').match(/L/g)).toHaveLength(6);
    expect(screen.queryByTestId('forecast-actual-line')).toBeNull();
    expect(screen.queryByTestId('forecast-band')).toBeNull();
    const legend = screen.getByRole('list', { name: 'Chú giải' });
    expect(within(legend).getByText('Dự báo AI')).toBeTruthy();
    expect(within(legend).queryByText('Lịch sử thực tế')).toBeNull();

    expect(screen.getByText('API chưa cung cấp dữ liệu đối chiếu độ chính xác')).toBeTruthy();
    expect(screen.getByText(/Doanh thu dự báo 7 ngày tới khoảng/)).toBeTruthy();
    expect(screen.getByText(/có nguy cơ thiếu trong 7 ngày tới/)).toBeTruthy();
    expect(screen.queryByText('AI đang học dữ liệu')).toBeNull();
  });

  it('nguyên liệu: mặc định chọn nguyên liệu gấp nhất, hiển thị dự báo live và đổi nguyên liệu cập nhật biểu đồ', async () => {
    renderApp('/manager/forecast');
    const select = (await screen.findByLabelText('Chọn nguyên liệu')) as HTMLSelectElement;
    await waitFor(() => expect(select.selectedOptions[0]?.textContent).toContain('Trân châu đen')); // hết hàng → hết từ hôm nay
    const chart = await screen.findByRole('img', { name: /Tiêu thụ thực tế gần nhất và dự báo/ });
    expect(chart.querySelectorAll('rect.fill-ai-from')).toHaveLength(7);
    expect(chart.querySelectorAll('rect.fill-primary-400')).toHaveLength(0);
    expect(chart.querySelector('rect.fill-primary-700')).toBeNull(); // không tô đậm "hôm nay" ở màn dự báo

    fireEvent.change(select, { target: { value: '2' } });
    const arabica = await screen.findByRole('img', { name: /Tiêu thụ thực tế gần nhất và dự báo/ });
    const expected = rowsOf('Ingredient_Usage', 2)
      .filter((f) => f.forecastDate >= today() && f.forecastDate <= addDays(today(), 6))
      .reduce((sum, forecast) => sum + forecast.predictedValue, 0);
    expect(arabica.getAttribute('aria-label')).toContain(`tổng ${new Intl.NumberFormat('vi-VN').format(expected)}`);
  });

  it('đổi tab 30/90 ngày dài thêm biểu đồ mà không gọi lại API', async () => {
    let revenueCalls = 0;
    let inventoryCalls = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/ai/forecasting')) revenueCalls += 1;
      if (request.url.includes('/ai/forecasting/inventory')) inventoryCalls += 1;
    });
    renderApp('/manager/forecast');
    await screen.findByRole('img', { name: /Biểu đồ doanh thu: 7 ngày/ });
    const revenueBefore = revenueCalls;
    const inventoryBefore = inventoryCalls;
    fireEvent.click(screen.getByRole('button', { name: '30 ngày tới' }));
    expect(await screen.findByRole('img', { name: /Biểu đồ doanh thu: 30 ngày/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '30 ngày tới' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '90 ngày tới' }));
    expect(await screen.findByRole('img', { name: /Biểu đồ doanh thu: 90 ngày/ })).toBeTruthy();
    expect(screen.getByText(/Doanh thu dự báo 90 ngày tới/)).toBeTruthy();
    expect(revenueCalls).toBe(revenueBefore);
    expect(inventoryCalls).toBe(inventoryBefore);
  });

  it('"Tạo đơn nhập từ gợi ý" mở bản nháp chỉ-đọc, liệt kê nguyên liệu thiếu, không gọi API ghi', async () => {
    const writes: string[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method !== 'GET' && !new URL(request.url).pathname.startsWith('/api/ai/forecasting')) {
        writes.push(`${request.method} ${request.url}`);
      }
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
    server.use(server500('post', '/ai/forecasting', true));
    renderApp('/manager/forecast');
    expect(await screen.findByText('Không tải được dự báo doanh thu')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Thử lại' })[0]);
    expect(await screen.findByRole('img', { name: /Biểu đồ doanh thu/ })).toBeTruthy();
  });

  it('lỗi nguyên liệu không làm mất biểu đồ doanh thu', async () => {
    server.use(server500('post', '/ai/forecasting/inventory'));
    renderApp('/manager/forecast');
    expect(await screen.findByText('Không tải được dự báo nguyên liệu')).toBeTruthy();
    expect(await screen.findByRole('img', { name: /Biểu đồ doanh thu/ })).toBeTruthy();
  });

  it('chưa có dự báo nào → empty state, không có biểu đồ', async () => {
    server.use(
      http.post(url('/ai/forecasting'), () => HttpResponse.json({ branch_id: 1, model: 'empty', model_version: 'empty', forecast: [] })),
      http.post(url('/ai/forecasting/inventory'), () => HttpResponse.json({ branch_id: 1, model_version: 'empty', ingredients: [] })),
    );
    renderApp('/manager/forecast');
    expect(await screen.findByText('Chưa có dữ liệu dự báo cho chi nhánh này')).toBeTruthy();
    expect(screen.getByText('Chưa có dự báo tiêu thụ nguyên liệu')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /Biểu đồ doanh thu/ })).toBeNull();
    expect(screen.queryByText('AI đang học dữ liệu')).toBeNull();
  });

  it('không giả định độ chính xác hoặc chặn gợi ý nhập khi API chỉ trả kết quả dự báo', async () => {
    server.use(http.post(url('/ai/forecasting'), () => HttpResponse.json({
      branch_id: 1,
      model: 'test',
      model_version: 'test-v1',
      metadata: {},
      forecast: [{ date: today(), predicted_revenue_vnd: 1_000_000 }],
    })));
    renderApp('/manager/forecast');
    expect(await screen.findByText('API chưa cung cấp dữ liệu đối chiếu độ chính xác')).toBeTruthy();
    await screen.findByRole('img', { name: /Biểu đồ doanh thu/ });
    expect(screen.queryByText('AI đang học dữ liệu')).toBeNull();
    expect((await screen.findByRole('button', { name: 'Tạo đơn nhập từ gợi ý' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('tài khoản chưa gán chi nhánh → thông báo, không gọi API dự báo', async () => {
    useAuthStore.setState({ branchId: null });
    let called = false;
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/ai/forecasting')) called = true;
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
