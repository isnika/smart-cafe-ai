// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { seedDemoOrders } from '@/mocks/seed';
import { url } from '@/mocks/utils';
import { loginAs, resetWorld } from '@/test/helpers';
import { polyfillDialog, renderApp } from '@/test/renderApp';

// Giả lập "phase 2 đã bật": kiểm tra ranh giới tích hợp gọi đúng POST /payment/payments và hiển thị kết quả API thật.
vi.mock('./config', () => ({ CASHIER_REFETCH_MS: 5_000, COUNTER_PAYMENT_ENABLED: true }));

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

async function openFirstBill() {
  const order = db.orders.find((o) => o.id === 1)!;
  renderApp('/staff?tab=cashier');
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Mở hóa đơn #${order.orderCode}`) }));
  return { order, dialog: await screen.findByRole('dialog') };
}

describe('Thu tiền tại quầy (khi API thanh toán sẵn sàng)', () => {
  it('chỉ cho thu khi khách đưa đủ tiền, gửi đúng payload, thành công thì đóng modal', async () => {
    let body: unknown;
    server.use(http.post(url('/payment/payments'), async ({ request }) => { body = await request.json(); return HttpResponse.json({ payment: {}, allocations: [] }); }));
    const { order, dialog } = await openFirstBill();
    const button = within(dialog).getByRole('button', { name: 'Xác nhận đã thu' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(within(dialog).getByLabelText('Khách đưa (₫)'), { target: { value: String(order.finalAmount - 1) } });
    expect(button.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Khách đưa (₫)'), { target: { value: String(order.finalAmount + 5_000) } });
    expect(button.disabled).toBe(false);
    expect(within(dialog).getByText('5.000đ')).toBeTruthy();

    fireEvent.click(button);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(body).toMatchObject({ orderIds: [order.id], method: 'Cash', cashReceived: order.finalAmount + 5_000, idempotencyKey: `cashier-${order.id}-v${order.version}` });
  });

  it('API lỗi → hiển thị lỗi thật, modal vẫn mở, không đổi trạng thái đơn ở frontend', async () => {
    server.use(http.post(url('/payment/payments'), () => HttpResponse.json({ message: 'Đơn đã được thanh toán', code: 'ALREADY_PAID' }, { status: 409 })));
    const { order, dialog } = await openFirstBill();
    fireEvent.change(within(dialog).getByLabelText('Khách đưa (₫)'), { target: { value: String(order.finalAmount) } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận đã thu' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Đơn đã được thanh toán');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(db.orders.find((o) => o.id === order.id)!.paymentStatus).toBe('Unpaid');
  });
});
