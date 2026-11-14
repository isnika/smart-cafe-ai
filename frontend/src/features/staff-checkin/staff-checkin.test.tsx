// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { handlers } from '@/mocks/handlers';
import { resetAuthMock } from '@/mocks/handlers/identity';
import { workforceConfig } from '@/mocks/handlers/workforce';
import { db } from '@/mocks/db';
import { url } from '@/mocks/utils';
import { configureHttp } from '@/shared/api/http';
import { resetWorld } from '@/test/helpers';
import { renderApp } from '@/test/renderApp';
import { phaseOf, workedDuration } from './model';
import { useStaffCheckin } from './hooks/useStaffCheckin';
import StaffCheckinPage from './pages/StaffCheckinPage';

const server = setupServer(...handlers);
beforeAll(() => {
  server.listen();
  configureHttp({ getToken: () => useAuthStore.getState().accessToken, onUnauthorized: () => useAuthStore.getState().clear() });
});
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
beforeEach(() => {
  resetWorld();
  resetAuthMock();
  workforceConfig.enforceWindow = false;
});

const signIn = () => useAuthStore.getState().login({ identifier: 'staff@smartcafe.vn', password: '123456' });
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client()}>{children}</QueryClientProvider>;
const renderPage = () => render(<StaffCheckinPage />, { wrapper });

describe('model', () => {
  it('workedDuration tính giờ/phút từ timestamp không timezone (UTC)', () => {
    expect(workedDuration('2026-10-15T05:58:00', '2026-10-15T13:42:00')).toBe('7 giờ 44 phút');
    expect(workedDuration('2026-10-15T05:58:00', null)).toBeNull();
  });
  it('phaseOf', () => {
    expect(phaseOf(null)).toBe('none');
  });
});

describe('useStaffCheckin', () => {
  it('tải lịch cá nhân; QR khớp lịch rồi check-in và check-out đúng lịch', async () => {
    await signIn();
    const { result } = renderHook(() => useStaffCheckin(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.schedules).toHaveLength(1);
    expect(result.current.phase).toBe('ready');

    const posts: Array<{ path: string; body: unknown }> = [];
    server.use(http.post(/\/timekeeping\/check-in$/, async ({ request }) => { posts.push({ path: new URL(request.url).pathname, body: await request.json() }); db.timekeepings.push({ id: 1, scheduleId: 1, checkIn: '2026-11-11T08:00:00', checkOut: null, source: 'QR', isAdjusted: false }); return HttpResponse.json({ id: 1, schedule_id: 1, check_in: '2026-11-11T08:00:00', check_out: null, source: 'QR', is_adjusted: false }); }));
    await act(async () => { expect(await result.current.submitCode('shift-qr:1')).toBe(true); });
    expect(posts[0]?.body).toEqual({ schedule_id: 1, source: 'QR' });
    await waitFor(() => expect(result.current.phase).toBe('in'));

    server.use(http.post(/\/timekeeping\/check-out$/, async ({ request }) => { posts.push({ path: new URL(request.url).pathname, body: await request.json() }); db.timekeepings[0]!.checkOut = '2026-11-11T16:00:00'; return HttpResponse.json({ id: 1, schedule_id: 1, check_in: '2026-11-11T08:00:00', check_out: '2026-11-11T16:00:00', source: 'QR', is_adjusted: false }); }));
    await act(async () => { expect(await result.current.submitCode('shift-qr:1')).toBe(true); });
    expect(posts[1]?.body).toEqual({ schedule_id: 1 });
    await waitFor(() => expect(result.current.phase).toBe('done'));
  });

  it('mã sai → actionError, phase giữ nguyên', async () => {
    await signIn();
    const { result } = renderHook(() => useStaffCheckin(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      expect(await result.current.submitCode('abc')).toBe(false);
    });
    expect(result.current.actionError?.message).toMatch(/không hợp lệ/);
    expect(result.current.phase).toBe('ready');
  });
});

describe('StaffCheckinPage', () => {
  it('luồng nhập mã → ĐÃ VÀO CA → check-out → giờ ra + tổng thời gian', async () => {
    await signIn();
    renderPage();
    expect(await screen.findByText('Ca sáng')).toBeTruthy();
    expect(screen.getByText('Chưa vào ca')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Hoặc nhập mã ca'), { target: { value: 'shift-qr:1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check-in' }));
    expect(await screen.findByText('ĐÃ VÀO CA')).toBeTruthy();
    expect(screen.getByText('Giờ vào')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Hoặc nhập mã ca'), { target: { value: 'shift-qr:1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check-out' }));
    expect(await screen.findByText('Giờ ra')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check-out' })).toBeNull();
  });

  it('hiện lỗi mã sai và lỗi 409; reload vẫn đọc lại trạng thái đã vào ca', async () => {
    await signIn();
    renderPage();
    const input = await screen.findByLabelText('Hoặc nhập mã ca');
    fireEvent.change(input, { target: { value: 'xxx' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check-in' }));
    expect(await screen.findByText(/Mã QR không hợp lệ/)).toBeTruthy();

    fireEvent.change(input, { target: { value: 'shift-qr:1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check-in' }));
    await screen.findByText('ĐÃ VÀO CA');

    // 409: ép server coi như chưa biết trạng thái bằng handler ghi đè
    server.use(http.post(url('/timekeeping/check-out'), () => HttpResponse.json({ message: 'x', code: 'ALREADY_CHECKED_IN' }, { status: 409 })));
    fireEvent.change(screen.getByLabelText('Hoặc nhập mã ca'), { target: { value: 'shift-qr:1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check-out' }));
    expect(await screen.findByText('Bạn đã check-in ca này rồi.')).toBeTruthy();

    cleanup();
    renderPage(); // "reload"
    expect(await screen.findByText('ĐÃ VÀO CA')).toBeTruthy();
  });

  it('lỗi mạng khi tải → nút Thử lại, bấm xong hiện ca', async () => {
    await signIn();
    server.use(http.get(url('/schedules/me'), () => HttpResponse.error()));
    renderPage();
    expect((await screen.findByRole('alert')).textContent).toMatch(/Không thể kết nối/);
    server.resetHandlers();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Ca sáng')).toBeTruthy();
  });

  it('empty: chi nhánh không có ca hôm nay', async () => {
    await signIn();
    db.shifts.length = 0;
    db.schedules.length = 0;
    renderPage();
    expect(await screen.findByText(/Hôm nay bạn không có lịch làm việc/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check-in' })).toBeNull();
  });

  it('không có quyền camera → báo rõ, vẫn nhập mã tay được', async () => {
    await signIn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })) },
    });
    renderPage();
    expect(await screen.findByText(/Không có quyền truy cập máy ảnh/)).toBeTruthy();
    expect(screen.getByLabelText('Hoặc nhập mã ca')).toBeTruthy();
  });

  it('route /staff/checkin dùng trang thật (không còn placeholder), qua guard Staff', async () => {
    await signIn();
    renderApp('/staff/checkin');
    expect(await screen.findByRole('heading', { name: 'Check-in QR', level: 1 })).toBeTruthy();
  });
});
