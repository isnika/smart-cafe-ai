import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ScheduleView, Shift, Timekeeping } from '@/shared/types';
import { db, resetDb } from '../db';
import { mockConfig, url } from '../utils';
import { todayIn } from '../workforce-seed';
import { MOCK_PASSWORD, resetAuthMock } from './identity';
import { handlers } from './index';
import { workforceConfig } from './workforce';

const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(() => {
  resetDb();
  resetAuthMock();
  mockConfig.latencyMs = 0;
  mockConfig.enforceAuth = false;
  workforceConfig.enforceWindow = false;
});
afterEach(() => server.resetHandlers());

async function tokenOf(email: string): Promise<string> {
  const res = await fetch(url('/identity/auth/login'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: email, password: MOCK_PASSWORD }),
  });
  return ((await res.json()) as { accessToken: string }).accessToken;
}

async function call<T>(path: string, token?: string, body?: unknown) {
  const res = await fetch(url(path), {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

interface Err { message: string; code: string }
const IN = '/store/timekeeping/check-in';
const OUT = '/store/timekeeping/check-out';

describe('GET /store/branches/:id/shifts', () => {
  it('trả ca của chi nhánh', async () => {
    const { status, body } = await call<Shift[]>('/store/branches/1/shifts', await tokenOf('staff@smartcafe.vn'));
    expect(status).toBe(200);
    expect(body.map((s) => s.name)).toEqual(['Ca sáng', 'Ca chiều']);
  });
  it('chi nhánh không có ca → mảng rỗng', async () => {
    expect((await call<Shift[]>('/store/branches/99/shifts')).body).toEqual([]);
  });
  it('enforceAuth bật + thiếu token → 401', async () => {
    mockConfig.enforceAuth = true;
    expect((await call('/store/branches/1/shifts')).status).toBe(401);
  });
});

describe('check-in / check-out', () => {
  it('check-in hợp lệ → 201 có giờ vào, schedules phản ánh lại', async () => {
    const t = await tokenOf('staff@smartcafe.vn');
    const r = await call<Timekeeping>(IN, t, { qrToken: 'shift-qr:1' });
    expect(r.status).toBe(201);
    expect(r.body.checkIn).toBeTruthy();
    expect(r.body.checkOut).toBeNull();
    expect(r.body.source).toBe('QR');

    const today = todayIn();
    const list = await call<ScheduleView[]>(`/store/schedules?branchId=1&from=${today}&to=${today}`, t);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]!.timekeeping?.checkIn).toBe(r.body.checkIn);
  });

  it('mã sai định dạng → 400 INVALID_QR; ca không tồn tại → 404', async () => {
    const t = await tokenOf('staff@smartcafe.vn');
    const bad = await call<Err>(IN, t, { qrToken: 'hello' });
    expect([bad.status, bad.body.code]).toEqual([400, 'INVALID_QR']);
    expect((await call<Err>(IN, t, { qrToken: 'shift-qr:999' })).status).toBe(404);
  });

  it('ca thuộc chi nhánh khác → 403 WRONG_BRANCH', async () => {
    db.shifts.push({ id: 9, branchId: 2, name: 'Ca khác', startTime: '06:00:00', endTime: '14:00:00', isOvernight: false, isActive: true });
    const r = await call<Err>(IN, await tokenOf('staff@smartcafe.vn'), { qrToken: 'shift-qr:9' });
    expect([r.status, r.body.code]).toEqual([403, 'WRONG_BRANCH']);
  });

  it('không có lịch ca đó hôm nay → 403 NO_SCHEDULE', async () => {
    const r = await call<Err>(IN, await tokenOf('staff@smartcafe.vn'), { qrToken: 'shift-qr:2' });
    expect([r.status, r.body.code]).toEqual([403, 'NO_SCHEDULE']);
  });

  it('check-in lặp → 409 ALREADY_CHECKED_IN', async () => {
    const t = await tokenOf('staff@smartcafe.vn');
    await call(IN, t, { qrToken: 'shift-qr:1' });
    const r = await call<Err>(IN, t, { qrToken: 'shift-qr:1' });
    expect([r.status, r.body.code]).toEqual([409, 'ALREADY_CHECKED_IN']);
  });

  it('check-out khi chưa check-in → 4xx NOT_CHECKED_IN', async () => {
    const r = await call<Err>(OUT, await tokenOf('staff@smartcafe.vn'), { qrToken: 'shift-qr:1' });
    expect([r.status, r.body.code]).toEqual([409, 'NOT_CHECKED_IN']);
  });

  it('check-out hợp lệ → có giờ ra; check-out lần hai → 409', async () => {
    const t = await tokenOf('staff@smartcafe.vn');
    await call(IN, t, { qrToken: 'shift-qr:1' });
    const r = await call<Timekeeping>(OUT, t, { qrToken: 'shift-qr:1' });
    expect(r.status).toBe(200);
    expect(r.body.checkOut).toBeTruthy();
    expect((await call<Err>(OUT, t, { qrToken: 'shift-qr:1' })).body.code).toBe('ALREADY_CHECKED_OUT');
  });

  it('thiếu / sai token → 401; tài khoản không phải nhân viên → 403', async () => {
    expect((await call(IN, undefined, { qrToken: 'shift-qr:1' })).status).toBe(401);
    expect((await call<Err>(IN, await tokenOf('manager@smartcafe.vn'), { qrToken: 'shift-qr:1' })).status).toBe(403);
  });

  it('enforceWindow bật: ngoài ±30 phút → 422 OUT_OF_SHIFT_WINDOW', async () => {
    workforceConfig.enforceWindow = true;
    db.shifts[0]!.startTime = '00:00:00'; // ca đã đổi sang khung ngắn
    db.shifts[0]!.endTime = '00:01:00';
    const now = new Date(Date.now() + 7 * 3_600_000);
    const hour = now.getUTCHours();
    // đặt ca cách "bây giờ" > 1 giờ (giờ VN) để chắc chắn nằm ngoài khung
    const far = String((hour + 6) % 24).padStart(2, '0');
    db.shifts[0]!.startTime = `${far}:00:00`;
    db.shifts[0]!.endTime = `${far}:30:00`;
    const r = await call<Err>(IN, await tokenOf('staff@smartcafe.vn'), { qrToken: 'shift-qr:1' });
    expect([r.status, r.body.code]).toEqual([422, 'OUT_OF_SHIFT_WINDOW']);
  });
});
