// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { configureHttp } from '@/shared/api';
import { loginAs, resetWorld } from '@/test/helpers';
import OrderReviewPage from './OrderReviewPage';

const server = setupServer();
const envelope = (data: unknown, meta: unknown = null) => HttpResponse.json({ success: true, data, meta });
const item = (id: number, name: string) => ({ id, order_id: 42, product_id: id, variant_id: id, product_name: name, variant_name: 'M', quantity: 1, unit_price: 30000, options_unit_total: 0, discount_amount: 0, is_reward_item: false, line_total: 30000, options: [] });
const order = { id: 42, order_code: 'ORD-42', branch_id: 1, order_source: 'Online', fulfillment_type: 'Pickup', sub_total: 60000, item_discount_amount: 0, voucher_discount_amount: 0, delivery_fee: 0, vat_amount: 0, final_amount: 60000, status: 'Completed', payment_status: 'Paid', version: 1, created_at: '2026-11-07T03:30:00Z', updated_at: '2026-11-07T03:35:00Z', items: [item(1, 'Cà phê'), item(2, 'Trà đào')], status_history: [] };
beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(() => { resetWorld(); loginAs('Customer'); configureHttp({ getToken: () => 'token' }); });
afterEach(() => { cleanup(); server.resetHandlers(); });

it('gửi các món đã chọn, giữ kết quả đã gửi và cho thử lại món bị lỗi', async () => {
  const sent: number[] = [];
  let failSecond = true;
  server.use(
    http.get('http://localhost/api/orders/me/42', () => envelope(order)),
    http.get('http://localhost/api/reviews/me', () => envelope([], { page: 1, size: 100, total: 0 })),
    http.post('http://localhost/api/reviews', async ({ request }) => {
      const body = await request.json() as { order_item_id: number; rating: number; comment: string | null };
      sent.push(body.order_item_id);
      if (body.order_item_id === 2 && failSecond) return HttpResponse.json({ success: false, error: { message: 'Chưa xác thực lượt mua' } }, { status: 403 });
      return envelope({ id: body.order_item_id, order_item_id: body.order_item_id, product_id: body.order_item_id, user_id: 'u-1', rating: body.rating, comment: body.comment, status: 'Approved', created_at: '2026-11-01T00:00:00Z' });
    }),
  );
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/orders/42/reviews']}><Routes><Route path="/orders/:orderId/reviews" element={<OrderReviewPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  const coffee = await screen.findByRole('article', { name: 'Đánh giá Cà phê' });
  const tea = screen.getByRole('article', { name: 'Đánh giá Trà đào' });
  fireEvent.click(within(coffee).getByRole('radio', { name: '5 sao cho Cà phê' }));
  fireEvent.click(within(tea).getByRole('radio', { name: '4 sao cho Trà đào' }));
  fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá (2)' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Không gửi được đánh giá Trà đào');
  expect(within(coffee).getByText('Đã gửi')).toBeTruthy();
  expect(sent).toEqual([1, 2]);
  failSecond = false;
  fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá (1)' }));
  expect(await screen.findByText('Đã gửi đánh giá. Cảm ơn bạn đã chia sẻ!')).toBeTruthy();
  expect(sent).toEqual([1, 2, 2]);
});
