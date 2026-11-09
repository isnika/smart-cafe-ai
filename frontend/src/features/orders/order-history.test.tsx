// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { resetAuthMock } from '@/mocks/handlers/identity';
import { seedDemoOrders } from '@/mocks/seed';
import { mockConfig, url } from '@/mocks/utils';
import { configureHttp } from '@/shared/api/http';
import { resetWorld } from '@/test/helpers';
import { polyfillDialog, renderApp } from '@/test/renderApp';
import { orderSummary, orderTimeLabel, TAB_STATUSES } from './format';

const server = setupServer(...handlers);
/** Mọi request GET tới API đơn hàng (để kiểm tra đúng endpoint + query). */
const seen: URL[] = [];
server.events.on('request:start', ({ request }) => {
  const u = new URL(request.url);
  if (request.method === 'GET' && /\/orders/.test(u.pathname)) seen.push(u);
});
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
  seen.length = 0;
});

const signIn = (email: string) => useAuthStore.getState().login({ identifier: email, password: '123456' });
const ownOrders = (userId: string) => db.orders.filter((o) => o.userId === userId);
const codesOnScreen = () => screen.queryAllByRole('article').map((el) => el.getAttribute('aria-label'));
const listCalls = () => seen.filter((u) => u.pathname === '/api/orders/me');
const lastCall = () => listCalls().at(-1)!;
/** Thêm n đơn Online của khách (bản sao đơn đã có, id/mã mới, createdAt lùi dần) để có nhiều trang. */
function addOrders(userId: string, n: number, over: Partial<(typeof db.orders)[number]> = {}) {
  const base = ownOrders(userId)[0]!;
  const maxId = Math.max(...db.orders.map((o) => o.id));
  for (let i = 1; i <= n; i++) {
    db.orders.push({ ...base, id: maxId + i, orderCode: `HX${maxId + i}`, createdAt: `2026-09-${String(i).padStart(2, '0')} 03:00:00`, updatedAt: `2026-09-${String(i).padStart(2, '0')} 03:00:00`, statusHistory: [], ...over });
  }
}

