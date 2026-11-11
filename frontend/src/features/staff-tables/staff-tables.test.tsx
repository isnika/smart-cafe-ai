// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { resetCashPaymentAttempt } from '@/features/cashier/hooks/useCashier';
import { resetPaymentRetry } from '@/features/online-order/payment-retry';
import { db, nowNaive } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { mockAccessToken } from '@/mocks/handlers/identity';
import { tableSessionMock } from '@/mocks/handlers/staff-table-v1';
import { seedDemoOrders } from '@/mocks/seed';
import { mockConfig, url } from '@/mocks/utils';
import { cashierShiftApi, configureHttp } from '@/shared/api';
import type { TableSessionStatus } from '@/shared/types';
import { loginAs, resetWorld } from '@/test/helpers';
import { polyfillDialog, renderApp } from '@/test/renderApp';
import { SessionCompletionPrompt } from './components/SessionCompletionPrompt';
import { CONFLICT_MESSAGE } from './model';

const server = setupServer(...handlers);
const requests: string[] = [];
beforeAll(() => {
  server.listen();
  server.events.on('request:start', ({ request }) => {
    const u = new URL(request.url);
    requests.push(`${request.method} ${u.pathname}${u.search}`);
  });
  polyfillDialog();
});
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
beforeEach(() => {
  resetWorld();
  loginAs('Staff');
  useAuthStore.setState({ branchId: 1 });
  configureHttp({ getToken: () => mockAccessToken('u-staff') });
  tableSessionMock.conflictNext = false;
  mockConfig.latencyMs = 0;
  requests.length = 0;
});

const addSession = (tableId: number, status: TableSessionStatus, minutesAgo = 10) => {
  const closed = status === 'Completed' || status === 'Cancelled';
  const s = {
    id: ++db.seq.session, tableId, sessionCode: `code-${db.seq.session}`, customerId: null, status,
    openedAt: nowNaive(-minutesAgo * 60_000), expiresAt: nowNaive(4 * 3_600_000), closedAt: closed ? nowNaive() : null,
  };
  db.sessions.push(s);
  return s;
};
const dbSession = (id: number) => db.sessions.find((s) => s.id === id)!;
const patches = () => requests.filter((r) => r.startsWith('PATCH '));
const article = (table: string) => screen.queryByRole('article', { name: new RegExp(`Bàn ${table}$`) });
const tile = (name: string) => screen.queryByRole('listitem', { name });
const tablesLoaded = () => screen.findByRole('list', { name: 'Danh sách bàn' });

