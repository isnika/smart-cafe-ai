// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { http } from '@/shared/api/http';
import { listAdminBranches } from '@/shared/api/admin';
import { ScheduleManagementPage } from './ScheduleManagementPage';

vi.mock('@/shared/api/admin', () => ({ listAdminBranches: vi.fn() }));

beforeEach(() => {
  vi.mocked(listAdminBranches).mockResolvedValue([{ id: 1, name: 'Branch', code: 'B1' }] as never);
  vi.spyOn(http, 'get').mockImplementation(async (path) => {
    if (path === '/staff-profiles') return [
      { id: 7, employeeCode: 'NV7', status: 'Active', jobTitle: 'Pha chế', userInfo: { fullName: 'Nguyễn An' } },
      { id: 8, employeeCode: 'NV8', status: 'Active', jobTitle: 'Thu ngân', userInfo: { fullName: 'Trần Bình' } },
    ] as never;
    return [] as never;
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function renderPage(roleName: 'Admin' | 'Manager') {
  useAuthStore.setState({ roleName, branchId: 1 });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ScheduleManagementPage /></QueryClientProvider>);
}

describe('Schedule management', () => {
  it('shows preset shifts and opens the custom shift form only on request', async () => {
    renderPage('Manager');
    const select = await screen.findByLabelText('Ca');
    expect(within(select).getByRole('option', { name: 'Ca sáng (06:00–12:00)' })).toBeTruthy();
    expect(within(select).getByRole('option', { name: 'Ca chiều (12:00–18:00)' })).toBeTruthy();
    expect(within(select).getByRole('option', { name: 'Ca tối (18:00–22:00)' })).toBeTruthy();
    expect(screen.queryByLabelText('Tên ca')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm ca làm việc mới' }));
    expect(screen.getByLabelText('Tên ca')).toBeTruthy();
  });

  it('creates the selected preset before assigning staff', async () => {
    const post = vi.spyOn(http, 'post').mockImplementation(async (path) => path === '/shifts'
      ? { id: 22, branchId: 1, name: 'Ca sáng (06:00–12:00)', startTime: '06:00:00', endTime: '12:00:00', isActive: true } as never
      : { createdCount: 1, conflicts: [] } as never);
    renderPage('Manager');
    fireEvent.click(screen.getByRole('button', { name: /Nhân viên Chọn nhân viên/ }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Nguyễn An - Pha chế' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Trần Bình - Thu ngân' }));
    expect(screen.getByRole('button', { name: /Đã chọn 2 nhân viên/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Ca'), { target: { value: 'preset:morning' } });
    fireEvent.click(screen.getByRole('button', { name: 'Phân lịch' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/shifts', expect.objectContaining({ branchId: 1, startTime: '06:00:00', endTime: '12:00:00' }), { snake: true }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/schedules/bulk', expect.objectContaining({ items: [expect.objectContaining({ staffId: 7, shiftId: 22 }), expect.objectContaining({ staffId: 8, shiftId: 22 })] }), { snake: true }));
  });

  it('does not offer management actions to an admin', async () => {
    renderPage('Admin');
    await screen.findByText('Giám sát ca làm việc');
    expect(screen.queryByRole('button', { name: 'Thêm ca làm việc mới' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Phân lịch' })).toBeNull();
  });

  it('shows the conflicting shift beside the form without creating a schedule', async () => {
    const post = vi.spyOn(http, 'post');
    vi.mocked(http.get).mockImplementation(async (path, options) => {
      if (path === '/staff-profiles') return [{ id: 7, employeeCode: 'NV7', status: 'Active', jobTitle: 'Pha chế', userInfo: { fullName: 'Nguyễn An' } }] as never;
      if (path === '/schedules' && options?.query && 'from' in options.query) {
        const query = options.query as { from: string };
        const day = new Date(`${query.from}T12:00:00`);
        day.setDate(day.getDate() + 1);
        const workDate = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
        return [{ id: 5, staffId: 7, status: 'Scheduled', workDate, shift: { name: 'Ca sáng cũ', startTime: '06:00:00', endTime: '00:00:00', isOvernight: true } }] as never;
      }
      return [] as never;
    });
    renderPage('Manager');
    fireEvent.click(screen.getByRole('button', { name: /Nhân viên Chọn nhân viên/ }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Nguyễn An - Pha chế' }));
    fireEvent.change(screen.getByLabelText('Ca'), { target: { value: 'preset:evening' } });
    fireEvent.click(screen.getByRole('button', { name: 'Phân lịch' }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('Nguyễn An đã có ca Ca sáng cũ'))).toBe(true));
    expect(post).not.toHaveBeenCalled();
  });
});
