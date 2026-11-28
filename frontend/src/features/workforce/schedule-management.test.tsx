// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
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
  server.use(http.post(url('/schedules/bulk'), async ({ request }) => { body = await readJson(request); return ok({ created_count: 1, conflicts: [] }); }));
  renderApp('/manager/schedules');
  expect(await screen.findByRole('option', { name: /Ca sáng/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Nhân viên Chọn nhân viên/ }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'An - Chưa có chức vụ' }));
  fireEvent.change(screen.getByLabelText('Ca'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Ngày làm'), { target: { value: '2099-12-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Phân lịch' }));
  await waitFor(() => expect(body).toEqual({ items: [{ staff_id: 7, shift_id: 10, work_date: '2099-12-01' }] }));
  expect((screen.getByLabelText('Chi nhánh') as HTMLSelectElement).disabled).toBe(true);
});

it('không lặp mã nhân viên khi dịch vụ chưa trả tên', async () => {
  server.use(http.get(url('/staff-profiles'), () => ok([{ id: 7, branch_id: 1, employee_code: 'NV07', status: 'Active' }])));
  renderApp('/manager/schedules');
  await screen.findByRole('option', { name: /Ca sáng/ });
  fireEvent.click(screen.getByRole('button', { name: /Nhân viên Chọn nhân viên/ }));
  expect(await screen.findByRole('checkbox', { name: 'NV07 - Chưa có chức vụ' })).toBeTruthy();
});

it('hiển thị lỗi xung đột từ máy chủ khi phân lịch', async () => {
  server.use(http.post(url('/schedules/bulk'), () => HttpResponse.json({ message: 'Nhân viên đã có lịch' }, { status: 409 })));
  renderApp('/manager/schedules');
  await screen.findByRole('option', { name: /Ca sáng/ });
  fireEvent.click(screen.getByRole('button', { name: /Nhân viên Chọn nhân viên/ }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'An - Chưa có chức vụ' }));
  fireEvent.change(screen.getByLabelText('Ca'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Ngày làm'), { target: { value: '2099-12-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Phân lịch' }));
  expect((await screen.findAllByRole('alert')).some((alert) => alert.textContent === 'Nhân viên đã có lịch')).toBe(true);
});
