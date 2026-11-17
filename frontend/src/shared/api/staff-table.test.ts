import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { http as mswHttp, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ApiError, configureHttp } from './http';
import { findOpenStaffTableSession, listStaffTableSessions, listStaffTables, updateStaffTableSessionStatus } from './staff-table';

const U = (path: string) => `http://localhost/api${path}`;
const server = setupServer();
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => configureHttp({ getToken: () => 'tok-staff', onUnauthorized: undefined, refresh: undefined }));

const data = (body: unknown, meta: unknown = null, status = 200) => HttpResponse.json({ success: true, data: body, meta, trace_id: 't' }, { status });
const failure = (status: number, code: string) => HttpResponse.json({ success: false, error: { code, message: 'server error' }, trace_id: 'e' }, { status });

const wireSession = (over: Record<string, unknown> = {}) => ({
  id: 7, table_id: 3, session_code: 'secret-guest-token', customer_id: null, status: 'Payment_Pending',
  opened_at: '2026-11-11T08:00:00', expires_at: '2026-11-11T12:00:00', closed_at: null, branch_id: 1, table_number: '03', ...over,
});

describe('Staff table API', () => {
  it('GET /branches/{id}/tables: đúng path (không /store), query snake_case, giữ status/open_session_id của server', async () => {
    let seen = '';
    server.use(mswHttp.get(U('/branches/:id/tables'), ({ request }) => {
      seen = new URL(request.url).pathname + new URL(request.url).search;
      return data([
        { id: 1, branch_id: 1, table_number: '01', qr_code: 'QR-1', is_active: true, status: 'Occupied', open_session_id: 9 },
        { id: 2, branch_id: 1, table_number: '02', qr_code: 'QR-2', is_active: false, status: 'Empty', open_session_id: null },
        { id: 3, branch_id: 1, table_number: '03', is_active: true }, // server không trả status◇
      ]);
    }));
    const tables = await listStaffTables(1, { isActive: true, status: 'Occupied' });
    expect(seen).toBe('/api/branches/1/tables?is_active=true&status=Occupied');
    expect(tables[0]).toMatchObject({ id: 1, status: 'Occupied', openSessionId: 9 });
    expect(tables[1]).toMatchObject({ isActive: false, status: 'Empty', openSessionId: null });
    // Không tự suy diễn: thiếu status → null, kể cả khi có phiên mở ở nơi khác.
    expect(tables[2]).toMatchObject({ status: null, openSessionId: null });
  });

  it('GET /table-sessions: query snake_case + meta; bỏ session_code; id/time map đúng', async () => {
    let seen = '';
    server.use(mswHttp.get(U('/table-sessions'), ({ request }) => {
      seen = new URL(request.url).search;
      return data([wireSession({ id: '12' })], { page: 2, size: 20, total: 41, total_pages: 3 });
    }));
    const result = await listStaffTableSessions({ branchId: 1, status: 'Payment_Pending', tableId: 3, page: 2, size: 20 });
    expect(seen).toBe('?branch_id=1&status=Payment_Pending&table_id=3&page=2&size=20');
    expect(result.meta).toEqual({ page: 2, size: 20, total: 41, totalPages: 3 });
    expect(result.items[0]).toMatchObject({ id: 12, tableId: 3, status: 'Payment_Pending', tableNumber: '03', branchId: 1, closedAt: null });
    expect(result.items[0]).not.toHaveProperty('sessionCode');
    expect(JSON.stringify(result)).not.toContain('secret-guest-token');
  });

  it.each([{ page: 0 }, { size: 101 }, { size: 0 }, { tableId: -1 }])('validate tham số %o ngay ở client, không gửi request', async (params) => {
    let hits = 0;
    server.use(mswHttp.get(U('/table-sessions'), () => { hits += 1; return data([]); }));
    await expect(listStaffTableSessions(params)).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(hits).toBe(0);
  });

  it('PATCH /table-sessions/{id}/status: body {status}, trả session đã map', async () => {
    let captured: { method: string; path: string; body: unknown } | null = null;
    server.use(mswHttp.patch(U('/table-sessions/:id/status'), async ({ request }) => {
      captured = { method: request.method, path: new URL(request.url).pathname, body: await request.json() };
      return data(wireSession({ status: 'Completed', closed_at: '2026-11-11T09:00:00' }));
    }));
    const session = await updateStaffTableSessionStatus(7, 'Completed');
    expect(captured).toEqual({ method: 'PATCH', path: '/api/table-sessions/7/status', body: { status: 'Completed' } });
    expect(session).toMatchObject({ id: 7, status: 'Completed', closedAt: '2026-11-11T09:00:00Z' });
  });

  it('chỉ nhận Payment_Pending|Completed|Cancelled: Active bị chặn, không gửi request', async () => {
    let hits = 0;
    server.use(mswHttp.patch(U('/table-sessions/:id/status'), () => { hits += 1; return data(wireSession()); }));
    // @ts-expect-error 'Active' không thuộc StaffSessionPatchStatus — kiểm tra cả guard lúc chạy
    await expect(updateStaffTableSessionStatus(7, 'Active')).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    await expect(updateStaffTableSessionStatus(0, 'Completed')).rejects.toMatchObject({ status: 400 });
    expect(hits).toBe(0);
  });

  it('409 giữ nguyên ApiError (status + code) và chỉ gửi đúng một request (không tự retry)', async () => {
    let hits = 0;
    server.use(mswHttp.patch(U('/table-sessions/:id/status'), () => { hits += 1; return failure(409, 'INVALID_STATE_TRANSITION'); }));
    const error = await updateStaffTableSessionStatus(7, 'Completed').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'INVALID_STATE_TRANSITION' });
    expect(hits).toBe(1);
  });

  it('403/404 từ danh sách bàn được giữ nguyên cho UI xử lý', async () => {
    server.use(mswHttp.get(U('/branches/:id/tables'), () => failure(403, 'FORBIDDEN')));
    await expect(listStaffTables(1)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('phản hồi sai định dạng → INVALID_RESPONSE (502), không crash', async () => {
    server.use(mswHttp.get(U('/table-sessions'), () => data([{ id: 1, table_id: 2, status: 'Weird' }])));
    await expect(listStaffTableSessions()).rejects.toMatchObject({ status: 502, code: 'INVALID_RESPONSE' });
  });

  it('findOpenStaffTableSession: hai lần gọi theo status, tìm đúng id, không thấy → null', async () => {
    const calls: string[] = [];
    server.use(mswHttp.get(U('/table-sessions'), ({ request }) => {
      const status = new URL(request.url).searchParams.get('status');
      calls.push(String(status));
      return data(status === 'Payment_Pending' ? [wireSession({ id: 21 })] : [wireSession({ id: 20, status: 'Active' })]);
    }));
    expect(await findOpenStaffTableSession(1, 21)).toMatchObject({ id: 21, status: 'Payment_Pending' });
    expect(await findOpenStaffTableSession(1, 20)).toMatchObject({ id: 20, status: 'Active' });
    expect(await findOpenStaffTableSession(1, 99)).toBeNull();
    expect(calls.sort()).toEqual(Array(3).fill(['Active', 'Payment_Pending']).flat().sort());
  });
});
