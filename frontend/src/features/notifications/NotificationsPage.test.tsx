// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { configureHttp } from '@/shared/api';
import { loginAs, resetWorld } from '@/test/helpers';
import { NotificationBell } from './NotificationBell';
import NotificationsPage from './NotificationsPage';

const server = setupServer();
const envelope = (data: unknown, meta: unknown = null) => HttpResponse.json({ success: true, data, meta });
beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(() => { resetWorld(); loginAs('Customer'); configureHttp({ getToken: () => 'token' }); });
afterEach(() => { cleanup(); server.resetHandlers(); });

it('mở trang từ chuông, đánh dấu từng thông báo và đọc tất cả qua API', async () => {
  const items = [
    { id: 1, type: 'order_status', title: 'Cập nhật đơn hàng', body: 'Đơn đã sẵn sàng', is_read: false, created_at: '2026-11-01T00:00:00Z', data: { order_id: 42, status: 'Ready' } },
    { id: 2, type: 'promotion', title: 'Ưu đãi mới', body: 'Ưu đãi dành cho bạn', is_read: false, created_at: '2026-11-01T00:00:00Z', data: {} },
  ];
  let authorization: string | null = null;
  let requestBody: unknown;
  server.use(
    http.get('http://localhost/api/notifications/me', ({ request }) => {
      const params = new URL(request.url).searchParams;
      const visible = params.get('is_read') === 'false' ? items.filter((item) => !item.is_read) : items;
      return envelope(visible.slice(0, Number(params.get('size'))), { page: 1, size: Number(params.get('size')), total: visible.length });
    }),
    http.patch('http://localhost/api/notifications/:id/read', async ({ params, request }) => {
      authorization = request.headers.get('Authorization'); requestBody = await request.json();
      items.find((item) => item.id === Number(params.id))!.is_read = true;
      return envelope({ id: Number(params.id), is_read: true });
    }),
    http.post('http://localhost/api/notifications/read-all', () => { items.forEach((item) => { item.is_read = true; }); return envelope({ updated_count: 1 }); }),
  );
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={['/home']}><NotificationBell /><Routes><Route path="/home" element={<p>Trang chủ</p>} /><Route path="/notifications" element={<NotificationsPage />} /></Routes></MemoryRouter>
  </QueryClientProvider>);
  fireEvent.click(await screen.findByRole('link', { name: 'Thông báo, 2 chưa đọc' }));
  expect(await screen.findByRole('heading', { name: 'Thông báo', level: 1 })).toBeTruthy();
  const list = await screen.findByRole('list', { name: 'Danh sách thông báo' });
  const rows = within(list).getAllByRole('listitem');
  expect(within(rows[0]).getByRole('link', { name: 'Xem đơn hàng' }).getAttribute('href')).toBe('/orders/42');
  fireEvent.click(within(rows[0]).getByRole('button', { name: 'Đánh dấu đã đọc' }));
  await waitFor(() => expect(screen.getByRole('link', { name: 'Thông báo, 1 chưa đọc' })).toBeTruthy());
  expect(authorization).toBe('Bearer token');
  expect(requestBody).toEqual({ is_read: true });
  expect(within(rows[0]).queryByRole('button', { name: 'Đánh dấu đã đọc' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Đọc tất cả' }));
  await waitFor(() => expect(screen.getByRole('link', { name: 'Thông báo' })).toBeTruthy());
  expect(within(list).queryByRole('button', { name: 'Đánh dấu đã đọc' })).toBeNull();
});

it('hiển thị lỗi và cho thử lại khi không tải được thông báo', async () => {
  server.use(http.get('http://localhost/api/notifications/me', () => HttpResponse.json({ success: false, error: { message: 'Lỗi máy chủ' } }, { status: 500 })));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><NotificationsPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText('Không tải được thông báo.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
});
