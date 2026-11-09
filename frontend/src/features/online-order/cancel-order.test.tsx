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
import { url } from '@/mocks/utils';
import { configureHttp, isApiError, myOrderApi } from '@/shared/api';
import type { OrderDetail, OrderStatus, PaymentStatus } from '@/shared/types';
import { resetWorld } from '@/test/helpers';
import { polyfillDialog, renderApp } from '@/test/renderApp';
import { cancelAffordance } from './cancel';

/**
 * Hủy đơn Online của khách trên /orders/:id. Chạy trên MSW thật của dự án (order-read-v1 + order-cancel-v1),
 * nên kiểm được cả body PATCH, version, refetch và các mã lỗi 409/404/422 do mock trả.
 */
const server = setupServer(...handlers);
interface Call { method: string; path: string; body: Promise<string> }
const calls: Call[] = [];
server.events.on('request:start', ({ request }) => {
  const u = new URL(request.url);
  if (/\/orders/.test(u.pathname)) calls.push({ method: request.method, path: u.pathname, body: request.clone().text() });
});
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
  resetAuthMock();
  seedDemoOrders();
  calls.length = 0;
  configureHttp({ getToken: () => useAuthStore.getState().accessToken, onUnauthorized: undefined });
});

const signIn = (email: string) => useAuthStore.getState().login({ identifier: email, password: '123456' });
const patches = () => calls.filter((c) => c.method === 'PATCH');
const detailGets = (id: number) => calls.filter((c) => c.method === 'GET' && c.path === `/api/orders/me/${id}`);
const dbOrder = (id: number) => db.orders.find((o) => o.id === id)!;

/** Đơn Online của u-customer, ép về (status, paymentStatus) mong muốn (version giữ nguyên trừ khi truyền). */
function onlineOrder(status: OrderStatus, paymentStatus: PaymentStatus, version?: number): OrderDetail {
  const o = db.orders.find((x) => x.userId === 'u-customer' && x.orderSource === 'Online' && x.fulfillmentType === 'Delivery')!;
  Object.assign(o, { status, paymentStatus, cancelReason: null, cancelledAt: null, cancelledBy: null, ...(version ? { version } : {}) });
  return o;
}

async function open(id: number) {
  const view = renderApp(`/orders/${id}`);
  await screen.findByText(`#${dbOrder(id).orderCode}`);
  await screen.findByRole('list', { name: 'Lịch sử trạng thái' });
  return view;
}
const cancelButton = () => screen.queryByRole('button', { name: 'Hủy đơn' });
async function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Hủy đơn' }));
  return screen.findByLabelText('Lý do hủy (bắt buộc)');
}
const reasonBox = () => screen.getByLabelText('Lý do hủy (bắt buộc)') as HTMLTextAreaElement;
const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy' }));

describe('cancelAffordance — điều kiện hiện nút (theo Excel, không theo ORDER_TRANSITIONS của FE)', () => {
  const online = { orderSource: 'Online' } as const;
  it.each<[OrderStatus, PaymentStatus, string]>([
    ['Pending_Payment', 'Unpaid', 'cancel'],
    ['Pending', 'Unpaid', 'cancel'],
    ['Confirmed', 'Unpaid', 'none'], // Excel: Confirmed → Cancelled chỉ Staff/Manager
    ['Preparing', 'Unpaid', 'none'], // FE ORDER_TRANSITIONS có cạnh này nhưng Excel không có
    ['Ready', 'Unpaid', 'none'],
    ['Shipping', 'Unpaid', 'none'],
    ['Completed', 'Unpaid', 'none'],
    ['Cancelled', 'Unpaid', 'none'],
    ['Rejected', 'Unpaid', 'none'],
    ['Pending', 'Paid', 'contact-shop'],
    ['Preparing', 'Paid', 'contact-shop'],
    ['Pending', 'Partially_Refunded', 'contact-shop'],
    ['Completed', 'Paid', 'none'],
    ['Cancelled', 'Paid', 'none'],
  ])('%s + %s → %s', (status, paymentStatus, expected) => {
    expect(cancelAffordance({ ...online, status, paymentStatus })).toBe(expected);
  });
  it('đơn Dine-in không có nút hủy', () => {
    expect(cancelAffordance({ orderSource: 'QR', status: 'Pending', paymentStatus: 'Unpaid' })).toBe('none');
  });
});

