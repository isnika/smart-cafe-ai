// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { orderApi, paymentApi } from '@/shared/api';
import type { PayResult, PaymentGatewayStatus } from '@/shared/types';
import { loginAs, resetWorld } from '@/test/helpers';
import { polyfillDialog, renderApp } from '@/test/renderApp';
import { rememberPaymentId } from './payment-session';
import PaymentReturnPage from './pages/PaymentReturnPage';

/** Trang return VNPay/Momo: kết quả chỉ do GET /payments/{id} quyết định, không do query của cổng. */

const server = setupServer(...handlers);
beforeAll(() => {
  server.listen();
  polyfillDialog();
});
afterAll(() => server.close());
beforeEach(resetWorld);
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
});

const payResult = (status: PaymentGatewayStatus, over: Partial<PayResult['payment']> = {}): PayResult => ({
  payment: {
    id: 9, status, paymentMethod: 'VNPay', amount: 85_000, transactionId: null,
    paidAt: status === 'Success' ? '2026-11-05T10:02:00Z' : null, ...over,
  } as PayResult['payment'],
  allocations: [{ id: 1, paymentId: 9, orderId: 42, allocatedAmount: 85_000, createdAt: '' }],
  redirectUrl: null,
  invoice: null,
});

function mountPage(path: string, fetchPayment: ReturnType<typeof vi.fn>) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/payment/:orderId/return" element={<PaymentReturnPage fetchPayment={fetchPayment as never} />} />
      </Routes>
    </MemoryRouter>,
  );
}
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('PaymentReturnPage — thông báo theo trạng thái', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rememberPaymentId(42, 9);
  });

  it('Success → "Thanh toán thành công", kèm giờ thanh toán (parseUtc → giờ VN)', async () => {
    mountPage('/payment/42/return', vi.fn().mockResolvedValue(payResult('Success', { transactionId: 'TX-1' })));
    await advance(0);
    expect(screen.getByRole('heading', { name: 'Thanh toán thành công' })).toBeTruthy();
    expect(screen.getByText('85.000đ')).toBeTruthy();
    expect(screen.getByText(/Thanh toán lúc 17:02/)).toBeTruthy(); // 10:02Z = 17:02 giờ VN
    expect(screen.getByText('Mã giao dịch: TX-1')).toBeTruthy();
  });

  it.each([
    ['Failed', 'Thanh toán chưa thành công'],
    ['Cancelled', 'Thanh toán chưa thành công'],
    ['Expired', 'Giao dịch đã hết hạn'],
  ] as const)('%s → thông báo chưa thành công', async (status, title) => {
    mountPage('/payment/42/return', vi.fn().mockResolvedValue(payResult(status)));
    await advance(0);
    expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    expect(screen.getByText(/chưa được thanh toán/)).toBeTruthy();
    expect(screen.queryByText('Thanh toán thành công')).toBeNull();
  });

  it('timeout → "chưa xác nhận được kết quả", KHÔNG khẳng định thất bại', async () => {
    mountPage('/payment/42/return', vi.fn().mockResolvedValue(payResult('Pending')));
    await advance(0);
    expect(screen.getByRole('heading', { name: 'Đang xác nhận thanh toán' })).toBeTruthy();

    await advance(60_000);
    expect(screen.getByRole('heading', { name: 'Chưa xác nhận được kết quả thanh toán' })).toBeTruthy();
    expect(screen.getByText(/chưa có nghĩa giao dịch thất bại/)).toBeTruthy();
    expect(screen.queryByText(/chưa thành công/)).toBeNull();
    expect(screen.queryByText(/thất bại$/)).toBeNull();
    expect(screen.queryByText('Thanh toán thành công')).toBeNull();
  });

  it('Pending → Success giữa chừng: chuyển từ "đang xác nhận" sang thành công', async () => {
    const fetchPayment = vi.fn().mockResolvedValueOnce(payResult('Pending')).mockResolvedValue(payResult('Success'));
    mountPage('/payment/42/return', fetchPayment);
    await advance(0);
    expect(screen.getByRole('heading', { name: 'Đang xác nhận thanh toán' })).toBeTruthy();
    await advance(2_000);
    expect(screen.getByRole('heading', { name: 'Thanh toán thành công' })).toBeTruthy();
  });

  it('unmount trang: không còn timer nào chạy', async () => {
    const fetchPayment = vi.fn().mockResolvedValue(payResult('Pending'));
    const { unmount } = mountPage('/payment/42/return', fetchPayment);
    await advance(2_000);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await advance(60_000);
    expect(fetchPayment).toHaveBeenCalledTimes(2);
  });
});