describe('/orders — lịch sử đơn hàng (GET /orders/me)', () => {
  it('gọi GET /orders/me (không gọi API legacy) với status không lọc, page=1, size=10, không payment_status', async () => {
    await signIn('customer@smartcafe.vn');
    renderApp('/orders');
    await screen.findAllByRole('article');
    expect(seen.some((u) => u.pathname.startsWith('/api/orders-svc'))).toBe(false);
    const sp = lastCall().searchParams;
    expect(Object.fromEntries(sp)).toEqual({ page: '1', size: '10' });
    expect(sp.has('payment_status')).toBe(false);
  });

  it('hiển thị đúng và chỉ đơn của khách đang đăng nhập: mã, thời gian, tổng tiền, order status, payment status, loại đơn', async () => {
    await signIn('customer@smartcafe.vn');
    renderApp('/orders');

    expect(screen.getByLabelText('Đang tải đơn hàng')).toBeTruthy();
    const cards = await screen.findAllByRole('article');
    const mine = ownOrders('u-customer');
    expect(cards).toHaveLength(mine.length);
    for (const o of mine) expect(codesOnScreen()).toContain(`Đơn #${o.orderCode}`);
    for (const o of ownOrders('u-customer2')) expect(codesOnScreen()).not.toContain(`Đơn #${o.orderCode}`);

    const completed = mine.find((o) => o.status === 'Completed')!;
    const card = screen.getByRole('article', { name: `Đơn #${completed.orderCode}` });
    expect(within(card).getByLabelText('Trạng thái đơn').textContent).toBe('Hoàn tất');
    expect(within(card).getByLabelText('Trạng thái thanh toán').textContent).toBe('Đã thanh toán');
    expect(card.textContent).toContain(completed.fulfillmentType === 'Pickup' ? 'Online · Mang đi' : 'Online · Giao hàng');
    expect(card.textContent).toContain(`${completed.items.reduce((n, i) => n + i.quantity, 0)} sản phẩm`);
    expect(card.textContent).toMatch(/\d\.\d{3}đ/);
    expect(card.textContent).toContain(orderTimeLabel(`${completed.createdAt}Z`));
  });

  it('order status và payment status là hai nhãn độc lập: Pending_Payment+Unpaid, Cancelled+Unpaid', async () => {
    await signIn('customer@smartcafe.vn');
    renderApp('/orders');
    await screen.findAllByRole('article');
    const pp = ownOrders('u-customer').find((o) => o.status === 'Pending_Payment')!;
    const c1 = screen.getByRole('article', { name: `Đơn #${pp.orderCode}` });
    expect(within(c1).getByLabelText('Trạng thái đơn').textContent).toBe('Chờ thanh toán');
    expect(within(c1).getByLabelText('Trạng thái thanh toán').textContent).toBe('Chưa thanh toán');
    const cancelled = ownOrders('u-customer').find((o) => o.status === 'Cancelled')!;
    const c2 = screen.getByRole('article', { name: `Đơn #${cancelled.orderCode}` });
    expect(within(c2).getByLabelText('Trạng thái đơn').textContent).toBe('Đã huỷ');
  });

  it('khách khác đăng nhập thì thấy đơn của họ, không lẫn đơn của khách trước', async () => {
    await signIn('customer2@smartcafe.vn');
    renderApp('/orders');
    await screen.findAllByRole('article');
    expect(codesOnScreen().sort()).toEqual(ownOrders('u-customer2').map((o) => `Đơn #${o.orderCode}`).sort());
  });

  it('đơn Dine-in của chính khách vẫn hiện, ghi nhãn "Tại quán", không lẫn Online', async () => {
    await signIn('customer@smartcafe.vn');
    const dine = db.orders.find((o) => o.fulfillmentType === 'Dine_In')!;
    dine.userId = 'u-customer';
    renderApp('/orders');
    const card = await screen.findByRole('article', { name: `Đơn #${dine.orderCode}` });
    expect(card.textContent).toContain('Tại quán');
    expect(card.textContent).not.toContain('Online');
    const online = ownOrders('u-customer').find((o) => o.orderSource === 'Online')!;
    expect(screen.getByRole('article', { name: `Đơn #${online.orderCode}` }).textContent).toContain('Online');
  });

  it('đơn Dine-in vô chủ (QR/POS) không bao giờ hiện trong lịch sử của khách', async () => {
    await signIn('customer@smartcafe.vn');
    renderApp('/orders');
    await screen.findAllByRole('article');
    for (const o of db.orders.filter((x) => x.userId === null)) expect(codesOnScreen()).not.toContain(`Đơn #${o.orderCode}`);
  });

  it('thẻ đơn dẫn tới trang theo dõi đơn (/orders/:id)', async () => {
    await signIn('customer@smartcafe.vn');
    const { router } = renderApp('/orders');
    const order = ownOrders('u-customer')[0]!;
    fireEvent.click(await screen.findByRole('link', { name: `Xem chi tiết đơn #${order.orderCode}` }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/orders/${order.id}`));
    expect(await screen.findByText(`#${order.orderCode}`)).toBeTruthy();
    expect(screen.getByText('Theo dõi đơn hàng')).toBeTruthy();
  });

  it('không còn nút "Đặt lại" (reorder ngoài phạm vi bước này)', async () => {
    await signIn('customer@smartcafe.vn');
    renderApp('/orders');
    await screen.findAllByRole('article');
    expect(screen.queryByRole('button', { name: 'Đặt lại' })).toBeNull();
  });
});

describe('/orders — tab lọc theo ORDER status', () => {
  it('map tab → status: Tất cả không lọc, Hoàn tất = Completed, Đã huỷ = Cancelled', () => {
    expect(TAB_STATUSES).toEqual({ all: undefined, completed: 'Completed', cancelled: 'Cancelled' });
  });

  it('tab Hoàn tất: gửi status=Completed (không payment_status), chỉ hiện đơn Completed', async () => {
    await signIn('customer@smartcafe.vn');
    renderApp('/orders');
    await screen.findAllByRole('article');
    const mine = ownOrders('u-customer');

    fireEvent.click(screen.getByRole('tab', { name: 'Hoàn tất' }));
    const expected = mine.filter((o) => o.status === 'Completed');
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(expected.length));
    expect(Object.fromEntries(lastCall().searchParams)).toEqual({ status: 'Completed', page: '1', size: '10' });
    expect(screen.getAllByRole('article').every((a) => within(a).getByLabelText('Trạng thái đơn').textContent === 'Hoàn tất')).toBe(true);
    expect(screen.getByRole('tab', { name: 'Hoàn tất' }).getAttribute('aria-selected')).toBe('true');
  });

  it('tab Đã huỷ: gửi status=Cancelled, chỉ hiện đơn Cancelled (đơn Rejected không lẫn vào)', async () => {
    await signIn('customer@smartcafe.vn');
    addOrders('u-customer', 1, { status: 'Rejected', paymentStatus: 'Paid' });
    renderApp('/orders');
    await screen.findAllByRole('article');
    const mine = ownOrders('u-customer');
    const rejected = mine.find((o) => o.status === 'Rejected')!;
    expect(codesOnScreen()).toContain(`Đơn #${rejected.orderCode}`); // tab Tất cả có Rejected

    fireEvent.click(screen.getByRole('tab', { name: 'Đã huỷ' }));
    const expected = mine.filter((o) => o.status === 'Cancelled');
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(expected.length));
    expect(Object.fromEntries(lastCall().searchParams)).toEqual({ status: 'Cancelled', page: '1', size: '10' });
    expect(codesOnScreen()).not.toContain(`Đơn #${rejected.orderCode}`);
    expect(screen.getAllByRole('article').every((a) => within(a).getByLabelText('Trạng thái đơn').textContent === 'Đã huỷ')).toBe(true);
  });

  it('lọc theo order status, không theo payment_status: đơn Cancelled+Unpaid xuất hiện ở Đã huỷ; đơn Completed+Paid không', async () => {
    await signIn('customer@smartcafe.vn');
    renderApp('/orders');
    await screen.findAllByRole('article');
    fireEvent.click(screen.getByRole('tab', { name: 'Đã huỷ' }));
    await waitFor(() => expect(lastCall().searchParams.get('status')).toBe('Cancelled'));
    await waitFor(() => expect(screen.getAllByRole('article').length).toBe(ownOrders('u-customer').filter((o) => o.status === 'Cancelled').length));
    for (const call of listCalls()) expect(call.searchParams.has('payment_status')).toBe(false);
    for (const a of screen.getAllByRole('article')) expect(within(a).getByLabelText('Trạng thái thanh toán').textContent).toBe('Chưa thanh toán');
  });

  it('quay lại tab Tất cả: bỏ status', async () => {
    await signIn('customer@smartcafe.vn');
    renderApp('/orders');
    await screen.findAllByRole('article');
    fireEvent.click(screen.getByRole('tab', { name: 'Hoàn tất' }));
    await waitFor(() => expect(lastCall().searchParams.get('status')).toBe('Completed'));
    fireEvent.click(screen.getByRole('tab', { name: 'Tất cả' }));
    await waitFor(() => expect(lastCall().searchParams.has('status')).toBe(false));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(ownOrders('u-customer').length));
  });

  it('tab trống → thông báo riêng của tab', async () => {
    await signIn('customer2@smartcafe.vn'); // chỉ có đơn Shipping
    renderApp('/orders');
    await screen.findAllByRole('article');
    fireEvent.click(screen.getByRole('tab', { name: 'Hoàn tất' }));
    expect(await screen.findByText('Chưa có đơn nào hoàn tất.')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Đã huỷ' }));
    expect(await screen.findByText('Bạn không có đơn nào bị huỷ.')).toBeTruthy();
  });
});