describe('hiển thị nút Hủy', () => {
  it('đơn Unpaid + Pending_Payment → có nút Hủy', async () => {
    await signIn('customer@smartcafe.vn');
    const o = onlineOrder('Pending_Payment', 'Unpaid');
    await open(o.id);
    expect(cancelButton()).toBeTruthy();
    expect(screen.queryByText(/liên hệ quán/)).toBeNull();
  });

  it('đơn Unpaid + Pending (COD) → có nút Hủy', async () => {
    await signIn('customer@smartcafe.vn');
    const o = onlineOrder('Pending', 'Unpaid');
    await open(o.id);
    expect(cancelButton()).toBeTruthy();
  });

  it.each<OrderStatus>(['Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled'])('đơn Unpaid nhưng %s → không có nút Hủy', async (status) => {
    await signIn('customer@smartcafe.vn');
    const o = onlineOrder(status, 'Unpaid');
    await open(o.id);
    expect(cancelButton()).toBeNull();
  });

  it('đơn Paid → KHÔNG có nút Hủy, hiện hướng dẫn liên hệ quán kèm mã đơn; không gửi PATCH', async () => {
    await signIn('customer@smartcafe.vn');
    const o = onlineOrder('Pending', 'Paid');
    await open(o.id);
    expect(cancelButton()).toBeNull();
    const guide = screen.getByRole('region', { name: 'Hủy đơn đã thanh toán' });
    expect(guide.textContent).toContain('liên hệ quán');
    expect(guide.textContent).toContain(`#${o.orderCode}`);
    expect(patches()).toHaveLength(0);
  });

  it('đơn Paid đã hoàn tất → không nút, không hướng dẫn', async () => {
    await signIn('customer@smartcafe.vn');
    const o = onlineOrder('Completed', 'Paid');
    await open(o.id);
    expect(cancelButton()).toBeNull();
    expect(screen.queryByText(/liên hệ quán/)).toBeNull();
  });

  it('đơn Dine-in của chính khách (Unpaid, Pending) → không có nút Hủy', async () => {
    await signIn('customer@smartcafe.vn');
    const dine = db.orders.find((o) => o.fulfillmentType === 'Dine_In')!;
    Object.assign(dine, { userId: 'u-customer', status: 'Pending', paymentStatus: 'Unpaid' });
    await open(dine.id);
    expect(cancelButton()).toBeNull();
  });
});

describe('hủy đơn: PATCH /orders/{id}/status', () => {
  it('gửi đúng { status:"Cancelled", cancel_reason, version } với version của đơn hiện tại (không hard-code)', async () => {
    await signIn('customer@smartcafe.vn');
    const o = onlineOrder('Pending_Payment', 'Unpaid', 7);
    await open(o.id);
    fireEvent.change(await openDialog(), { target: { value: '  Đặt nhầm món  ' } });
    confirm();

    await waitFor(() => expect(patches()).toHaveLength(1));
    const [p] = patches();
    expect(p!.path).toBe(`/api/orders/${o.id}/status`);
    expect(JSON.parse(await p!.body)).toEqual({ status: 'Cancelled', cancel_reason: 'Đặt nhầm món', version: 7 });
  });

  it('thành công: đơn Cancelled trong db, UI cập nhật (banner huỷ + lý do, mất nút), timeline có dòng Cancelled, không tự gọi refund', async () => {
    await signIn('customer@smartcafe.vn');
    const o = onlineOrder('Pending_Payment', 'Unpaid');
    await open(o.id);
    fireEvent.change(await openDialog(), { target: { value: 'Đổi ý' } });
    confirm();

    expect(await screen.findByRole('status', { name: 'Kết quả hủy đơn' })).toBeTruthy();
    expect(dbOrder(o.id)).toMatchObject({ status: 'Cancelled', cancelReason: 'Đổi ý', cancelledBy: 'u-customer' });
    const banner = await screen.findByRole('status', { name: 'Đơn không được thực hiện' });
    expect(banner.textContent).toContain('Đơn đã được huỷ');
    expect(banner.textContent).toContain('Lý do: Đổi ý');
    expect(cancelButton()).toBeNull();
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Lịch sử trạng thái' })).getAllByRole('listitem').at(-1)!.getAttribute('data-status')).toBe('Cancelled'));
    expect(patches()).toHaveLength(1);
    expect(calls.filter((c) => /refund|payment/i.test(c.path))).toEqual([]);
  });

  it('thiếu lý do → báo lỗi, KHÔNG gửi PATCH; chỉ khoảng trắng cũng không được', async () => {
    await signIn('customer@smartcafe.vn');
    const o = onlineOrder('Pending', 'Unpaid');
    await open(o.id);
    const box = await openDialog();
    confirm();
    expect((await screen.findByText('Vui lòng nhập lý do hủy đơn.'))).toBeTruthy();
    fireEvent.change(box, { target: { value: '    ' } });
    confirm();
    expect(screen.getByText('Vui lòng nhập lý do hủy đơn.')).toBeTruthy();
    expect(patches()).toHaveLength(0);
    expect(dbOrder(o.id).status).toBe('Pending');
  });

  it('"Giữ đơn" đóng hộp thoại, không gửi gì', async () => {
    await signIn('customer@smartcafe.vn');
    const o = onlineOrder('Pending', 'Unpaid');
    await open(o.id);
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Giữ đơn' }));
    await waitFor(() => expect(screen.queryByLabelText('Lý do hủy (bắt buộc)')).toBeNull());
    expect(patches()).toHaveLength(0);
  });
});

