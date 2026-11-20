import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from '../db';
import { mockConfig, url } from '../utils';
import { todayIn } from '../workforce-seed';
import { MOCK_PASSWORD, resetAuthMock } from './identity';
import { handlers } from './index';
import { workforceConfig } from './workforce';

const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(() => { resetDb(); resetAuthMock(); mockConfig.latencyMs = 0; mockConfig.enforceAuth = true; workforceConfig.enforceWindow = false; });
afterEach(() => server.resetHandlers());

async function tokenOf() {
  const res = await fetch(url('/identity/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'staff@smartcafe.vn', password: MOCK_PASSWORD }) });
  return ((await res.json()) as { accessToken: string }).accessToken;
}
async function call<T>(path: string, token: string, body?: unknown) {
  const method = path.includes('/decision') ? 'PATCH' : body === undefined ? 'GET' : 'POST';
  const res = await fetch(url(path), { method, headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() as T };
}

async function tokenOfManager() {
  const res = await fetch(url('/identity/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'manager@smartcafe.vn', password: MOCK_PASSWORD }) });
  return ((await res.json()) as { accessToken: string }).accessToken;
}

describe('staff schedules and timekeeping API', () => {
  it('manager lists pending leave requests and approves one; staff sees the decision', async () => {
    const staffToken = await tokenOf();
    const managerToken = await tokenOfManager();
    const initial = await call<Array<{ id: number; status: string; staff?: { userInfo?: { fullName?: string } } }>>('/leave-requests?status=Pending', managerToken);
    expect(initial.status).toBe(200);
    expect(initial.body).toContainEqual(expect.objectContaining({ id: 1, status: 'Pending', staff: { userInfo: { fullName: 'Nhân Viên' } } }));

    const decision = await call<{ id: number; status: string; approverStaffId: number | null }>('/leave-requests/1/decision', managerToken, { status: 'Approved' });
    expect(decision.status).toBe(200);
    expect(decision.body).toMatchObject({ id: 1, status: 'Approved', approverStaffId: null });
    expect(db.leaveRequests[0]?.reviewedAt).toBeTruthy();

    const mine = await call<Array<{ id: number; status: string }>>('/leave-requests/me', staffToken);
    expect(mine.body).toContainEqual(expect.objectContaining({ id: 1, status: 'Approved' }));
    expect((await call('/leave-requests/1/decision', managerToken, { status: 'Rejected' })).status).toBe(409);
  });

  it('staff can create and cancel own pending request; manager sees current state', async () => {
    const staffToken = await tokenOf();
    const managerToken = await tokenOfManager();
    const created = await call<{ id: number; status: string }>('/leave-requests', staffToken, { leave_type: 'Sick', start_date: todayIn(), end_date: todayIn(), reason: 'Không khỏe' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('Pending');
    expect((await call(`/leave-requests/${created.body.id}/cancel`, staffToken, {})).body).toMatchObject({ status: 'Cancelled' });
    const rows = await call<Array<{ id: number; status: string }>>('/leave-requests?status=Cancelled', managerToken);
    expect(rows.body).toContainEqual(expect.objectContaining({ id: created.body.id, status: 'Cancelled' }));
  });

  it('returns today work schedule, including server overnight metadata', async () => {
    const token = await tokenOf();
    db.schedules.push({ id: 2, branchId: 1, staffId: 1, shiftId: 2, workDate: todayIn(), status: 'Scheduled' });
    const result = await call<Array<{ shift: { isOvernight: boolean } }>>(`/schedules/me?from=${todayIn()}&to=${todayIn()}`, token);
    expect(result.status).toBe(200);
    expect(result.body).toHaveLength(2);
    expect(result.body[1]?.shift.isOvernight).toBe(true);
  });
  it('QR resolves shift_id against schedules/me and posts the matching schedule_id', async () => {
    const token = await tokenOf();
    const schedules = await call<Array<{ id: number; shiftId: number }>>(`/schedules/me?from=${todayIn()}&to=${todayIn()}`, token);
    const selected = schedules.body.find((item) => item.shiftId === 1)!;
    const result = await call<{ scheduleId: number; source: string }>('/timekeeping/check-in', token, { schedule_id: selected.id, source: 'QR' });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ scheduleId: selected.id, source: 'QR' });
  });
  it('absence of a matching schedule results in no check-in post', async () => {
    const token = await tokenOf();
    db.schedules[0]!.shiftId = 3;
    const schedules = await call<Array<{ shiftId: number }>>(`/schedules/me?from=${todayIn()}&to=${todayIn()}`, token);
    expect(schedules.body.some((item) => item.shiftId === 2)).toBe(false);
    expect(schedules.body.some((item) => item.shiftId === 1)).toBe(false);
    expect(db.timekeepings).toHaveLength(0);
  });
  it('check-out accepts only schedule_id and server history carries check times and status', async () => {
    const token = await tokenOf();
    await call('/timekeeping/check-in', token, { schedule_id: 1, source: 'Manual' });
    const checkedOut = await call<{ scheduleId: number; checkOut: string }>('/timekeeping/check-out', token, { schedule_id: 1 });
    expect(checkedOut.status).toBe(200);
    expect(checkedOut.body).toMatchObject({ scheduleId: 1 });
    expect(checkedOut.body.checkOut).toBeTruthy();
    const history = await call<Array<{ checkIn: string; checkOut: string; status: string; workDate: string }>>('/timekeeping/me', token);
    expect(history.body[0]).toMatchObject({ checkIn: expect.any(String), checkOut: expect.any(String), status: 'Scheduled', workDate: todayIn() });
  });
  it('returns 409 for repeat check-in and supports 422 validation', async () => {
    const token = await tokenOf();
    await call('/timekeeping/check-in', token, { schedule_id: 1, source: 'QR' });
    expect((await call('/timekeeping/check-in', token, { schedule_id: 1, source: 'QR' })).status).toBe(409);
    expect((await call('/timekeeping/check-in', token, { schedule_id: 1 })).status).toBe(422);
  });
  it('requires auth (401)', async () => {
    const response = await fetch(url('/schedules/me'));
    expect(response.status).toBe(401);
  });
});