describe('/orders — phân trang bằng meta của API', () => {
  it('17 đơn, size=10 → trang 1 có 10 đơn, "Trang 1/2"; qua trang 2 có 7 đơn; gọi API với page=2, không tải lại toàn bộ', async () => {
    await signIn('customer@smartcafe.vn');
    addOrders('u-customer', 12); // 5 + 12 = 17
    renderApp('/orders');
    expect(await screen.findAllByRole('article')).toHaveLength(10);
    expect(screen.getByText('Trang 1/2')).toBeTruthy();
    const first = codesOnScreen();
    expect((screen.getByRole('button', { name: 'Trang trước' }) as HTMLButtonElement).disabled).toBe(true);
    expect(listCalls()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(screen.getByText('Trang 2/2')).toBeTruthy());
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(7));
    expect(Object.fromEntries(lastCall().searchParams)).toEqual({ page: '2', size: '10' });
    expect(codesOnScreen().filter((c) => first.includes(c))).toEqual([]); // không trùng trang 1
    expect((screen.getByRole('button', { name: 'Trang sau' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Trang trước' }));
    await waitFor(() => expect(screen.getByText('Trang 1/2')).toBeTruthy());
    await waitFor(() => expect(codesOnScreen()).toEqual(first));
  });

  it('hai trang cộng lại đủ đúng toàn bộ đơn của khách, mới nhất trước', async () => {
    await signIn('customer@smartcafe.vn');
    addOrders('u-customer', 12);
    renderApp('/orders');
    await screen.findAllByRole('article');
    const p1 = codesOnScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(screen.getByText('Trang 2/2')).toBeTruthy());
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(7));
    const all = [...p1, ...codesOnScreen()];
    expect(all.sort()).toEqual(ownOrders('u-customer').map((o) => `Đơn #${o.orderCode}`).sort());
  });

  it('đổi tab → quay về trang 1 và gửi page=1 cùng status mới', async () => {
    await signIn('customer@smartcafe.vn');
    addOrders('u-customer', 12, { status: 'Completed', paymentStatus: 'Paid' }); // 12 Completed + 1 seed = 13+
    renderApp('/orders');
    await screen.findAllByRole('article');
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(screen.getByText('Trang 2/2')).toBeTruthy());

    fireEvent.click(screen.getByRole('tab', { name: 'Hoàn tất' }));
    await waitFor(() => expect(Object.fromEntries(lastCall().searchParams)).toEqual({ status: 'Completed', page: '1', size: '10' }));
    await waitFor(() => expect(screen.getByText('Trang 1/2')).toBeTruthy());
  });

  it('ít hơn một trang → không hiện điều khiển phân trang', async () => {
    await signIn('customer@smartcafe.vn');
    renderApp('/orders');
    await screen.findAllByRole('article');
    expect(screen.queryByRole('navigation', { name: 'Phân trang đơn hàng' })).toBeNull();
  });

  it('đang ở trang 2 mà dữ liệu co lại còn 1 trang (page > totalPages) → tự lùi về trang cuối có dữ liệu', async () => {
    await signIn('customer@smartcafe.vn');
    addOrders('u-customer', 12);
    const { client } = renderApp('/orders');
    await screen.findAllByRole('article');
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(screen.getByText('Trang 2/2')).toBeTruthy());

    const keep = ownOrders('u-customer').slice(0, 3).map((o) => o.id);
    db.orders.splice(0, db.orders.length, ...db.orders.filter((o) => o.userId !== 'u-customer' || keep.includes(o.id)));
    await client.invalidateQueries({ queryKey: ['orders', 'mine'] });

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3));
    expect(Object.fromEntries(lastCall().searchParams)).toEqual({ page: '1', size: '10' });
    expect(screen.queryByText('Bạn chưa có đơn hàng nào.')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Phân trang đơn hàng' })).toBeNull();
  });
});