describe('Trang Bàn & phiên bàn (Staff)', () => {
  it('hiển thị trạng thái bàn đúng như server trả, không suy từ phiên', async () => {
    addSession(2, 'Payment_Pending'); // phiên mở ở bàn 2…
    server.use(
      http.get(url('/branches/:id/tables'), () =>
        HttpResponse.json({
          success: true,
          meta: null,
          trace_id: 't',
          data: [
            // …nhưng server nói bàn 2 Empty, bàn 1 Occupied (dù không có phiên) và bàn 3 không có status.
            { id: 1, branch_id: 1, table_number: '01', qr_code: 'a', is_active: true, status: 'Occupied', open_session_id: null },
            { id: 2, branch_id: 1, table_number: '02', qr_code: 'b', is_active: true, status: 'Empty', open_session_id: null },
            { id: 3, branch_id: 1, table_number: '03', qr_code: 'c', is_active: true },
          ],
        }),
      ),
    );
    renderApp('/staff/tables');
    await tablesLoaded();
    expect(tile('Bàn 01: Đang có khách')).toBeTruthy();
    expect(tile('Bàn 02: Trống')).toBeTruthy();
    expect(tile('Bàn 03: Không rõ trạng thái')).toBeTruthy();
    expect(screen.getByText('Trống 1 · Đang có khách 1 · Không rõ 1')).toBeTruthy();
  });

  it('hiển thị Empty/Occupied và bàn tạm ngưng từ dữ liệu mock của server', async () => {
    addSession(1, 'Active');
    renderApp('/staff/tables');
    await tablesLoaded();
    expect(tile('Bàn 01: Đang có khách')).toBeTruthy();
    expect(tile('Bàn 02: Trống')).toBeTruthy();
    expect(tile('Bàn 06: Trống, tạm ngưng')).toBeTruthy();
    expect(screen.getByText('Phiên #1')).toBeTruthy(); // open_session_id từ server
  });

  it('lọc phiên: mặc định Chờ thanh toán (status gửi lên server), đổi sang Đang mở / Đã hoàn tất', async () => {
    addSession(1, 'Active');
    addSession(2, 'Payment_Pending', 30);
    addSession(3, 'Payment_Pending', 5);
    renderApp('/staff/tables');
    await waitFor(() => expect(article('02')).toBeTruthy());
    expect(article('03')).toBeTruthy();
    expect(article('01')).toBeNull();
    expect(requests).toContain('GET /api/table-sessions?branch_id=1&status=Payment_Pending&page=1&size=20');

    fireEvent.click(screen.getByRole('button', { name: 'Đang mở' }));
    await waitFor(() => expect(article('01')).toBeTruthy());
    expect(article('02')).toBeTruthy();
    expect(requests.some((r) => r.startsWith('GET /api/table-sessions?branch_id=1&status=Active'))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Đã hoàn tất' }));
    expect(await screen.findByText('Chưa có phiên nào hoàn tất.')).toBeTruthy();
  });

  it('PATCH Completed: gửi đúng một request, thông báo, phiên rời danh sách chờ và bàn lấy lại trạng thái từ server', async () => {
    const s = addSession(2, 'Payment_Pending');
    renderApp('/staff/tables');
    await waitFor(() => expect(article('02')).toBeTruthy());
    expect(tile('Bàn 02: Đang có khách')).toBeTruthy();

    fireEvent.click(within(article('02')!).getByRole('button', { name: 'Hoàn tất phiên' }));
    expect(await screen.findByText('Đã hoàn tất phiên bàn.')).toBeTruthy();
    expect(patches()).toEqual([`PATCH /api/table-sessions/${s.id}/status`]);
    expect(dbSession(s.id).status).toBe('Completed');
    expect(dbSession(s.id).closedAt).toBeTruthy();
    await waitFor(() => expect(article('02')).toBeNull());
    await waitFor(() => expect(tile('Bàn 02: Trống')).toBeTruthy()); // refetch /branches/1/tables → server nói Empty
  });

  it('PATCH Cancelled: cần xác nhận trong hộp thoại; "Giữ phiên" không gửi gì', async () => {
    const s = addSession(1, 'Active');
    renderApp('/staff/tables');
    await tablesLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Đang mở' }));
    await waitFor(() => expect(article('01')).toBeTruthy());
    expect(within(article('01')!).queryByRole('button', { name: 'Hoàn tất phiên' })).toBeNull(); // Active chưa thể hoàn tất

    fireEvent.click(within(article('01')!).getByRole('button', { name: 'Hủy phiên' }));
    let dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Giữ phiên' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(patches()).toHaveLength(0);

    fireEvent.click(within(article('01')!).getByRole('button', { name: 'Hủy phiên' }));
    dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận hủy phiên' }));
    expect(await screen.findByText('Đã hủy phiên bàn.')).toBeTruthy();
    expect(patches()).toHaveLength(1);
    expect(dbSession(s.id).status).toBe('Cancelled');
    await waitFor(() => expect(tile('Bàn 01: Trống')).toBeTruthy());
  });

  it('409 → refetch + thông báo phiên vừa thay đổi, không tự retry', async () => {
    const s = addSession(2, 'Payment_Pending');
    renderApp('/staff/tables');
    await waitFor(() => expect(article('02')).toBeTruthy());
    tableSessionMock.conflictNext = true;
    requests.length = 0;

    fireEvent.click(within(article('02')!).getByRole('button', { name: 'Hoàn tất phiên' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(CONFLICT_MESSAGE);
    await new Promise((r) => setTimeout(r, 60));
    expect(patches()).toHaveLength(1); // không retry
    const after = requests.slice(requests.findIndex((r) => r.startsWith('PATCH ')) + 1);
    expect(after.some((r) => r.startsWith('GET /api/table-sessions'))).toBe(true);
    expect(after.some((r) => r.startsWith('GET /api/branches/1/tables'))).toBe(true);
    expect(dbSession(s.id).status).toBe('Completed'); // người khác đã đóng; UI hiển thị theo dữ liệu mới
    await waitFor(() => expect(article('02')).toBeNull());
  });

  it('bấm "Hoàn tất phiên" liên tục chỉ gửi một request', async () => {
    mockConfig.latencyMs = 100;
    addSession(2, 'Payment_Pending');
    renderApp('/staff/tables');
    await waitFor(() => expect(article('02')).toBeTruthy());
    const button = within(article('02')!).getByRole('button', { name: 'Hoàn tất phiên' });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(await screen.findByText('Đã hoàn tất phiên bàn.')).toBeTruthy();
    expect(patches()).toHaveLength(1);
  });

  it('chưa biết chi nhánh → báo lỗi, không gọi API và không đoán branch', async () => {
    useAuthStore.setState({ branchId: null });
    renderApp('/staff/tables');
    expect((await screen.findByRole('alert')).textContent).toContain('Chưa xác định được chi nhánh');
    expect(requests.some((r) => r.includes('/tables') || r.includes('/table-sessions'))).toBe(false);
  });

  it('403 từ server → thông báo không đủ quyền, có nút thử lại', async () => {
    server.use(http.get(url('/branches/:id/tables'), () => HttpResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'no' }, trace_id: 't' }, { status: 403 })));
    renderApp('/staff/tables');
    expect((await screen.findByText('Bạn không có quyền xem dữ liệu bàn của chi nhánh này.')).textContent).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Thử lại' }).length).toBeGreaterThan(0);
  });
});

const renderPrompt = (sessionId: number) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionCompletionPrompt branchId={1} sessionId={sessionId} />
    </QueryClientProvider>,
  );
};