describe('PaymentReturnPage — query của cổng không quyết định kết quả', () => {
  const GATEWAY_SAYS_OK = 'vnp_ResponseCode=00&vnp_TransactionStatus=00&vnp_TxnRef=555&vnp_Amount=8500000&status=success&resultCode=0';

  beforeEach(() => vi.useFakeTimers());

  it('vnp_* báo thành công nhưng server vẫn Pending → KHÔNG hiện thành công; hết hạn chờ → chưa xác nhận', async () => {
    rememberPaymentId(42, 9);
    const fetchPayment = vi.fn().mockResolvedValue(payResult('Pending'));
    mountPage(`/payment/42/return?${GATEWAY_SAYS_OK}`, fetchPayment);

    await advance(0);
    expect(screen.queryByText('Thanh toán thành công')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Đang xác nhận thanh toán' })).toBeTruthy();
    await advance(60_000);
    expect(screen.queryByText('Thanh toán thành công')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Chưa xác nhận được kết quả thanh toán' })).toBeTruthy();
  });

  it('vnp_* báo lỗi nhưng server trả Success → theo server', async () => {
    rememberPaymentId(42, 9);
    mountPage('/payment/42/return?vnp_ResponseCode=24&vnp_TransactionStatus=02', vi.fn().mockResolvedValue(payResult('Success')));
    await advance(0);
    expect(screen.getByRole('heading', { name: 'Thanh toán thành công' })).toBeTruthy();
  });

  it('paymentId lấy từ dữ liệu đã lưu, không lấy từ vnp_TxnRef', async () => {
    rememberPaymentId(42, 9);
    const fetchPayment = vi.fn().mockResolvedValue(payResult('Pending'));
    mountPage(`/payment/42/return?${GATEWAY_SAYS_OK}`, fetchPayment);
    await advance(0);
    expect(fetchPayment).toHaveBeenCalledWith(9, expect.anything());
    expect(fetchPayment).not.toHaveBeenCalledWith(555, expect.anything());
  });

  it('không có dữ liệu đã lưu và không có paymentId: chỉ có vnp_* → không gọi API, không hiện thành công', async () => {
    const fetchPayment = vi.fn();
    mountPage(`/payment/42/return?${GATEWAY_SAYS_OK}`, fetchPayment);
    await advance(10_000);
    expect(fetchPayment).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Không tìm thấy giao dịch' })).toBeTruthy();
    expect(screen.queryByText('Thanh toán thành công')).toBeNull();
  });

  it('dữ liệu đã lưu được ưu tiên hơn ?paymentId= trên URL; thiếu dữ liệu lưu thì dùng ?paymentId=', async () => {
    rememberPaymentId(42, 7);
    const a = vi.fn().mockResolvedValue(payResult('Pending'));
    const first = mountPage('/payment/42/return?paymentId=9', a);
    await advance(0);
    expect(a).toHaveBeenCalledWith(7, expect.anything());
    first.unmount();

    sessionStorage.clear();
    const b = vi.fn().mockResolvedValue(payResult('Pending'));
    mountPage('/payment/42/return?paymentId=9', b);
    await advance(0);
    expect(b).toHaveBeenCalledWith(9, expect.anything());
  });
});

describe('PaymentReturnPage — qua router + MSW thật (GET /payments/{id})', () => {
  /** Đơn Online Pending_Payment + giao dịch VNPay Pending của user mock, tạo đúng như checkout (POST /payments). */
  async function pendingPayment() {
    loginAs('Customer', { id: 'u-customer', fullName: 'Nguyễn Văn A', phone: '0901234567' });
    const ctx = { source: 'Online', fulfillmentType: 'Pickup' } as const;
    const cart = await orderApi.ensureCart(ctx, 1);
    await orderApi.addCartItem(ctx, { variantId: 12, quantity: 2, options: [{ optionId: 101 }, { optionId: 104 }] });
    const order = await orderApi.createOnlineOrder(
      { cartId: cart.id, fulfillmentType: 'Pickup', branchId: 1 },
      { idempotencyKey: 'idem-return-1', mockPaymentMethod: 'VNPay' },
    );
    const created = await paymentApi.createPayment(
      { branchId: 1, paymentMethod: 'VNPay', allocations: [{ orderId: order.id, allocatedAmount: order.finalAmount }], returnUrl: `http://localhost:5173/payment/${order.id}/return` },
      { idempotencyKey: 'idem-pay-1' },
    );
    rememberPaymentId(order.id, created.payment.id);
    return { order, paymentId: created.payment.id };
  }

  it('route /payment/:orderId/return đã đăng ký; vnp_* "thành công" không làm giao dịch Pending thành Success', async () => {
    const { order, paymentId } = await pendingPayment();
    renderApp(`/payment/${order.id}/return?vnp_ResponseCode=00&vnp_TransactionStatus=00&vnp_TxnRef=${paymentId}`);

    expect(await screen.findByRole('heading', { name: 'Đang xác nhận thanh toán' })).toBeTruthy();
    expect(screen.queryByText('Thanh toán thành công')).toBeNull();
    expect(db.payments.find((p) => p.id === paymentId)?.status).toBe('Pending');
    expect(db.orders.find((o) => o.id === order.id)).toMatchObject({ status: 'Pending_Payment', paymentStatus: 'Unpaid' });
  });

  it('server chốt Success (IPN) → trang hiện thành công theo GET /payments/{id}', async () => {
    const { order, paymentId } = await pendingPayment();
    await paymentApi.simulatePayment(paymentId, { result: 'success' });
    renderApp(`/payment/${order.id}/return`);

    expect(await screen.findByRole('heading', { name: 'Thanh toán thành công' })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Theo dõi đơn hàng' }).getAttribute('href')).toBe(`/orders/${order.id}`));
  });

  it('khách chưa đăng nhập không đọc được giao dịch → không hiện thành công', async () => {
    const { order } = await pendingPayment();
    loginAs('Customer', { id: 'u-customer2', fullName: 'Người khác' });
    renderApp(`/payment/${order.id}/return`);
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy giao dịch' })).toBeTruthy(); // 404 như không tồn tại
    expect(screen.queryByText('Thanh toán thành công')).toBeNull();
  });
});