describe('/orders — loading / error / empty / quyền', () => {
  it('danh sách trống → thông báo và nút về thực đơn / trang chủ', async () => {
    await signIn('customer2@smartcafe.vn');
    db.orders.splice(0, db.orders.length, ...db.orders.filter((o) => o.userId !== 'u-customer2'));
    renderApp('/orders');
    expect(await screen.findByText('Bạn chưa có đơn hàng nào.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem thực đơn' }).getAttribute('href')).toBe('/menu');
    expect(screen.getByRole('link', { name: 'Về trang chủ' }).getAttribute('href')).toBe('/home');
    expect(screen.queryByRole('navigation', { name: 'Phân trang đơn hàng' })).toBeNull();
  });

  it('lỗi tải → báo lỗi và Thử lại tải được dữ liệu', async () => {
    await signIn('customer@smartcafe.vn');
    server.use(http.get(url('/orders/me'), () => HttpResponse.json({ success: false, error: { code: 'INTERNAL', message: 'Máy chủ lỗi' }, trace_id: 't' }, { status: 500 }), { once: true }));
    renderApp('/orders');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Không tải được đơn hàng');
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect((await screen.findAllByRole('article')).length).toBe(ownOrders('u-customer').length);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('phản hồi sai shape (status lạ) → báo lỗi, không hiển thị bừa', async () => {
    await signIn('customer@smartcafe.vn');
    server.use(http.get(url('/orders/me'), () => HttpResponse.json({ success: true, data: [{ id: 1, order_code: 'X', branch_id: 1, order_source: 'Online', fulfillment_type: 'Pickup', status: 'Serving', payment_status: 'Paid', final_amount: 1, created_at: '2026-11-01T00:00:00Z' }], meta: { page: 1, size: 10, total: 1 }, trace_id: 't' })));
    renderApp('/orders');
    expect((await screen.findByRole('alert')).textContent).toContain('Không tải được đơn hàng');
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('chưa đăng nhập → chuyển về /login, không gọi API đơn hàng', async () => {
    let called = false;
    server.use(http.get(url('/orders/me'), () => { called = true; return HttpResponse.json({ success: true, data: [], meta: null, trace_id: 't' }); }));
    mockConfig.enforceAuth = true;
    const { router } = renderApp('/orders');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(called).toBe(false);
  });

  it('phiên hết hạn (401) → bị đưa về /login thay vì hiện dữ liệu cũ', async () => {
    await signIn('customer@smartcafe.vn');
    server.use(http.get(url('/orders/me'), () => HttpResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Hết phiên' }, trace_id: 't' }, { status: 401 })));
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
