// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { seedDemoOrders } from '@/mocks/seed';
import { mockConfig, url } from '@/mocks/utils';
import { cashierShiftApi, configureHttp, paymentApi } from '@/shared/api';
import { mockAccessToken } from '@/mocks/handlers/identity';
import { resetPaymentRetry } from '@/features/online-order/payment-retry';
import { resetCashPaymentAttempt } from './hooks/useCashier';
import { loginAs, resetWorld } from '@/test/helpers';
import { polyfillDialog, renderApp } from '@/test/renderApp';

const server = setupServer(...handlers);
const requests: string[] = [];
beforeAll(() => {
  server.listen();
  server.events.on('request:start', ({ request }) => requests.push(`${request.method} ${new URL(request.url).pathname}`));
  polyfillDialog();
});
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
beforeEach(async () => {
  resetWorld();
  seedDemoOrders();
  loginAs('Staff');
  configureHttp({ getToken: () => mockAccessToken('u-staff') });
  await cashierShiftApi.openCashierShift({ branchId: 1, openingCash: 500_000 });
  for (const order of db.orders) resetCashPaymentAttempt(order.id);
  resetPaymentRetry();
  requests.length = 0;
});

const posts = () => requests.filter((r) => r.startsWith('POST /api/payments'));
const paymentCreates = () => requests.filter((r) => r === 'POST /api/payments');
/** Giao dịch tiền mặt tại quầy (db demo đã có sẵn payment VNPay của các đơn trả online). */
const cashPayments = () => db.payments.filter((p) => p.paymentMethod === 'Cash');
const cashInvoices = () => db.invoices.filter((r) => cashPayments().some((p) => p.id === r.paymentId));
const dbOrder = (id: number) => db.orders.find((o) => o.id === id)!;
const cardOf = (code: string) => screen.queryByRole('button', { name: new RegExp(`Mở hóa đơn #${code}`) });

async function openBill(orderId = 1) {
  const order = dbOrder(orderId);
  renderApp('/staff?tab=cashier');
  await waitFor(() => expect(screen.getByRole('region', { name: 'Chờ thu tại quầy' })).toBeTruthy());
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Mở hóa đơn #${order.orderCode}`) }));
  return { order, dialog: await screen.findByRole('dialog') };
}
const enterCash = (dialog: HTMLElement, amount: number) =>
  fireEvent.change(within(dialog).getByLabelText('Khách đưa (₫)'), { target: { value: String(amount) } });
const confirmButton = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Xác nhận đã thu' }) as HTMLButtonElement;

