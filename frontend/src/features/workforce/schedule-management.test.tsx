// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { ok, readJson, url } from '@/mocks/utils';
import { fakeUser, resetWorld } from '@/test/helpers';
import { renderApp } from '@/test/renderApp';

const server = setupServer();
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => { cleanup(); server.resetHandlers(); });
beforeEach(() => {
  resetWorld();
  useAuthStore.setState({ status: 'authenticated', accessToken: 'token', user: fakeUser({ id: 'manager', roleId: 3 }), roleName: 'Manager', branchId: 1 });
  server.use(
    http.get(url('/branches'), () => ok([{ id: 1, name: 'Chi nhánh A' }])),
    http.get(url('/shifts'), () => ok([{ id: 10, branch_id: 1, name: 'Ca sáng', start_time: '08:00:00', end_time: '12:00:00', is_active: true, is_overnight: false }])),
    http.get(url('/staff-profiles'), () => ok([{ id: 7, branch_id: 1, employee_code: 'NV07', status: 'Active', user_info: { full_name: 'An' } }])),
    http.get(url('/schedules'), () => ok([])),
  );
});

it('phân lịch theo chi nhánh và gửi đúng dữ liệu đến API', async () => {
  let body: unknown;
  server.use(http.post(url('/schedules'), async ({ request }) => { body = await readJson(request); return ok({ id: 1 }); }));
  renderApp('/manager/schedules');
  expect(await screen.findByRole('option', { name: /Ca sáng/ })).toBeTruthy();
  expect(screen.getByRole('option', { name: 'An · NV07' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Nhân viên'), { target: { value: '7' } });
  fireEvent.change(screen.getByLabelText('Ca'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Ngày làm'), { target: { value: '2026-12-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Phân lịch' }));
  await waitFor(() => expect(body).toEqual({ staff_id: 7, shift_id: 10, work_date: '2026-12-01' }));
  expect((screen.getByLabelText('Chi nhánh') as HTMLSelectElement).disabled).toBe(true);
});

it('không lặp mã nhân viên khi dịch vụ chưa trả tên', async () => {
  server.use(http.get(url('/staff-profiles'), () => ok([{ id: 7, branch_id: 1, employee_code: 'NV07', status: 'Active' }])));
  renderApp('/manager/schedules');
  expect(await screen.findByRole('option', { name: 'NV07' })).toBeTruthy();
});

it('hiển thị lỗi xung đột từ máy chủ khi phân lịch', async () => {
  server.use(http.post(url('/schedules'), () => HttpResponse.json({ message: 'Nhân viên đã có lịch' }, { status: 409 })));
  renderApp('/manager/schedules');
  await screen.findByRole('option', { name: /Ca sáng/ });
  fireEvent.change(screen.getByLabelText('Nhân viên'), { target: { value: '7' } });
  fireEvent.change(screen.getByLabelText('Ca'), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: 'Phân lịch' }));
  expect(await within(await screen.findByRole('alert')).findByText('Nhân viên đã có lịch')).toBeTruthy();
});