describe('409 VERSION_CONFLICT', () => {
  it('nhân viên cập nhật đơn giữa chừng (version tăng, đơn vẫn hủy được): refetch detail, báo đơn vừa cập nhật, KHÔNG tự gửi lại; khách hủy lại thì dùng version mới', async () => {
    await signIn('customer@smartcafe.vn');
    const o = onlineOrder('Pending', 'Unpaid', 1);
    await open(o.id);
    const getsBefore = detailGets(o.id).length;
    dbOrder(o.id).version = 2; // thay đổi phía server sau khi trang đã tải (vd: nhân viên ghi chú)

    fireEvent.change(await openDialog(), { target: { value: 'Đổi ý' } });
    confirm();

    const alert = await screen.findByRole('alert', { name: 'Kết quả hủy đơn' });
    expect(alert.textContent).toContain('vừa được cập nhật');
    await waitFor(() => expect(detailGets(o.id).length).toBeGreaterThan(getsBefore));
    expect(patches()).toHaveLength(1); // không tự gửi lại
    expect(dbOrder(o.id).status).toBe('Pending'); // chưa hủy
    expect(JSON.parse(await patches()[0]!.body).version).toBe(1);

    // Khách chủ động hủy lại: lần này version đã được làm mới = 2
    fireEvent.change(await openDialog(), { target: { value: 'Đổi ý' } });
    confirm();
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(JSON.parse(await patches()[1]!.body).version).toBe(2);
    await waitFor(() => expect(dbOrder(o.id).status).toBe('Cancelled'));
  });

  it('nhân viên xác nhận đơn giữa chừng: refetch → trạng thái mới "Quán đã xác nhận", nút Hủy biến mất, vẫn không gửi lại', async () => {
    await signIn('customer@smartcafe.vn');
    const o = onlineOrder('Pending', 'Unpaid', 1);
    await open(o.id);
    Object.assign(dbOrder(o.id), { status: 'Confirmed', version: 2 });
    dbOrder(o.id).statusHistory.push({ id: 9001, orderId: o.id, fromStatus: 'Pending', status: 'Confirmed', changedBy: 'u-staff', note: null, createdAt: dbOrder(o.id).updatedAt });

    fireEvent.change(await openDialog(), { target: { value: 'Đổi ý' } });
    confirm();

    expect((await screen.findByRole('alert', { name: 'Kết quả hủy đơn' })).textContent).toContain('vừa được cập nhật');
    await waitFor(() => expect(screen.getByLabelText('Trạng thái đơn').textContent).toBe('Quán đã xác nhận'));
    expect(cancelButton()).toBeNull();
    expect(patches()).toHaveLength(1);
    expect(dbOrder(o.id).status).toBe('Confirmed');
  });
});

describe('409 INVALID_STATE_TRANSITION', () => {
  it('server báo không hủy được ở trạng thái hiện tại: hiện lỗi nghiệp vụ, refetch đơn, nút Hủy biến mất, không gửi lại', async () => {
    await signIn('customer@smartcafe.vn');
    const o = onlineOrder('Pending', 'Unpaid', 1);
    await open(o.id);
    const getsBefore = detailGets(o.id).length;
    dbOrder(o.id).status = 'Confirmed'; // version giữ nguyên → server qua bước version, dừng ở transition

    fireEvent.change(await openDialog(), { target: { value: 'Đổi ý' } });
    confirm();

    const alert = await screen.findByRole('alert', { name: 'Kết quả hủy đơn' });
    expect(alert.textContent).toContain('không thể hủy ở trạng thái hiện tại');
    expect(alert.textContent).not.toContain('vừa được cập nhật');
    await waitFor(() => expect(detailGets(o.id).length).toBeGreaterThan(getsBefore));
    await waitFor(() => expect(screen.getByLabelText('Trạng thái đơn').textContent).toBe('Quán đã xác nhận'));
    expect(cancelButton()).toBeNull();
    expect(patches()).toHaveLength(1);
  });
});

