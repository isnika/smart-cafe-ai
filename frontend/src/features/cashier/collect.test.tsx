// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { seedDemoOrders } from '@/mocks/seed';
import { mockConfig, url } from '@/mocks/utils';
import { paymentApi } from '@/shared/api';
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
beforeEach(() => {
  resetWorld();
  seedDemoOrders();
  loginAs('Staff');
  requests.length = 0;
});

const posts = () => requests.filter((r) => r === 'POST /api/payment/payments');
/** Giao dịch tiền mặt tại quầy (db demo đã có sẵn payment VNPay của các đơn trả online). */
const cashPayments = () => db.payments.filter((p) => p.paymentMethod === 'Cash');
const cashInvoices = () => db.invoices.filter((r) => cashPayments().some((p) => p.id === r.paymentId));
const dbOrder = (id: number) => db.orders.find((o) => o.id === id)!;
const cardOf = (code: string) => screen.queryByRole('button', { name: new RegExp(`Mở hóa đơn #${code}`) });

async function openBill(orderId = 1) {
  const order = dbOrder(orderId);
  renderApp('/staff?tab=cashier');
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
    expect(within(dialog).getByText('5.000đ')).toBeTruthy();
    expect(posts()).toHaveLength(0); // mở/nhập liệu không gửi thanh toán

    fireEvent.click(confirmButton(dialog));
    expect(await within(dialog).findByText(`Đã thu tiền đơn #${order.orderCode} thành công`)).toBeTruthy();

    // Trạng thái thật ở "backend" mock: payment Success, đơn Paid, đúng 1 hóa đơn
    expect(posts()).toHaveLength(1);
    expect(cashPayments()).toEqual([expect.objectContaining({ paymentMethod: 'Cash', status: 'Success', amount: order.finalAmount, changeAmount: 5_000 })]);
    expect(dbOrder(order.id).paymentStatus).toBe('Paid');
    expect(cashInvoices()).toHaveLength(1);

    // Danh sách Thu ngân lấy lại từ API: card của đơn đã thu biến mất, ô tìm kiếm còn dùng được
    await waitFor(() => expect(cardOf(order.orderCode)).toBeNull());
    expect(screen.getByRole('searchbox')).toBeTruthy();

    // Xem hóa đơn: GET chỉ đọc, đúng đơn + đúng giao dịch
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xem hóa đơn điện tử' }));
    expect(await within(dialog).findByText(/^Hóa đơn SC-\d{4}-\d{5}$/)).toBeTruthy();
    expect(within(dialog).getByText(`#${order.orderCode}`)).toBeTruthy();
    expect(within(dialog).getByText(`#${cashPayments()[0]!.id}`)).toBeTruthy();
    expect(within(dialog).getByText('Tiền mặt')).toBeTruthy();
    expect(within(dialog).getByText('Khách lẻ')).toBeTruthy();
    expect(within(dialog).getByText('Thành công')).toBeTruthy();

    // Đóng/mở lại nhiều lần không phát sinh payment hay hóa đơn mới
    fireEvent.click(within(dialog).getByRole('button', { name: 'Quay lại' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xem hóa đơn điện tử' }));
    await within(dialog).findByText(/^Hóa đơn SC-/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Quay lại' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xong' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(posts()).toHaveLength(1);
    expect(cashPayments()).toHaveLength(1);
    expect(cashInvoices()).toHaveLength(1);
  });

  it('ghi thông tin người mua → hóa đơn mang đúng thông tin đó; thiếu tên thì không cho gửi', async () => {
    const { order, dialog } = await openBill();
    enterCash(dialog, order.finalAmount);
    fireEvent.click(within(dialog).getByLabelText('Ghi thông tin người mua trên hóa đơn'));
    expect(confirmButton(dialog).disabled).toBe(true); // bật mà chưa nhập tên
    fireEvent.change(within(dialog).getByLabelText('Tên người mua'), { target: { value: 'Công ty ABC' } });
    fireEvent.change(within(dialog).getByLabelText('Email nhận hóa đơn'), { target: { value: 'abc@example.com' } });
    expect(confirmButton(dialog).disabled).toBe(false);

    fireEvent.click(confirmButton(dialog));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Xem hóa đơn điện tử' }));
    expect(await within(dialog).findByText('Công ty ABC')).toBeTruthy();
    expect(within(dialog).getByText('abc@example.com')).toBeTruthy();
  });

  it('bấm xác nhận liên tục → chỉ một giao dịch; nút khóa + aria-busy trong lúc request đang chạy', async () => {
    mockConfig.latencyMs = 150;
    const { order, dialog } = await openBill();
    const versionBefore = order.version; // `order` là tham chiếu db: đọc trước khi mock cập nhật
    enterCash(dialog, order.finalAmount);
    const button = confirmButton(dialog);
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(true));
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect((within(dialog).getByLabelText('Khách đưa (₫)') as HTMLInputElement).disabled).toBe(true);

    await within(dialog).findByText(/Đã thu tiền đơn/);
    expect(posts()).toHaveLength(1);
    expect(cashPayments()).toHaveLength(1);
    expect(dbOrder(order.id).version).toBe(versionBefore + 1);
  });

  it('API lỗi → hiển thị lỗi thật, modal vẫn mở, không báo thành công, không đổi trạng thái đơn', async () => {
    server.use(http.post(url('/payment/payments'), () => HttpResponse.json({ message: 'Cổng thu ngân đang bảo trì', code: 'SERVICE_UNAVAILABLE' }, { status: 503 })));
    const { order, dialog } = await openBill();
    enterCash(dialog, order.finalAmount);
    fireEvent.click(confirmButton(dialog));
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Cổng thu ngân đang bảo trì');
    expect(within(dialog).queryByText(/Đã thu tiền đơn/)).toBeNull();
    expect(confirmButton(dialog).disabled).toBe(false); // thử lại được
    expect(dbOrder(order.id).paymentStatus).toBe('Unpaid');
    expect(cashPayments()).toHaveLength(0);
  });

  it('đơn vừa được thu ở nơi khác → server từ chối 409, UI báo lỗi thật, không thu lần hai', async () => {
    const { order, dialog } = await openBill();
    enterCash(dialog, order.finalAmount);
    // một thu ngân khác thu trước (qua API, khác idempotencyKey)
    await paymentApi.payOrders({ orderIds: [order.id], method: 'Cash', cashReceived: order.finalAmount, idempotencyKey: 'other-counter' });
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
