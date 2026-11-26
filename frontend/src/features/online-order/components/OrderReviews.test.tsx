// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { configureHttp } from '@/shared/api';
import type { OrderItemDetail } from '@/shared/types';
import { loginAs, resetWorld } from '@/test/helpers';
import { OrderReviews } from './OrderReviews';

const server = setupServer();
const item = { id: 13, productId: 7, productName: 'Cà phê', variantName: 'M' } as OrderItemDetail;
const envelope = (data: unknown, total = 0) => HttpResponse.json({ success: true, data, meta: { page: 1, size: 100, total } });
beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(() => { resetWorld(); loginAs('Customer'); configureHttp({ getToken: () => 'token' }); });
afterEach(() => { cleanup(); server.resetHandlers(); });
function mount() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><OrderReviews items={[item]} /></QueryClientProvider>);
}

it('gửi đánh giá bằng Bearer và đúng body API, sau đó hiện trạng thái công khai', async () => {
  let body: unknown;
  let authorization: string | null = null;
  server.use(
    http.get('http://localhost/api/reviews/me', () => envelope([])),
    http.post('http://localhost/api/reviews', async ({ request }) => {
      authorization = request.headers.get('Authorization'); body = await request.json();
      return envelope({ id: 5, product_id: 7, order_item_id: 13, user_id: 'u-1', rating: 5, comment: 'Ngon', status: 'Approved', created_at: '2026-11-01T00:00:00Z' });
    }),
  );
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Đánh giá Cà phê' }));
  expect((screen.getByRole('button', { name: 'Gửi đánh giá' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getAllByRole('radio')).toHaveLength(5);
  fireEvent.click(screen.getByRole('radio', { name: '5 sao' }));
  expect((screen.getByRole('radio', { name: '5 sao' }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText('Rất hài lòng')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Gửi đánh giá' }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.change(screen.getByLabelText('Nhận xét (không bắt buộc)'), { target: { value: 'Ngon' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));
  await screen.findByText(/Đã đánh giá 5\/5 sao · Đã hiển thị/);
  expect(authorization).toBe('Bearer token');
  expect(body).toEqual({ order_item_id: 13, product_id: 7, rating: 5, comment: 'Ngon' });
  expect(screen.queryByRole('button', { name: 'Đánh giá Cà phê' })).toBeNull();
});

it('không cho đánh giá lại khi API trả đánh giá của mục đơn', async () => {
  server.use(http.get('http://localhost/api/reviews/me', () => envelope([{ id: 5, product_id: 7, order_item_id: 13, user_id: 'u-1', rating: 4, status: 'Hidden' }], 1)));
  mount();
  await waitFor(() => expect(screen.getByText(/Đã đánh giá 4\/5 sao · Đã ẩn/)).toBeTruthy());
  expect(screen.queryByRole('button', { name: 'Đánh giá Cà phê' })).toBeNull();
});
