// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { ApiError, orderApi, paymentApi } from '@/shared/api';
import type { OrderDetail, PayResult, PaymentGatewayStatus, SimulatedPaymentResult } from '@/shared/types';
import { loginAs, resetWorld } from '@/test/helpers';
import { polyfillDialog, renderApp } from '@/test/renderApp';
import { PaymentRetryBlockedError } from './errors';
import PaymentReturnPage from './pages/PaymentReturnPage';
import { browserRedirect, resetPaymentKeys } from './payment';
import { recalledPaymentId, rememberPaymentId } from './payment-session';
import { isRetryableStatus, resetPaymentRetry, retryBlockReason, retryPayment } from './payment-retry';

/** Retry thanh toán: refetch đơn → chỉ retry khi còn Pending_Payment & chưa hết hạn → giao dịch MỚI + Idempotency-Key MỚI. */

const server = setupServer(...handlers);
beforeAll(() => {
  server.listen();
  polyfillDialog();
});
afterAll(() => server.close());
beforeEach(() => {
  resetWorld();
  resetPaymentKeys();
  resetPaymentRetry();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const NOW = Date.parse('2026-11-06T10:00:00Z');
const orderOf = (over: Partial<OrderDetail> = {}): OrderDetail =>
  ({ id: 42, branchId: 1, orderSource: 'Online', status: 'Pending_Payment', paymentStatus: 'Unpaid', finalAmount: 85_000, expiresAt: '2026-11-06T10:15:00Z', ...over }) as OrderDetail;
const failedVnpay = { paymentMethod: 'VNPay', idempotencyKey: 'old-key' } as const;

describe('retryBlockReason — đơn có được retry không', () => {
  it('Pending_Payment, chưa Paid, chưa hết hạn → cho retry', () => {
    expect(retryBlockReason(orderOf(), NOW)).toBeNull();
  });
  it('thiếu expiresAt → chưa có hạn, cho retry (server quyết định cuối)', () => {
    expect(retryBlockReason(orderOf({ expiresAt: null }), NOW)).toBeNull();
  });
  it.each([
    ['Pending', 'ORDER_NOT_PENDING_PAYMENT'],
    ['Cancelled', 'ORDER_NOT_PENDING_PAYMENT'],
    ['Completed', 'ORDER_NOT_PENDING_PAYMENT'],
  ] as const)('status %s → chặn %s', (status, code) => {
    expect(retryBlockReason(orderOf({ status }), NOW)?.code).toBe(code);
  });
  it('đã Paid → chặn ORDER_ALREADY_PAID (ưu tiên hơn status)', () => {
    expect(retryBlockReason(orderOf({ paymentStatus: 'Paid', status: 'Pending' }), NOW)?.code).toBe('ORDER_ALREADY_PAID');
  });
  it('quá hạn (và đúng hạn chót) → chặn ORDER_EXPIRED', () => {
    expect(retryBlockReason(orderOf({ expiresAt: '2026-11-06T09:59:59Z' }), NOW)?.code).toBe('ORDER_EXPIRED');
    expect(retryBlockReason(orderOf({ expiresAt: '2026-11-06T10:00:00Z' }), NOW)?.code).toBe('ORDER_EXPIRED');
  });
  it('không phải đơn Online → chặn', () => {
    expect(retryBlockReason(orderOf({ orderSource: 'QR' }), NOW)?.code).toBe('ORDER_NOT_PENDING_PAYMENT');
  });
  it('chỉ Failed/Cancelled/Expired là retry được', () => {
    expect(['Failed', 'Cancelled', 'Expired', 'Success', 'Pending'].map(isRetryableStatus)).toEqual([true, true, true, false, false]);
  });
});

describe('retryPayment — thứ tự gọi, key, chặn', () => {
  const next = { kind: 'gateway', path: '/payment/gateway?paymentId=2' } as const;

  it('refetch đơn TRƯỚC khi tạo giao dịch; dùng số tiền của đơn vừa lấy; key mới khác key cũ', async () => {
    const calls: string[] = [];
    const getOrder = vi.fn(async () => { calls.push('getOrder'); return orderOf({ finalAmount: 90_000 }); });
    const initiate = vi.fn(async () => { calls.push('initiate'); return next; });

    const r = await retryPayment(42, failedVnpay, { getOrder, initiate, now: () => NOW });

    expect(calls).toEqual(['getOrder', 'initiate']);
    expect(initiate).toHaveBeenCalledWith(expect.objectContaining({ id: 42, finalAmount: 90_000 }), 'card', { idempotencyKey: expect.any(String) });
    const key = (initiate.mock.calls[0] as unknown as [unknown, unknown, { idempotencyKey: string }])[2].idempotencyKey;
    expect(key).not.toBe('old-key');
    expect(r.next).toEqual(next);
  });

  it('mỗi lần retry thành công dùng key khác nhau', async () => {
    const keys: string[] = [];
    const initiate = vi.fn(async (_o: unknown, _c: unknown, o?: { idempotencyKey?: string }) => { keys.push(o?.idempotencyKey ?? ''); return next; });
    const deps = { getOrder: async () => orderOf(), initiate: initiate as never, now: () => NOW };
    await retryPayment(42, failedVnpay, deps);
    await retryPayment(42, failedVnpay, deps);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('lỗi mạng khi tạo giao dịch → lần bấm tiếp GIỮ key của lần retry đó (không tạo trùng); xong thì key lần sau mới', async () => {
    const keys: string[] = [];
    let fail = true;
    const initiate = vi.fn(async (_o: unknown, _c: unknown, o?: { idempotencyKey?: string }) => {
      keys.push(o?.idempotencyKey ?? '');
      if (fail) throw new Error('network');
      return next;
    });
    const deps = { getOrder: async () => orderOf(), initiate: initiate as never, now: () => NOW };
    await expect(retryPayment(42, failedVnpay, deps)).rejects.toThrow('network');
    fail = false;
    await retryPayment(42, failedVnpay, deps);
    await retryPayment(42, failedVnpay, deps);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it.each([
    ['không còn Pending_Payment', { status: 'Cancelled' } as const, 'ORDER_NOT_PENDING_PAYMENT'],
    ['đã hết hạn', { expiresAt: '2026-11-06T09:00:00Z' } as const, 'ORDER_EXPIRED'],
    ['đã thanh toán', { paymentStatus: 'Paid' } as const, 'ORDER_ALREADY_PAID'],
  ])('đơn %s → ném PaymentRetryBlockedError, KHÔNG gọi tạo giao dịch', async (_n, over, code) => {
    const initiate = vi.fn();
    const err = await retryPayment(42, failedVnpay, { getOrder: async () => orderOf(over), initiate: initiate as never, now: () => NOW }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymentRetryBlockedError);
    expect((err as PaymentRetryBlockedError).code).toBe(code);
    expect(initiate).not.toHaveBeenCalled();
  });

  it('GET đơn 404 → chặn ORDER_NOT_FOUND; lỗi mạng khi GET đơn → ném nguyên (KHÔNG kết luận đơn hỏng), không tạo giao dịch', async () => {
    const initiate = vi.fn();
    const notFound = await retryPayment(42, failedVnpay, { getOrder: async () => { throw new ApiError(404, { code: 'NOT_FOUND', message: 'x' }); }, initiate: initiate as never }).catch((e: unknown) => e);
    expect((notFound as PaymentRetryBlockedError).code).toBe('ORDER_NOT_FOUND');
    const net = await retryPayment(42, failedVnpay, { getOrder: async () => { throw new Error('offline'); }, initiate: initiate as never }).catch((e: unknown) => e);
    expect(net).not.toBeInstanceOf(PaymentRetryBlockedError);
    expect(initiate).not.toHaveBeenCalled();
  });

  it('server trả 409 ORDER_NOT_PAYABLE / ORDER_ALREADY_PAID khi tạo giao dịch → chặn tương ứng', async () => {
    const mk = (code: string) => async () => { throw new ApiError(409, { code, message: 'x' }); };
    const a = await retryPayment(42, failedVnpay, { getOrder: async () => orderOf(), initiate: mk('ORDER_NOT_PAYABLE') as never, now: () => NOW }).catch((e: unknown) => e);
    const b = await retryPayment(42, failedVnpay, { getOrder: async () => orderOf(), initiate: mk('ORDER_ALREADY_PAID') as never, now: () => NOW }).catch((e: unknown) => e);
    expect((a as PaymentRetryBlockedError).code).toBe('ORDER_NOT_PENDING_PAYMENT');
    expect((b as PaymentRetryBlockedError).code).toBe('ORDER_ALREADY_PAID');
  });

  it('phương thức giao dịch cũ không phải VNPay/Momo (COD/Cash) → chặn, không gọi gì', async () => {
    const getOrder = vi.fn();
    const err = await retryPayment(42, { paymentMethod: 'COD', idempotencyKey: null }, { getOrder: getOrder as never }).catch((e: unknown) => e);
    expect((err as PaymentRetryBlockedError).code).toBe('PAYMENT_METHOD_UNSUPPORTED');
    expect(getOrder).not.toHaveBeenCalled();
  });

  it('hai lần gọi đồng thời cho cùng đơn chỉ chạy một lần', async () => {
    const initiate = vi.fn(async () => next);
    const deps = { getOrder: async () => orderOf(), initiate: initiate as never, now: () => NOW };
    await Promise.all([retryPayment(42, failedVnpay, deps), retryPayment(42, failedVnpay, deps)]);
    expect(initiate).toHaveBeenCalledTimes(1);
  });
});

describe('PaymentReturnPage — nút "Thử thanh toán lại" (retry giả lập)', () => {
  const payResult = (status: PaymentGatewayStatus): PayResult => ({
    payment: { id: 9, status, paymentMethod: 'VNPay', amount: 85_000, transactionId: null, idempotencyKey: 'old-key', paidAt: null } as PayResult['payment'],
    allocations: [{ id: 1, paymentId: 9, orderId: 42, allocatedAmount: 85_000, createdAt: '' }],
    redirectUrl: null,
    invoice: null,
  });
  function mount(status: PaymentGatewayStatus, retry = vi.fn()) {
    rememberPaymentId(42, 9);
    render(
      <MemoryRouter initialEntries={['/payment/42/return']}>
        <Routes>
          <Route path="/payment/:orderId/return" element={<PaymentReturnPage fetchPayment={vi.fn().mockResolvedValue(payResult(status)) as never} retry={retry as never} />} />
          <Route path="/payment/gateway" element={<h1>Cổng giả lập</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    return retry;
  }

  it.each(['Failed', 'Cancelled', 'Expired'] as const)('%s → có nút thử lại', async (status) => {
    mount(status);
    expect(await screen.findByRole('button', { name: 'Thử thanh toán lại' })).toBeTruthy();
  });

  it.each(['Success', 'Pending'] as const)('%s → KHÔNG có nút thử lại', async (status) => {
    mount(status);
    await screen.findByRole('heading');
    expect(screen.queryByRole('button', { name: 'Thử thanh toán lại' })).toBeNull();
  });

  it('bị chặn (đơn hết hạn) → hiện thông báo, ẩn nút, không điều hướng', async () => {
    const retry = vi.fn().mockRejectedValue(new PaymentRetryBlockedError('ORDER_EXPIRED', 'Đơn hàng đã quá hạn thanh toán nên không thể thanh toán lại. Vui lòng đặt đơn mới.'));
    mount('Failed', retry);
    fireEvent.click(await screen.findByRole('button', { name: 'Thử thanh toán lại' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/quá hạn thanh toán nên không thể thanh toán lại/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Thử thanh toán lại' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Theo dõi đơn hàng' })).toBeTruthy();
  });

  it('lỗi tạm thời → báo lỗi nhưng nút vẫn còn để bấm lại', async () => {
    const retry = vi.fn().mockRejectedValue(new Error('network'));
    mount('Cancelled', retry);
    fireEvent.click(await screen.findByRole('button', { name: 'Thử thanh toán lại' }));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: 'Thử thanh toán lại' })).toBeTruthy();
  });

  it('thành công (mock) → điều hướng tới cổng; redirect ngoài app chỉ ở chế độ thật', async () => {
    const retry = vi.fn().mockResolvedValue({ order: orderOf(), next: { kind: 'gateway', path: '/payment/gateway?paymentId=2' } });
    const assign = vi.spyOn(browserRedirect, 'assign').mockImplementation(() => undefined);
    mount('Failed', retry);
    fireEvent.click(await screen.findByRole('button', { name: 'Thử thanh toán lại' }));
    expect(await screen.findByRole('heading', { name: 'Cổng giả lập' })).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  it('thành công (thật) → browserRedirect.assign tới payment_url mới', async () => {
    const retry = vi.fn().mockResolvedValue({ order: orderOf(), next: { kind: 'external', url: 'https://pay.example/new' } });
    const assign = vi.spyOn(browserRedirect, 'assign').mockImplementation(() => undefined);
    mount('Expired', retry);
    fireEvent.click(await screen.findByRole('button', { name: 'Thử thanh toán lại' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://pay.example/new'));
  });

  it('bấm đôi nhanh chỉ gọi retry một lần', async () => {
    let release: (v: unknown) => void = () => undefined;
    const retry = vi.fn(() => new Promise((r) => { release = r; }));
    mount('Failed', retry as never);
    const btn = await screen.findByRole('button', { name: 'Thử thanh toán lại' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(retry).toHaveBeenCalledTimes(1);
    await act(async () => { release({ order: orderOf(), next: { kind: 'gateway', path: '/payment/gateway' } }); });
  });
});

describe('Retry qua router + MSW thật (POST /payments mới, đơn thật trong mock)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_USE_MOCK', 'true'); // mock: payment_url → cổng giả lập trong app (như checkout)
  });
  async function failedPayment(final: 'failed' | 'cancelled' | 'expired' = 'failed') {
    loginAs('Customer', { id: 'u-customer', fullName: 'Nguyễn Văn A', phone: '0901234567' });
    const ctx = { source: 'Online', fulfillmentType: 'Pickup' } as const;
    const cart = await orderApi.ensureCart(ctx, 1);
    await orderApi.addCartItem(ctx, { variantId: 12, quantity: 2, options: [{ optionId: 101 }, { optionId: 104 }] });
    const order = await orderApi.createOnlineOrder(
      { cartId: cart.id, fulfillmentType: 'Pickup', branchId: 1 },
      { idempotencyKey: 'idem-retry-order', mockPaymentMethod: 'VNPay' },
    );
    const created = await paymentApi.createPayment(
      { branchId: 1, paymentMethod: 'VNPay', allocations: [{ orderId: order.id, allocatedAmount: order.finalAmount }], returnUrl: `http://localhost:5173/payment/${order.id}/return` },
      { idempotencyKey: 'idem-pay-first' },
    );
    rememberPaymentId(order.id, created.payment.id);
    // Mock IPN nhận cả 'cancelled' (handler/SIMULATED_RESULTS) dù type dùng chung SimulatedPaymentResult chưa liệt kê.
    await paymentApi.simulatePayment(created.payment.id, { result: final as SimulatedPaymentResult });
    return { order, firstId: created.payment.id };
  }

  it('Failed → bấm thử lại: giao dịch MỚI cho cùng đơn, key mới, giao dịch cũ giữ nguyên, sang cổng với id mới', async () => {
    const { order, firstId } = await failedPayment('failed');
    const { router } = renderApp(`/payment/${order.id}/return`);

    fireEvent.click(await screen.findByRole('button', { name: 'Thử thanh toán lại' }));
    await waitFor(() => expect(router.state.location.pathname).not.toBe(`/payment/${order.id}/return`));

    const mine = db.allocations.filter((a) => a.orderId === order.id).map((a) => db.payments.find((p) => p.id === a.paymentId)!);
    expect(mine).toHaveLength(2);
    const [old, fresh] = mine;
    expect(old!.id).toBe(firstId);
    expect(old!.status).toBe('Failed'); // không bị tái sử dụng/sửa
    expect(fresh!.id).not.toBe(firstId);
    expect(fresh!.status).toBe('Pending');
    expect(fresh!.idempotencyKey).toBeTruthy();
    expect(fresh!.idempotencyKey).not.toBe(old!.idempotencyKey);
    expect(fresh!.amount).toBe(order.finalAmount);
    expect(recalledPaymentId(order.id)).toBe(fresh!.id); // trang return sau đó sẽ polling giao dịch mới
    expect(router.state.location.search).toContain(`${fresh!.id}`);
  });

  it('Cancelled cũng retry được', async () => {
    const { order } = await failedPayment('cancelled');
    const { router } = renderApp(`/payment/${order.id}/return`);
    fireEvent.click(await screen.findByRole('button', { name: 'Thử thanh toán lại' }));
    await waitFor(() => expect(router.state.location.pathname).not.toBe(`/payment/${order.id}/return`));
    expect(db.allocations.filter((a) => a.orderId === order.id)).toHaveLength(2);
  });

  it('đơn hết hạn (refetch thấy expiresAt quá khứ) → chặn, KHÔNG POST /payments', async () => {
    const { order } = await failedPayment('expired');
    db.orders.find((o) => o.id === order.id)!.expiresAt = '2020-01-01 00:00:00';
    const posts = vi.fn();
    server.events.on('request:start', ({ request }) => { if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/payments')) posts(); });
    renderApp(`/payment/${order.id}/return`);

    fireEvent.click(await screen.findByRole('button', { name: 'Thử thanh toán lại' }));
    expect(await screen.findByText(/quá hạn thanh toán nên không thể thanh toán lại/)).toBeTruthy();
    expect(posts).not.toHaveBeenCalled();
    expect(db.allocations.filter((a) => a.orderId === order.id)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Thử thanh toán lại' })).toBeNull();
  });

  it('đơn không còn Pending_Payment (đã Cancelled phía server) → chặn, không tạo giao dịch', async () => {
    const { order } = await failedPayment('failed');
    db.orders.find((o) => o.id === order.id)!.status = 'Cancelled';
    renderApp(`/payment/${order.id}/return`);
    fireEvent.click(await screen.findByRole('button', { name: 'Thử thanh toán lại' }));
    expect(await screen.findByText(/không còn ở trạng thái chờ thanh toán/)).toBeTruthy();
    expect(db.allocations.filter((a) => a.orderId === order.id)).toHaveLength(1);
  });

  it('đơn đã được trả bằng nơi khác (Paid) → chặn, không tạo giao dịch', async () => {
    const { order } = await failedPayment('failed');
    db.orders.find((o) => o.id === order.id)!.paymentStatus = 'Paid';
    renderApp(`/payment/${order.id}/return`);
    fireEvent.click(await screen.findByRole('button', { name: 'Thử thanh toán lại' }));
    expect(await screen.findByText(/đã được thanh toán/)).toBeTruthy();
    expect(db.allocations.filter((a) => a.orderId === order.id)).toHaveLength(1);
  });
});