describe('Thu tiền tại quầy → payment mock → e-invoice', () => {
  it('luồng đầy đủ: chỉ thu khi đủ tiền, API thật thành công → biên nhận → danh sách cập nhật từ API → xem hóa đơn', async () => {
    const { order, dialog } = await openBill();
    expect(confirmButton(dialog).disabled).toBe(true);
    enterCash(dialog, order.finalAmount - 1);
    expect(confirmButton(dialog).disabled).toBe(true);
    enterCash(dialog, order.finalAmount + 5_000);
    expect(confirmButton(dialog).disabled).toBe(false);
    expect(within(dialog).getByText('Xác nhận để biết tiền trả lại')).toBeTruthy();
    expect(posts()).toHaveLength(0); // mở/nhập liệu không gửi thanh toán

    fireEvent.click(confirmButton(dialog));
    expect(await within(dialog).findByText(`Đã thu tiền đơn #${order.orderCode} thành công`)).toBeTruthy();

    // Trạng thái thật ở "backend" mock: payment Success, đơn Paid, đúng 1 hóa đơn
    expect(posts()).toHaveLength(2);
    expect(paymentCreates()).toHaveLength(1);
    expect(cashPayments()).toEqual([expect.objectContaining({ paymentMethod: 'Cash', cashierShiftId: 1, status: 'Success', amount: order.finalAmount, changeAmount: 5_000 })]);
    expect(dbOrder(order.id).paymentStatus).toBe('Paid');
    expect(cashInvoices()).toHaveLength(0);

    // Danh sách Thu ngân lấy lại từ API: card của đơn đã thu biến mất, ô tìm kiếm còn dùng được
    await waitFor(() => expect(cardOf(order.orderCode)).toBeNull());
    expect(screen.getByRole('searchbox')).toBeTruthy();

    // Đóng/mở receipt không phát sinh request payment mới
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xong' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(posts()).toHaveLength(2);
    expect(cashPayments()).toHaveLength(1);
    expect(cashInvoices()).toHaveLength(0);
  });

  it('thông tin hóa đơn không tham gia payload cash payment', async () => {
    const { order, dialog } = await openBill();
    enterCash(dialog, order.finalAmount);
    fireEvent.click(within(dialog).getByLabelText('Ghi thông tin người mua trên hóa đơn'));
    fireEvent.change(within(dialog).getByLabelText('Tên người mua'), { target: { value: 'Công ty ABC' } });
    fireEvent.change(within(dialog).getByLabelText('Email nhận hóa đơn'), { target: { value: 'abc@example.com' } });
    fireEvent.click(confirmButton(dialog));
    expect(await screen.findByText(`Đã thu tiền đơn #${order.orderCode} thành công`)).toBeTruthy();
    expect(db.invoiceRequests).toEqual({});
  });

  it('bấm xác nhận liên tục → chỉ một giao dịch; nút khóa + aria-busy trong lúc request đang chạy', async () => {
    mockConfig.latencyMs = 150;
    const { order, dialog } = await openBill();
    const versionBefore = order.version; // `order` là tham chiếu db: đọc trước khi mock cập nhật
    enterCash(dialog, order.finalAmount);
    await waitFor(() => expect(confirmButton(dialog).disabled).toBe(false));
    const button = confirmButton(dialog);
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    const pendingButton = confirmButton(dialog);
    await waitFor(() => expect(pendingButton.disabled).toBe(true));
    expect(pendingButton.getAttribute('aria-busy')).toBe('true');
    expect((within(dialog).getByLabelText('Khách đưa (₫)') as HTMLInputElement).disabled).toBe(true);

    expect(await screen.findByText(/Đã thu tiền đơn/)).toBeTruthy();
    expect(posts()).toHaveLength(2);
    expect(cashPayments()).toHaveLength(1);
    expect(posts()).toHaveLength(2);
    expect(cashPayments()).toHaveLength(1);
    expect(dbOrder(order.id).version).toBe(versionBefore + 1);
  });

  it('API lỗi → hiển thị lỗi thật, modal vẫn mở, không báo thành công, không đổi trạng thái đơn', async () => {
    server.use(http.post(url('/payments/:id/confirm-cash'), () => HttpResponse.json({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Cổng thu ngân đang bảo trì' }, trace_id: 'test' }, { status: 503 })));
    const { order, dialog } = await openBill();
    enterCash(dialog, order.finalAmount);
    fireEvent.click(confirmButton(dialog));
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Cổng thu ngân đang bảo trì');
    expect(within(dialog).queryByText(/Đã thu tiền đơn/)).toBeNull();
    expect(confirmButton(dialog).disabled).toBe(false); // thử lại được
    expect(dbOrder(order.id).paymentStatus).toBe('Unpaid');
    expect(cashPayments()).toHaveLength(1);
    const keyAfterFailure = cashPayments()[0]!.idempotencyKey;
    server.resetHandlers();
    fireEvent.click(confirmButton(dialog));
    expect(await screen.findByText(`Đã thu tiền đơn #${order.orderCode} thành công`)).toBeTruthy();
    expect(cashPayments()).toHaveLength(1);
    expect(cashPayments()[0]!.idempotencyKey).toBe(keyAfterFailure);
  });

  it('không có ca Open thì khóa thu', async () => {
    await cashierShiftApi.closeCashierShift(1, { closingCash: 500_000 });
    const { order, dialog } = await openBill();
    enterCash(dialog, order.finalAmount);
    expect(confirmButton(dialog).disabled).toBe(true);
    expect(within(dialog).getAllByRole('status').some((node) => node.textContent?.includes('Chưa có ca thu ngân'))).toBe(true);
    expect(posts()).toHaveLength(0);
  });

  it('mỗi giao dịch thu mới có Idempotency-Key mới', async () => {
    const { order, dialog } = await openBill();
    const keyHeaders: string[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && new URL(request.url).pathname === '/api/payments') keyHeaders.push(request.headers.get('Idempotency-Key') ?? '');
    });
    enterCash(dialog, order.finalAmount);
    fireEvent.click(confirmButton(dialog));
    await screen.findByText(`Đã thu tiền đơn #${order.orderCode} thành công`);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xong' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const otherOrder = db.orders.find((entry) => entry.id !== order.id && entry.orderSource !== 'Online' && entry.paymentStatus === 'Unpaid')!;
    const otherBill = await openBill(otherOrder.id);
    enterCash(otherBill.dialog, otherOrder.finalAmount);
    fireEvent.click(confirmButton(otherBill.dialog));
    await screen.findByText(`Đã thu tiền đơn #${otherOrder.orderCode} thành công`);
    expect(keyHeaders).toHaveLength(2);
    expect(keyHeaders[0]).not.toBe(keyHeaders[1]);
  });

  it('đơn vừa được thu ở nơi khác → server từ chối 409, UI báo lỗi thật, không thu lần hai', async () => {
    const { order, dialog } = await openBill();
    enterCash(dialog, order.finalAmount);
    // một thu ngân khác thu trước (qua API, khác idempotencyKey)
    const created = await paymentApi.createPayment({ branchId: order.branchId, paymentMethod: 'Cash', allocations: [{ orderId: order.id, allocatedAmount: order.finalAmount }], cashierShiftId: 1 }, { idempotencyKey: 'other-counter' });
    await paymentApi.confirmCashPayment(created.payment.id, { cashierShiftId: 1, cashReceived: order.finalAmount });
    fireEvent.click(confirmButton(dialog));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/đã được thu tiền tại quầy/);
    expect(cashPayments()).toHaveLength(1);
    expect(db.allocations.filter((a) => a.orderId === order.id)).toHaveLength(1);
  });

  it('đơn đã trả online: không có nút thu, xem được hóa đơn của giao dịch VNPay, không gửi POST thanh toán', async () => {
    const paid = db.orders.find((o) => o.orderSource === 'Online' && o.paymentStatus === 'Paid' && o.status !== 'Completed')!;
    const { dialog } = await openBill(paid.id);
    expect(within(dialog).queryByRole('button', { name: 'Xác nhận đã thu' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xem hóa đơn điện tử' }));
    expect(await within(dialog).findByText(/^Hóa đơn SC-/)).toBeTruthy();
    expect(within(dialog).getByText('VNPay')).toBeTruthy();
    expect(within(dialog).getByText(`#${paid.orderCode}`)).toBeTruthy();
    expect(posts()).toHaveLength(0);
    expect(db.payments).toHaveLength(db.orders.filter((o) => o.paymentStatus === 'Paid').length);
  });

  it('hóa đơn lỗi → báo lỗi + Thử lại; không bao giờ gửi thanh toán', async () => {
    const paid = db.orders.find((o) => o.orderSource === 'Online' && o.paymentStatus === 'Paid' && o.status !== 'Completed')!;
    server.use(http.get(url('/payment/invoices'), () => HttpResponse.json({ message: 'Giao dịch chưa có hóa đơn', code: 'INVOICE_NOT_FOUND' }, { status: 404 })));
    const { dialog } = await openBill(paid.id);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xem hóa đơn điện tử' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Giao dịch chưa có hóa đơn');
    server.resetHandlers();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thử lại' }));
    expect(await within(dialog).findByText(/^Hóa đơn SC-/)).toBeTruthy();
    expect(posts()).toHaveLength(0);
  });
});
