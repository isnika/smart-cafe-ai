// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { http } from '@/shared/api/http';
import { StaffLeavePage } from './LeavePages';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Personal schedules', () => {
  it('shows a future assignment and sends its confirmation', async () => {
    const schedule = { id: 7, branchId: 1, branchName: 'Central', staffId: 3, shiftId: 2, workDate: '2099-01-01', status: 'Scheduled', confirmationStatus: 'PENDING', staff: { jobTitle: 'Barista' }, shift: { name: 'Morning', startTime: '08:00:00', endTime: '12:00:00' } };
    vi.spyOn(http, 'get').mockImplementation(async (path) => path === '/schedules/me' ? [schedule] as never : [] as never);
    const post = vi.spyOn(http, 'post').mockResolvedValue({ ...schedule, confirmationStatus: 'CONFIRMED' } as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><StaffLeavePage /></QueryClientProvider>);
    await screen.findByText(/Morning/);
    fireEvent.click(screen.getByRole('button', { name: 'Chi tiết' }));
    expect(screen.getByText('Barista')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận nhận ca' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/schedules/7/confirm'));
  });

  it('keeps history and leave requests accessible in their own sections', async () => {
    vi.spyOn(http, 'get').mockResolvedValue([] as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><StaffLeavePage /></QueryClientProvider>);
    await screen.findByText('Ca trong tuần');
    fireEvent.click(screen.getByRole('tab', { name: 'Lịch sử' }));
    expect(screen.getByText('Lịch sử làm việc')).toBeTruthy();
    expect(screen.getByLabelText('Từ ngày')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Nghỉ phép' }));
    expect(screen.getByText('Gửi yêu cầu nghỉ phép')).toBeTruthy();
    expect(await screen.findByText('Chưa có yêu cầu nghỉ phép nào.')).toBeTruthy();
  });
});
