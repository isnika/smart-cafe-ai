// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { configureHttp } from '@/shared/api';
import type { MyOrderSummary } from '@/shared/api/order-me.types';
import { loginAs, resetWorld } from '@/test/helpers';
import { OrderHistoryCard } from './OrderHistoryCard';

const server = setupServer();
const order = { id: 42, orderCode: '42', status: 'Completed', paymentStatus: 'Paid', orderSource: 'Online', fulfillmentType: 'Pickup', finalAmount: 60000, createdAt: '2026-11-01T00:00:00Z', itemCount: 2, items: [{ id: 1 }, { id: 2 }] } as MyOrderSummary;
beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(() => { resetWorld(); loginAs('Customer'); configureHttp({ getToken: () => 'token' }); });
afterEach(() => { cleanup(); server.resetHandlers(); });
function mount(value = order) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><OrderHistoryCard order={value} /></MemoryRouter></QueryClientProvider>);
}
function mockReviews(ids: number[]) {
  server.use(http.get('http://localhost/api/reviews/me', () => HttpResponse.json({ success: true, data: ids.map((id) => ({ id, order_item_id: id, status: 'Hidden' })), meta: { total: ids.length, page: 1, size: 100 } })));
}

it('hiển thị Đã đánh giá khi tất cả món đã có đánh giá, kể cả đánh giá bị ẩn', async () => {
  mockReviews([1, 2]); mount();
  const link = await screen.findByRole('link', { name: 'Đã đánh giá đơn #42' });
  expect(link.getAttribute('href')).toBe('/orders/42/reviews');
});

it('hiển thị Đánh giá tiếp khi chỉ một phần món đã được đánh giá', async () => {
  mockReviews([1]); mount();
  expect(await screen.findByRole('link', { name: 'Đánh giá tiếp đơn #42' })).toBeTruthy();
});

it('lấy chi tiết đơn khi danh sách không trả các mục đơn', async () => {
  mockReviews([1]);
  server.use(http.get('http://localhost/api/orders/me/42', () => HttpResponse.json({ success: true, data: {
    id: 42, order_code: '42', branch_id: 1, order_source: 'Online', fulfillment_type: 'Pickup', status: 'Completed', payment_status: 'Paid', version: 1, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', sub_total: 30000, item_discount_amount: 0, voucher_discount_amount: 0, delivery_fee: 0, vat_amount: 0, final_amount: 30000,
    items: [{ id: 1, order_id: 42, product_id: 1, variant_id: 1, product_name: 'Cà phê', variant_name: 'M', quantity: 1, unit_price: 30000, options_unit_total: 0, discount_amount: 0, is_reward_item: false, line_total: 30000, options: [] }], status_history: [],
  } })));
  mount({ ...order, items: undefined });
  expect(await screen.findByRole('link', { name: 'Đã đánh giá đơn #42' })).toBeTruthy();
});

it('không khẳng định chưa đánh giá khi không tải được dữ liệu đánh giá', async () => {
  server.use(http.get('http://localhost/api/reviews/me', () => HttpResponse.json({ success: false, error: { message: 'Lỗi' } }, { status: 500 })));
  mount();
  expect(await screen.findByRole('link', { name: 'Xem đánh giá đơn #42' })).toBeTruthy();
});
