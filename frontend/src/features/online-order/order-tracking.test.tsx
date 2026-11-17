// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { delay, http as mswHttp, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureHttp } from '@/shared/api';
import OrderTrackingPage from './pages/OrderTrackingPage';

/**
 * Trang theo dõi đơn: chạy trên client thật (myOrderApi) + MSW riêng của file này (không phụ thuộc seed),
 * nên kiểm được cả path/header/envelope của GET /orders/me/{id} và GET /orders/{id}/history.
 */
const U = (p: string) => `http://localhost/api${p}`;
const server = setupServer();
beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(() => configureHttp({ getToken: () => 'tok-customer', onUnauthorized: undefined, refresh: undefined }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

const envelope = (data: unknown, status = 200) => HttpResponse.json({ success: true, data, meta: null, trace_id: 't-1' }, { status });
const errorEnvelope = (status: number, code: string, message: string) =>
  HttpResponse.json({ success: false, error: { code, message }, trace_id: 't-err' }, { status });

const item = {
  id: 1, order_id: 42, product_id: 1, variant_id: 12, product_name: 'Cà phê sữa đá', variant_name: 'M', quantity: 2,
  unit_price: '35000.00', options_unit_total: '10000.00', discount_amount: '0.00', is_reward_item: false, line_total: '90000.00', note: 'ít đá',
  options: [{ id: 1, order_item_id: 1, option_id: 104, option_name: 'Trân châu', quantity: 1, unit_price: '10000.00' }],
};

function wireOrder(over: Record<string, unknown> = {}) {
  return {
    id: 42, order_code: 'ORD-0042', branch_id: 1, order_source: 'Online', fulfillment_type: 'Delivery',
    delivery_name: 'Nguyễn An', delivery_phone: '0901234567', delivery_address: '12 Lê Lợi, Q1',
    sub_total: '90000.00', item_discount_amount: '0.00', voucher_discount_amount: '0.00', delivery_fee: '15000.00',
    vat_amount: '0.00', final_amount: '105000.00', status: 'Pending', payment_status: 'Paid', version: 2,
    created_at: '2026-11-07T03:30:00Z', updated_at: '2026-11-07T03:35:00Z', items: [item], status_history: [], ...over,
  };
}
let hid = 0;
const h = (status: string, createdAt: string, over: Record<string, unknown> = {}) => ({
  id: ++hid, order_id: 42, from_status: null, status, changed_by: null, note: null, created_at: createdAt, ...over,
});

interface Seen { path: string; auth: string | null; guest: string | null }
function mockApi(order: Record<string, unknown>, history: unknown[]) {
  const seen: Seen[] = [];
  const rec = (r: Request) => seen.push({ path: new URL(r.url).pathname, auth: r.headers.get('Authorization'), guest: r.headers.get('X-Table-Session-Code') });
  server.use(
    mswHttp.get(U('/orders/me/:id'), ({ request }) => (rec(request), envelope(order))),
    mswHttp.get(U('/orders/:id/history'), ({ request }) => (rec(request), envelope(history))),
  );
  return seen;
}

function mount(orderId = '42') {
  const client = new QueryClient({ defaultOptions: { queries: { refetchInterval: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/orders/${orderId}`]}>
        <Routes>
          <Route path="/orders/:orderId" element={<OrderTrackingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const steps = async () => within(await screen.findByRole('list', { name: 'Lịch sử trạng thái' })).getAllByRole('listitem');
const stepLabels = async () => (await steps()).map((li) => li.getAttribute('data-status'));

describe('API detail/history', () => {
  it('gọi GET /orders/me/42 và GET /orders/42/history với Bearer, không gửi header guest', async () => {
    const seen = mockApi(wireOrder(), [h('Pending', '2026-11-07T03:30:00Z')]);
    mount();
    await steps();
    expect(seen.map((s) => s.path).sort()).toEqual(['/api/orders/42/history', '/api/orders/me/42']);
    for (const s of seen) {
      expect(s.auth).toBe('Bearer tok-customer');
      expect(s.guest).toBeNull();
    }
  });

  it('id không hợp lệ → báo lỗi, KHÔNG gọi API', async () => {
    const seen = mockApi(wireOrder(), []);
    mount('abc');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(seen).toHaveLength(0);
  });

  it('timeline giữ thứ tự cũ → mới dù server trả lẫn lộn', async () => {
    mockApi(wireOrder({ status: 'Confirmed' }), [
      h('Confirmed', '2026-11-07T03:40:00Z'),
      h('Pending', '2026-11-07T03:30:00Z'),
    ]);
    mount();
    expect(await stepLabels()).toEqual(['Pending', 'Confirmed']);
  });
});

describe('thông tin đơn', () => {
  it('hiện mã đơn, giờ đặt (giờ VN), món + số lượng + option, tổng tiền, order status và payment status', async () => {
    mockApi(wireOrder({ status: 'Confirmed', payment_status: 'Paid' }), [h('Pending', '2026-11-07T03:30:00Z'), h('Confirmed', '2026-11-07T03:35:00Z')]);
    mount();
    expect(await screen.findByText('#ORD-0042')).toBeTruthy();
    expect(screen.getByText(/Đặt lúc/).textContent).toContain('10:30'); // 03:30Z = 10:30 VN
    expect(screen.getByText(/Cà phê sữa đá/).textContent).toContain('(M)');
    expect(screen.getByLabelText('Số lượng 2').textContent).toBe('2x');
    expect(screen.getByText('Trân châu')).toBeTruthy();
    expect(screen.getByText('Ghi chú: ít đá')).toBeTruthy();
    expect(screen.getAllByText('90.000đ')).toHaveLength(2); // dòng món + tạm tính
    expect(screen.getByText('Phí giao hàng')).toBeTruthy();
    expect(screen.getByText('105.000đ')).toBeTruthy();
    expect(screen.getByLabelText('Trạng thái đơn').textContent).toBe('Quán đã xác nhận');
    expect(screen.getByLabelText('Trạng thái thanh toán').textContent).toBe('Đã thanh toán');
    expect(screen.getByText('Giao tới')).toBeTruthy();
  });

  it('thời gian timeline: timestamp không timezone vẫn ra giờ VN', async () => {
    mockApi(wireOrder(), [h('Pending', '2026-11-07 03:30:00')]);
    mount();
    const [li] = await steps();
    expect(li.textContent).toContain('10:30');
  });

  it('payment_status KHÔNG quyết định tiến trình: Paid + Pending vẫn là "Đã nhận đơn", Unpaid + Preparing vẫn "Đang pha chế"', async () => {
    mockApi(wireOrder({ status: 'Pending', payment_status: 'Paid' }), [h('Pending', '2026-11-07T03:30:00Z')]);
    mount();
    await steps();
    expect(screen.getByLabelText('Trạng thái đơn').textContent).toBe('Đã nhận đơn');
    expect(await stepLabels()).toEqual(['Pending']);
    cleanup();

    mockApi(wireOrder({ status: 'Preparing', payment_status: 'Unpaid', fulfillment_type: 'Pickup' }), [h('Pending', '2026-11-07T03:30:00Z'), h('Preparing', '2026-11-07T03:40:00Z')]);
    mount();
    expect(await stepLabels()).toEqual(['Pending', 'Preparing']);
    expect(screen.getByLabelText('Trạng thái đơn').textContent).toBe('Đang pha chế');
    expect(screen.getByLabelText('Trạng thái thanh toán').textContent).toBe('Chưa thanh toán');
  });
});

describe('các trạng thái', () => {
  it('Pending_Payment: chờ thanh toán, hiện hạn thanh toán, timeline chỉ có đúng 1 dòng thật', async () => {
    mockApi(
      wireOrder({ status: 'Pending_Payment', payment_status: 'Unpaid', expires_at: '2026-11-07T03:45:00Z' }),
      [h('Pending_Payment', '2026-11-07T03:30:00Z')],
    );
    mount();
    expect(await stepLabels()).toEqual(['Pending_Payment']);
    expect(screen.getByLabelText('Trạng thái đơn').textContent).toBe('Chờ thanh toán');
    expect(screen.getByLabelText('Trạng thái thanh toán').textContent).toBe('Chưa thanh toán');
    expect(screen.getByText(/Vui lòng thanh toán trước.*10:45/)).toBeTruthy();
    const [li] = await steps();
    expect(li.getAttribute('aria-current')).toBe('step');
  });

  it('Served (Dine-in): nhãn "Đã phục vụ", nhãn "Tại quán · Bàn", không có khối giao hàng / đặt thêm món', async () => {
    mockApi(
      wireOrder({ order_source: 'QR', fulfillment_type: 'Dine_In', table_number: 'A5', status: 'Served', delivery_name: null, delivery_fee: '0.00', final_amount: '90000.00' }),
      [
        h('Pending', '2026-11-07T03:30:00Z'), h('Confirmed', '2026-11-07T03:31:00Z'), h('Preparing', '2026-11-07T03:32:00Z'),
        h('Ready', '2026-11-07T03:40:00Z'), h('Served', '2026-11-07T03:41:00Z'),
      ],
    );
    mount();
    expect(await stepLabels()).toEqual(['Pending', 'Confirmed', 'Preparing', 'Ready', 'Served']);
    const lis = await steps();
    expect(lis[3].textContent).toContain('Món đã xong');
    expect(lis[4].textContent).toContain('Đã phục vụ');
    expect(lis[4].getAttribute('aria-current')).toBe('step');
    expect(screen.getByLabelText('Trạng thái đơn').textContent).toBe('Đã phục vụ');
    expect(screen.getByText('Tại quán · Bàn A5')).toBeTruthy();
    expect(screen.queryByText('Giao tới')).toBeNull();
    expect(screen.queryByText('Đặt thêm món')).toBeNull();
  });

  it('Completed (Online Delivery): đủ chuỗi tới Shipping → Completed, nhãn "Online · Giao hàng"', async () => {
    mockApi(
      wireOrder({ status: 'Completed', completed_at: '2026-11-07T04:20:00Z' }),
      [
        h('Pending', '2026-11-07T03:30:00Z'), h('Confirmed', '2026-11-07T03:31:00Z'), h('Preparing', '2026-11-07T03:32:00Z'),
        h('Ready', '2026-11-07T03:50:00Z'), h('Shipping', '2026-11-07T03:55:00Z'), h('Completed', '2026-11-07T04:20:00Z'),
      ],
    );
    mount();
    expect(await stepLabels()).toEqual(['Pending', 'Confirmed', 'Preparing', 'Ready', 'Shipping', 'Completed']);
    const lis = await steps();
    expect(lis[4].textContent).toContain('Đang giao hàng');
    expect(lis[5].textContent).toContain('Hoàn tất');
    expect(lis[5].textContent).toContain('11:20'); // 04:20Z
    expect(lis[5].getAttribute('aria-current')).toBe('step');
    expect(lis[4].getAttribute('aria-current')).toBeNull();
    expect(screen.getByText('Online · Giao hàng')).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Đơn không được thực hiện' })).toBeNull();
    expect(screen.getByText('Đặt thêm món')).toBeTruthy();
  });

  it('Pickup Online: nhãn "Mang đi", không có khối giao tới', async () => {
    mockApi(wireOrder({ fulfillment_type: 'Pickup', status: 'Ready' }), [h('Pending', '2026-11-07T03:30:00Z'), h('Ready', '2026-11-07T03:50:00Z')]);
    mount();
    await steps();
    expect(screen.getByText('Online · Mang đi')).toBeTruthy();
    expect(screen.getByLabelText('Trạng thái đơn').textContent).toBe('Sẵn sàng nhận món');
    expect(screen.queryByText('Giao tới')).toBeNull();
  });

  it('Cancelled: banner huỷ + lý do + giờ, dòng cuối timeline là Cancelled (kiểu lỗi), không lặp lý do', async () => {
    mockApi(
      wireOrder({ status: 'Cancelled', payment_status: 'Unpaid', cancel_reason: 'Đổi ý', cancelled_at: '2026-11-07T03:33:00Z' }),
      [h('Pending', '2026-11-07T03:30:00Z'), h('Cancelled', '2026-11-07T03:33:00Z', { from_status: 'Pending', note: 'Đổi ý' })],
    );
    mount();
    expect(await stepLabels()).toEqual(['Pending', 'Cancelled']);
    const banner = screen.getByRole('status', { name: 'Đơn không được thực hiện' });
    expect(banner.textContent).toContain('Đơn đã được huỷ');
    expect(banner.textContent).toContain('Lý do: Đổi ý');
    expect(banner.textContent).toContain('10:33');
    expect(screen.getAllByText(/Đổi ý/)).toHaveLength(1); // chỉ ở banner
    const lis = await steps();
    expect(lis[1].textContent).toContain('Đã huỷ');
    expect(lis[1].getAttribute('aria-current')).toBe('step');
    expect(screen.getByLabelText('Trạng thái đơn').textContent).toBe('Đã huỷ');
  });

  it('Rejected: banner "Quán đã từ chối", lý do; đơn đã Paid vẫn chỉ hiện thông tin thanh toán, không đổi tiến trình', async () => {
    mockApi(
      wireOrder({ status: 'Rejected', payment_status: 'Paid', cancel_reason: 'Hết nguyên liệu' }),
      [h('Pending', '2026-11-07T03:30:00Z'), h('Rejected', '2026-11-07T03:33:00Z', { changed_by: 'staff-1' })],
    );
    mount();
    expect(await stepLabels()).toEqual(['Pending', 'Rejected']);
    const banner = screen.getByRole('status', { name: 'Đơn không được thực hiện' });
    expect(banner.textContent).toContain('Quán đã từ chối đơn này');
    expect(banner.textContent).toContain('Lý do: Hết nguyên liệu');
    expect(banner.textContent).toContain('Thanh toán: Đã thanh toán');
  });
});

describe('history rỗng / đang cập nhật', () => {
  it('history [] → empty state, KHÔNG tự dựng dòng từ order.status; chi tiết đơn vẫn hiện', async () => {
    mockApi(wireOrder({ status: 'Confirmed' }), []);
    mount();
    expect(await screen.findByText('Chưa có lịch sử trạng thái cho đơn này.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Lịch sử trạng thái' })).toBeNull();
    expect(screen.getByText('#ORD-0042')).toBeTruthy();
    expect(screen.getByLabelText('Trạng thái đơn').textContent).toBe('Quán đã xác nhận');
  });

  it('history chậm hơn detail: không có dòng nào đến khi history về; không aria-current khi lệch trạng thái', async () => {
    mockApi(wireOrder({ status: 'Confirmed' }), [h('Pending', '2026-11-07T03:30:00Z')]);
    // History cũ (chưa có Confirmed) lúc đầu, lần gọi sau mới đủ → trang phải tự lấy lại đúng 1 lần.
    let calls = 0;
    server.use(
      mswHttp.get(U('/orders/:id/history'), () => {
        calls += 1;
        return envelope(calls === 1 ? [h('Pending', '2026-11-07T03:30:00Z')] : [h('Pending', '2026-11-07T03:30:00Z'), h('Confirmed', '2026-11-07T03:35:00Z')]);
      }),
    );
    mount();
    expect(await stepLabels()).toBeTruthy();
    await waitFor(async () => expect(await stepLabels()).toEqual(['Pending', 'Confirmed']));
    expect(calls).toBe(2);
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toBe(2); // không lặp vô hạn
  });
});

describe('loading / error', () => {
  it('loading: skeleton cho đơn, rồi skeleton riêng cho timeline', async () => {
    server.use(
      mswHttp.get(U('/orders/me/:id'), async () => (await delay(30), envelope(wireOrder()))),
      mswHttp.get(U('/orders/:id/history'), async () => (await delay(250), envelope([h('Pending', '2026-11-07T03:30:00Z')]))),
    );
    mount();
    expect(screen.getByLabelText('Đang tải đơn hàng')).toBeTruthy();
    expect(screen.queryByText('#ORD-0042')).toBeNull();
    expect(await screen.findByText('#ORD-0042')).toBeTruthy();
    expect(screen.getByLabelText('Đang tải lịch sử đơn hàng')).toBeTruthy();
    expect(await steps()).toHaveLength(1);
    expect(screen.queryByLabelText('Đang tải lịch sử đơn hàng')).toBeNull();
  });

  it('detail lỗi 500: thông báo + "Thử lại" gọi lại được', async () => {
    let fail = true;
    server.use(
      mswHttp.get(U('/orders/me/:id'), () => (fail ? errorEnvelope(500, 'INTERNAL', 'boom') : envelope(wireOrder()))),
      mswHttp.get(U('/orders/:id/history'), () => envelope([h('Pending', '2026-11-07T03:30:00Z')])),
    );
    mount();
    const alert = await screen.findByRole('alert', undefined, { timeout: 4000 });
    expect(within(alert).getByText('Không tải được đơn hàng')).toBeTruthy();
    expect(screen.queryByText('Trạng thái đơn hàng')).toBeNull(); // không dựng timeline khi chưa có đơn
    fail = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('#ORD-0042')).toBeTruthy();
  });

  it('404 (không phải chủ đơn / không tồn tại): "Không tìm thấy đơn hàng", không có nút thử lại, không retry', async () => {
    let calls = 0;
    server.use(
      mswHttp.get(U('/orders/me/:id'), () => (calls++, errorEnvelope(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn'))),
      mswHttp.get(U('/orders/:id/history'), () => errorEnvelope(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn')),
    );
    mount();
    expect(await screen.findByText('Không tìm thấy đơn hàng')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(calls).toBe(1);
  });

  it('history lỗi: đơn vẫn hiện, timeline có lỗi riêng + "Tải lại lịch sử" phục hồi được', async () => {
    let fail = true;
    server.use(
      mswHttp.get(U('/orders/me/:id'), () => envelope(wireOrder())),
      mswHttp.get(U('/orders/:id/history'), () => (fail ? errorEnvelope(500, 'INTERNAL', 'boom') : envelope([h('Pending', '2026-11-07T03:30:00Z')]))),
    );
    mount();
    expect(await screen.findByText('#ORD-0042')).toBeTruthy();
    expect(await screen.findByText('Không tải được lịch sử trạng thái.', undefined, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText('Món đã đặt')).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại lịch sử' }));
    expect(await steps()).toHaveLength(1);
  });

  it('phản hồi sai shape (status lạ) → lỗi, không hiển thị bừa', async () => {
    mockApi(wireOrder({ status: 'Serving' }), []);
    mount();
    expect(await screen.findByRole('alert', undefined, { timeout: 4000 })).toBeTruthy();
    expect(screen.queryByText('#ORD-0042')).toBeNull();
  });
});