describe('Sau Payment Success: nhắc hoàn tất phiên (không mặc định phiên đã đóng)', () => {
  it('phiên vẫn Payment_Pending → hiện nút Hoàn tất phiên; bấm → PATCH Completed', async () => {
    const s = addSession(2, 'Payment_Pending');
    renderPrompt(s.id);
    const button = await screen.findByRole('button', { name: 'Hoàn tất phiên' });
    expect(patches()).toHaveLength(0); // chỉ đọc, chưa tự đóng
    fireEvent.click(button);
    expect(await screen.findByText('Đã hoàn tất phiên bàn.')).toBeTruthy();
    expect(dbSession(s.id).status).toBe('Completed');
    expect(patches()).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Hoàn tất phiên' })).toBeNull());
  });

  it('phiên còn Active → chỉ báo trạng thái, không có nút hoàn tất', async () => {
    const s = addSession(2, 'Active');
    renderPrompt(s.id);
    expect(await screen.findByText(/khách chưa yêu cầu tính tiền/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hoàn tất phiên' })).toBeNull();
  });

  it('phiên đã đóng → báo đã đóng, không có nút', async () => {
    const s = addSession(2, 'Completed');
    renderPrompt(s.id);
    expect(await screen.findByText(/đã đóng hoặc không còn trong danh sách phiên đang mở/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hoàn tất phiên' })).toBeNull();
  });

  it('409 khi hoàn tất → refetch + thông báo, không retry', async () => {
    const s = addSession(2, 'Payment_Pending');
    renderPrompt(s.id);
    const button = await screen.findByRole('button', { name: 'Hoàn tất phiên' });
    tableSessionMock.conflictNext = true;
    requests.length = 0;
    fireEvent.click(button);
    expect((await screen.findByRole('alert')).textContent).toBe(CONFLICT_MESSAGE);
    await new Promise((r) => setTimeout(r, 60));
    expect(patches()).toHaveLength(1);
    expect(requests.slice(requests.findIndex((r) => r.startsWith('PATCH ')) + 1).some((r) => r.startsWith('GET /api/table-sessions'))).toBe(true);
  });

  it('tích hợp thu ngân: thu tiền mặt thành công nhưng phiên vẫn Payment_Pending → modal hiện Hoàn tất phiên', async () => {
    seedDemoOrders();
    await cashierShiftApi.openCashierShift({ branchId: 1, openingCash: 500_000 });
    resetPaymentRetry();
    for (const o of db.orders) resetCashPaymentAttempt(o.id);
    const order = db.orders.find((o) => o.id === 1)!;
    const session = dbSession(order.tableSessionId!);
    session.status = 'Payment_Pending';

    renderApp('/staff?tab=cashier');
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Mở hóa đơn #${order.orderCode}`) }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Khách đưa (₫)'), { target: { value: String(order.finalAmount) } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận đã thu' }));

    expect(await within(dialog).findByText(`Đã thu tiền đơn #${order.orderCode} thành công`)).toBeTruthy();
    expect(order.paymentStatus).toBe('Paid');
    expect(session.status).toBe('Payment_Pending'); // thanh toán không tự đóng phiên

    fireEvent.click(await within(dialog).findByRole('button', { name: 'Hoàn tất phiên' }));
    expect(await within(dialog).findByText('Đã hoàn tất phiên bàn.')).toBeTruthy();
    expect(session.status).toBe('Completed');
    expect(patches()).toEqual([`PATCH /api/table-sessions/${session.id}/status`]);
  });

  it('đơn không gắn phiên bàn (Pickup/POS) → không hiện khối phiên bàn trong biên nhận', async () => {
    seedDemoOrders();
    await cashierShiftApi.openCashierShift({ branchId: 1, openingCash: 500_000 });
    resetPaymentRetry();
    const online = db.orders.find((o) => o.tableSessionId == null && o.paymentStatus === 'Unpaid' && o.status !== 'Pending_Payment')!;
    expect(online).toBeTruthy(); // seed có đơn POS Pickup chưa trả (không gắn phiên bàn)
    for (const o of db.orders) resetCashPaymentAttempt(o.id);
    renderApp('/staff?tab=cashier');
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Mở hóa đơn #${online.orderCode}`) }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Khách đưa (₫)'), { target: { value: String(online.finalAmount) } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận đã thu' }));
    expect(await within(dialog).findByText(/Đã thu tiền đơn/)).toBeTruthy();
    expect(within(dialog).queryByRole('region', { name: 'Phiên bàn' })).toBeNull();
    expect(requests.some((r) => r.startsWith('GET /api/table-sessions'))).toBe(false);
  });
});
