// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLineKey } from '@/features/dine-in/cart';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { url } from '@/mocks/utils';
import { latte, loginAs, resetWorld } from '@/test/helpers';
import { polyfillDialog, renderApp } from '@/test/renderApp';
import { browserRedirect, needsGateway, resetPaymentKeys, toPaymentMethod } from './payment';
import { useOnlineCartStore } from './store';

/** Khởi tạo thanh toán ở checkout Online: mapping, COD không gọi API, payload POST /payments, redirect thật/mock. */

const server = setupServer(...handlers);
const requests: string[] = [];
beforeAll(() => {
  server.listen();
  polyfillDialog();
  server.events.on('request:start', ({ request }) => requests.push(`${request.method} ${new URL(request.url).pathname}`));
});
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  resetWorld();
  resetPaymentKeys();
  requests.length = 0;
  loginAs('Customer', { id: 'u-customer', fullName: 'Nguyễn Văn A', phone: '0901234567' });
  useOnlineCartStore.setState({
    fulfillmentType: 'Pickup',
    lines: [{ ...latte, key: buildLineKey(latte), quantity: 2 }],
    voucherCode: null,
  });
});

const paymentPosts = () => requests.filter((r) => r === 'POST /api/payments');
const EXTERNAL_URL = 'https://pay.example/vnpay?x=1';

interface Seen { body: Record<string, unknown>; headers: Headers }
/** Thay POST /payments bằng bản ghi payload + trả payment_url ngoài (mô phỏng backend thật). */
function captureCreatePayment(): { seen: Seen[] } {
  const seen: Seen[] = [];
  server.use(
    http.post(url('/payments'), async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      seen.push({ body, headers: request.headers });
      const alloc = (body.allocations as { order_id: number; allocated_amount: number }[])[0]!;
      return HttpResponse.json(
        {
          success: true,
          meta: null,
          trace_id: 't-1',
          data: {
            id: 9, branch_id: body.branch_id, payment_method: body.payment_method, amount: `${alloc.allocated_amount}.00`, status: 'Pending',
            expires_at: '2026-11-06T10:15:00Z', created_at: '2026-11-06T10:00:00Z', updated_at: '2026-11-06T10:00:00Z',
            payment_url: EXTERNAL_URL, allocations: [{ id: 1, order_id: alloc.order_id, allocated_amount: `${alloc.allocated_amount}.00` }],
          },
        },
        { status: 201 },
      );
    }),
  );
  return { seen };
}

async function choose(label: RegExp) {
  fireEvent.click(await screen.findByRole('radio', { name: label }));
  const button = screen.getByRole('button', { name: /^(Đặt hàng|Thử lại)$/ });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button);
}

describe('mapping lựa chọn UI → Payment_Method', () => {
  it('Visa/Master → VNPay, MoMo → Momo, COD → COD; chỉ VNPay/Momo cần cổng', () => {
    expect(toPaymentMethod('card')).toBe('VNPay');
    expect(toPaymentMethod('momo')).toBe('Momo');
    expect(toPaymentMethod('cod')).toBe('COD');
    expect([needsGateway('card'), needsGateway('momo'), needsGateway('cod')]).toEqual([true, true, false]);
  });
});