describe('lỗi khác', () => {
  it('422 (đơn vừa được thanh toán): báo cần liên hệ quán, refetch → chuyển sang hướng dẫn, không có nút', async () => {
    await signIn('customer@smartcafe.vn');
    const o = onlineOrder('Pending', 'Unpaid', 1);
    await open(o.id);
    dbOrder(o.id).paymentStatus = 'Paid'; // version + status khớp → server dừng ở rule "đơn đã trả"

    fireEvent.change(await openDialog(), { target: { value: 'Đổi ý' } });
    confirm();

    expect((await screen.findByRole('alert', { name: 'Kết quả hủy đơn' })).textContent).toContain('liên hệ quán');
    await screen.findByRole('region', { name: 'Hủy đơn đã thanh toán' });
    expect(cancelButton()).toBeNull();
    expect(dbOrder(o.id).status).toBe('Pending');
  });

  it('500: giữ hộp thoại + lý do, báo lỗi trong hộp thoại; thử lại được', async () => {
    await signIn('customer@smartcafe.vn');
    const o = onlineOrder('Pending_Payment', 'Unpaid');
    await open(o.id);
    server.use(http.patch(url('/orders/:id/status'), () => HttpResponse.json({ success: false, error: { code: 'INTERNAL', message: 'boom' }, trace_id: 't' }, { status: 500 }), { once: true }));

    fireEvent.change(await openDialog(), { target: { value: 'Đổi ý' } });
    confirm();
    await waitFor(() => expect(screen.getByText('Không thể hủy đơn lúc này. Vui lòng thử lại sau.')).toBeTruthy());
    expect(reasonBox().value).toBe('Đổi ý');
    expect(dbOrder(o.id).status).toBe('Pending_Payment');

    confirm();
    await waitFor(() => expect(dbOrder(o.id).status).toBe('Cancelled'));
  });

  it('mất kết nối: thông báo lỗi kết nối, không đổi đơn', async () => {
    await signIn('customer@smartcafe.vn');
    const o = onlineOrder('Pending', 'Unpaid');
    await open(o.id);
    server.use(http.patch(url('/orders/:id/status'), () => HttpResponse.error(), { once: true }));
    fireEvent.change(await openDialog(), { target: { value: 'Đổi ý' } });
    confirm();
    expect(await screen.findByText('Không thể kết nối tới máy chủ. Vui lòng thử lại.')).toBeTruthy();
    expect(dbOrder(o.id).status).toBe('Pending');
  });
});

describe('bảo mật: đơn của người khác', () => {
  it('khách khác mở /orders/:id của đơn không thuộc mình → "Không tìm thấy đơn hàng", không nút Hủy, không PATCH', async () => {
    await signIn('customer2@smartcafe.vn');
    const o = onlineOrder('Pending', 'Unpaid'); // đơn của u-customer
    renderApp(`/orders/${o.id}`);
    expect(await screen.findByText('Không tìm thấy đơn hàng')).toBeTruthy();
    expect(cancelButton()).toBeNull();
    expect(screen.queryByText(`#${o.orderCode}`)).toBeNull();
    expect(patches()).toHaveLength(0);
  });

  it('gọi thẳng API bằng token của khách khác (bỏ qua UI) → 404, đơn không đổi; UI không thay thế kiểm tra của server', async () => {
    await signIn('customer2@smartcafe.vn');
    const o = onlineOrder('Pending', 'Unpaid');
    const before = JSON.stringify(dbOrder(o.id));
    const e = await myOrderApi.cancelMyOrder(o.id, { cancelReason: 'x', version: o.version }).catch((x: unknown) => x);
    expect(isApiError(e) && [e.status, e.code]).toEqual([404, 'ORDER_NOT_FOUND']);
    expect(JSON.stringify(dbOrder(o.id))).toBe(before);
  });

  it('chủ đơn bị server báo 404 khi hủy (đơn đã đổi chủ/không còn) → báo lỗi, không crash', async () => {
    await signIn('customer@smartcafe.vn');
    const o = onlineOrder('Pending', 'Unpaid');
    await open(o.id);
    dbOrder(o.id).userId = 'u-customer2';
    fireEvent.change(await openDialog(), { target: { value: 'Đổi ý' } });
    confirm();
    expect(await screen.findByText('Không tìm thấy đơn hàng hoặc đơn không thuộc tài khoản của bạn.')).toBeTruthy();
    expect(dbOrder(o.id).status).toBe('Pending');
  });
});

describe('cancelMyOrder — kiểm tra đầu vào, không gửi request', () => {
  it.each([
    [{ cancelReason: '', version: 1 }],
    [{ cancelReason: '   ', version: 1 }],
    [{ cancelReason: 'x'.repeat(256), version: 1 }],
    [{ cancelReason: 'x', version: 0 }],
    [{ cancelReason: 'x', version: 1.5 }],
  ])('%j → VALIDATION_ERROR', async (input) => {
    await signIn('customer@smartcafe.vn');
    const o = onlineOrder('Pending', 'Unpaid');
    calls.length = 0;
    const e = await myOrderApi.cancelMyOrder(o.id, input).catch((x: unknown) => x);
    expect(isApiError(e) && [e.status, e.code]).toEqual([400, 'VALIDATION_ERROR']);
    expect(calls).toHaveLength(0);
  });
});