describe('COD', () => {
  it('không gọi POST /payments; giữ luồng sang màn thành công', async () => {
    const assign = vi.spyOn(browserRedirect, 'assign').mockImplementation(() => undefined);
    const { router } = renderApp('/checkout');
    await choose(/Tiền mặt khi nhận hàng/);

    expect(await screen.findByText('Đặt hàng thành công!')).toBeTruthy();
    expect(router.state.location.pathname).toMatch(/^\/payment\/\d+\/success$/);
    expect(paymentPosts()).toHaveLength(0);
    expect(requests.filter((r) => /\/payments?(\/|$)/.test(r))).toEqual([]);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('VNPay / Momo: payload POST /payments (chế độ thật)', () => {
  it('Visa/Master → VNPay: đúng payload + Idempotency-Key; số tiền lấy từ đơn; không user_id/voucher/guest header', async () => {
    const { seen } = captureCreatePayment();
    vi.spyOn(browserRedirect, 'assign').mockImplementation(() => undefined);
    renderApp('/checkout');
    await choose(/Thẻ ngân hàng/);

    await waitFor(() => expect(seen).toHaveLength(1));
    const order = db.orders[0]!;
    const { body, headers } = seen[0]!;
    expect(body).toEqual({
      branch_id: order.branchId,
      payment_method: 'VNPay',
      allocations: [{ order_id: order.id, allocated_amount: order.finalAmount }],
      return_url: `${window.location.origin}/payment/${order.id}/return`,
    });
    expect(headers.get('Idempotency-Key')).toEqual(expect.any(String));
    expect(headers.get('Idempotency-Key')!.length).toBeGreaterThan(8);
    expect(headers.get('Authorization')).toMatch(/^Bearer /);
    for (const k of ['user_id', 'voucher_code', 'voucherCode', 'userId']) expect(body).not.toHaveProperty(k);
    for (const h of ['x-table-session-code', 'x-guest-session', 'x-guest-id']) expect(headers.has(h)).toBe(false);
  });

  it('MoMo → Momo', async () => {
    const { seen } = captureCreatePayment();
    vi.spyOn(browserRedirect, 'assign').mockImplementation(() => undefined);
    renderApp('/checkout');
    await choose(/Ví MoMo/);
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]!.body.payment_method).toBe('Momo');
  });
});

describe('redirect', () => {
  it('chế độ thật: window.location.assign(payment_url), không điều hướng sang màn thành công', async () => {
    captureCreatePayment();
    const assign = vi.spyOn(browserRedirect, 'assign').mockImplementation(() => undefined);
    const { router } = renderApp('/checkout');
    await choose(/Thẻ ngân hàng/);

    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(assign).toHaveBeenCalledWith(EXTERNAL_URL);
    expect(router.state.location.pathname).toBe('/checkout');
    expect(screen.queryByText('Đặt hàng thành công!')).toBeNull();
  });

  it('chế độ mock: vào PaymentGatewayPage hiện có (không redirect ra ngoài); giao dịch Pending được tạo', async () => {
    vi.stubEnv('VITE_USE_MOCK', 'true');
    const assign = vi.spyOn(browserRedirect, 'assign').mockImplementation(() => undefined);
    const { router } = renderApp('/checkout');
    await choose(/Ví MoMo/);

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/payment\/\d+$/));
    const order = db.orders[0]!;
    expect(order).toMatchObject({ status: 'Pending_Payment', paymentStatus: 'Unpaid' });
    expect(router.state.location.pathname).toBe(`/payment/${order.id}`);
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get('paymentId')).toBe(String(db.payments[0]!.id));
    expect(params.get('gateway')).toBe('momo');
    expect(db.payments).toHaveLength(1);
    expect(db.payments[0]).toMatchObject({ paymentMethod: 'Momo', status: 'Pending' });
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('lỗi khi khởi tạo thanh toán', () => {
  it('đơn đã tạo: bấm "Thử lại" chỉ gọi lại POST /payments, không tạo đơn thứ hai và dùng lại cùng Idempotency-Key', async () => {
    const seen: string[] = [];
    let n = 0;
    server.use(
      http.post(url('/payments'), ({ request }) => {
        seen.push(request.headers.get('Idempotency-Key') ?? '');
        if (++n === 1) return HttpResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Lỗi máy chủ' }, trace_id: 't-e' }, { status: 500 });
        return HttpResponse.json(
          { success: true, meta: null, trace_id: 't-2', data: { id: 9, branch_id: 1, payment_method: 'VNPay', amount: '1.00', status: 'Pending', payment_url: EXTERNAL_URL, allocations: [] } },
          { status: 201 },
        );
      }),
    );
    const assign = vi.spyOn(browserRedirect, 'assign').mockImplementation(() => undefined);
    renderApp('/checkout');
    await choose(/Thẻ ngân hàng/);

    expect(await screen.findByText('Chưa thể đặt hàng')).toBeTruthy();
    const retry = await screen.findByRole('button', { name: 'Thử lại' });
    await waitFor(() => expect((retry as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(retry);

    await waitFor(() => expect(assign).toHaveBeenCalledWith(EXTERNAL_URL));
    expect(db.orders).toHaveLength(1);
    expect(requests.filter((r) => r === 'POST /api/orders')).toHaveLength(1);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
  });
});
