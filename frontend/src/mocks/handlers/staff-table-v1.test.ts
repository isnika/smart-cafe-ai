import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TableSessionStatus } from '@/shared/types';
import { db, nowNaive, resetDb } from '../db';
import { mockConfig, url } from '../utils';
import { handlers } from './index';
import { mockAccessToken, resetAuthMock } from './identity';
import { tableSessionMock } from './staff-table-v1';

const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => {
  resetDb();
  resetAuthMock();
  tableSessionMock.conflictNext = false;
  mockConfig.latencyMs = 0;
  mockConfig.enforceAuth = false;
});

interface Wire { status: number; body: Record<string, unknown> }
const call = async (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = { Authorization: `Bearer ${mockAccessToken('u-staff')}` }): Promise<Wire> => {
  const res = await fetch(url(path), {
    method,
    headers: { ...headers, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const rows = (w: Wire) => w.body.data as Record<string, unknown>[];
const one = (w: Wire) => w.body.data as Record<string, unknown>;
const code = (w: Wire) => (w.body.error as { code: string }).code;

const addSession = (tableId: number, status: TableSessionStatus, minutesAgo = 10) => {
  const closed = status === 'Completed' || status === 'Cancelled';
  const s = {
    id: ++db.seq.session, tableId, sessionCode: `code-${db.seq.session}`, customerId: null, status,
    openedAt: nowNaive(-minutesAgo * 60_000), expiresAt: nowNaive(4 * 3_600_000), closedAt: closed ? nowNaive() : null,
  };
  db.sessions.push(s);
  return s;
};

describe('GET /branches/{branchId}/tables', () => {
  it('trả status/open_session_id do server tính, đúng envelope + snake_case', async () => {
    const a = addSession(1, 'Active');
    const p = addSession(2, 'Payment_Pending');
    addSession(3, 'Completed'); // phiên đã đóng không làm bàn Occupied
    const res = await call('/branches/1/tables');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, meta: null });
    const byNumber = Object.fromEntries(rows(res).map((r) => [r.table_number as string, r]));
    expect(byNumber['01']).toMatchObject({ id: 1, branch_id: 1, status: 'Occupied', open_session_id: a.id, is_active: true });
    expect(byNumber['02']).toMatchObject({ status: 'Occupied', open_session_id: p.id });
    expect(byNumber['03']).toMatchObject({ status: 'Empty', open_session_id: null });
    expect(byNumber['06']).toMatchObject({ is_active: false, status: 'Empty' });
    expect(rows(res)).toHaveLength(6);
  });

  it('lọc is_active và status; tham số sai → 400', async () => {
    addSession(1, 'Active');
    expect(rows(await call('/branches/1/tables?status=Occupied')).map((r) => r.table_number)).toEqual(['01']);
    expect(rows(await call('/branches/1/tables?is_active=false')).map((r) => r.table_number)).toEqual(['06']);
    const bad = await call('/branches/1/tables?status=Busy');
    expect(bad.status).toBe(400);
    expect(code(bad)).toBe('VALIDATION_ERROR');
  });

  it('404 chi nhánh lạ, 401 thiếu token, 403 với Customer', async () => {
    expect((await call('/branches/99/tables')).status).toBe(404);
    expect((await call('/branches/1/tables', 'GET', undefined, {})).status).toBe(401);
    const forbidden = await call('/branches/1/tables', 'GET', undefined, { Authorization: `Bearer ${mockAccessToken('u-customer')}` });
    expect(forbidden.status).toBe(403);
    expect(code(forbidden)).toBe('FORBIDDEN');
  });
});

describe('GET /table-sessions', () => {
  it('lọc Payment_Pending, kèm table_number◇ và meta phân trang', async () => {
    addSession(1, 'Active');
    const p2 = addSession(2, 'Payment_Pending', 30);
    const p3 = addSession(3, 'Payment_Pending', 5);
    const res = await call('/table-sessions?branch_id=1&status=Payment_Pending');
    expect(res.status).toBe(200);
    expect(rows(res).map((r) => r.id)).toEqual([p3.id, p2.id]); // mới nhất trước
    expect(rows(res)[0]).toMatchObject({ table_number: '03', status: 'Payment_Pending', branch_id: 1 });
    expect(res.body.meta).toEqual({ page: 1, size: 20, total: 2, total_pages: 1 });
  });

  it('phân trang, lọc table_id, và validate tham số', async () => {
    for (let i = 0; i < 3; i += 1) addSession(2, 'Completed', 60 + i);
    const page2 = await call('/table-sessions?status=Completed&page=2&size=2');
    expect(rows(page2)).toHaveLength(1);
    expect(page2.body.meta).toEqual({ page: 2, size: 2, total: 3, total_pages: 2 });
    expect(rows(await call('/table-sessions?table_id=5'))).toHaveLength(0);
    for (const q of ['status=Nope', 'size=101', 'page=0', 'branch_id=abc']) expect((await call(`/table-sessions?${q}`)).status).toBe(400);
    expect((await call('/table-sessions?branch_id=7')).status).toBe(404);
  });

  it('chỉ đọc: gọi danh sách không làm đổi phiên hay giỏ', async () => {
    addSession(1, 'Payment_Pending');
    const before = JSON.stringify([db.sessions, db.carts]);
    await call('/table-sessions?status=Payment_Pending');
    await call('/branches/1/tables');
    expect(JSON.stringify([db.sessions, db.carts])).toBe(before);
  });
});

describe('PATCH /table-sessions/{id}/status', () => {
  it('Payment_Pending → Completed: set closed_at, bàn về Empty ở lần đọc kế tiếp (do server tính)', async () => {
    const s = addSession(2, 'Payment_Pending');
    expect(rows(await call('/branches/1/tables?status=Occupied')).map((r) => r.id)).toEqual([2]);
    const res = await call(`/table-sessions/${s.id}/status`, 'PATCH', { status: 'Completed' });
    expect(res.status).toBe(200);
    expect(one(res)).toMatchObject({ id: s.id, status: 'Completed', table_number: '02' });
    expect(one(res).closed_at).toBeTruthy();
    expect(db.sessions.find((x) => x.id === s.id)?.status).toBe('Completed'); // lưu trong RAM
    expect(rows(await call('/branches/1/tables?status=Occupied'))).toHaveLength(0);
  });

  it('Active → Cancelled và Payment_Pending → Cancelled: set closed_at', async () => {
    const a = addSession(1, 'Active');
    const p = addSession(2, 'Payment_Pending');
    for (const s of [a, p]) {
      const res = await call(`/table-sessions/${s.id}/status`, 'PATCH', { status: 'Cancelled' });
      expect(res.status).toBe(200);
      expect(one(res)).toMatchObject({ status: 'Cancelled' });
      expect(one(res).closed_at).toBeTruthy();
    }
  });

  it('Active → Payment_Pending hợp lệ; chuyển không hợp lệ → 409 INVALID_STATE_TRANSITION và không đổi dữ liệu', async () => {
    const a = addSession(1, 'Active');
    expect(one(await call(`/table-sessions/${a.id}/status`, 'PATCH', { status: 'Payment_Pending' }))).toMatchObject({ status: 'Payment_Pending' });
    const done = addSession(2, 'Completed');
    for (const [id, status] of [[done.id, 'Completed'], [done.id, 'Cancelled'], [done.id, 'Payment_Pending']] as const) {
      const res = await call(`/table-sessions/${id}/status`, 'PATCH', { status });
      expect(res.status).toBe(409);
      expect(code(res)).toBe('INVALID_STATE_TRANSITION');
    }
    const fresh = addSession(3, 'Active');
    expect((await call(`/table-sessions/${fresh.id}/status`, 'PATCH', { status: 'Completed' })).status).toBe(409);
    expect(db.sessions.find((x) => x.id === fresh.id)?.status).toBe('Active');
  });

  it('400 với status ngoài danh sách (kể cả Active), 404 id lạ, 401/403 sai quyền', async () => {
    const s = addSession(1, 'Payment_Pending');
    for (const status of ['Active', 'Nope', 7]) expect((await call(`/table-sessions/${s.id}/status`, 'PATCH', { status })).status).toBe(400);
    expect((await call('/table-sessions/999/status', 'PATCH', { status: 'Completed' })).status).toBe(404);
    expect((await call(`/table-sessions/${s.id}/status`, 'PATCH', { status: 'Completed' }, {})).status).toBe(401);
    const asCustomer = await call(`/table-sessions/${s.id}/status`, 'PATCH', { status: 'Completed' }, { Authorization: `Bearer ${mockAccessToken('u-customer')}` });
    expect(asCustomer.status).toBe(403);
    expect(db.sessions.find((x) => x.id === s.id)?.status).toBe('Payment_Pending');
  });

  it('giả lập 409: người khác vừa đóng phiên → 409 một lần rồi trở lại bình thường', async () => {
    const s = addSession(2, 'Payment_Pending');
    tableSessionMock.conflictNext = true;
    const res = await call(`/table-sessions/${s.id}/status`, 'PATCH', { status: 'Completed' });
    expect(res.status).toBe(409);
    expect(code(res)).toBe('CONFLICT');
    expect(db.sessions.find((x) => x.id === s.id)?.status).toBe('Completed'); // dữ liệu đã đổi, FE phải refetch mới thấy
    expect(tableSessionMock.conflictNext).toBe(false);
    // Lần kế: phiên đã Completed nên đổi tiếp là sai state (409 tự nhiên), không phải 409 giả lập.
    const again = await call(`/table-sessions/${s.id}/status`, 'PATCH', { status: 'Completed' });
    expect(code(again)).toBe('INVALID_STATE_TRANSITION');
  });
});

describe('Không làm hỏng session bàn của luồng khách Dine-in', () => {
  const guest = (code: string) => ({ 'X-Table-Session-Code': code });

  it('phiên khách mở hiện ở màn Staff; hoàn tất từ Staff thì khách thấy phiên đã đóng và bàn mở lại được', async () => {
    const opened = await call('/qr/QR-B1-T01/sessions', 'POST', undefined, {});
    expect(opened.status).toBe(201);
    const session = one(opened);
    const sessionCode = session.session_code as string;

    expect(rows(await call('/branches/1/tables')).find((r) => r.id === 1)).toMatchObject({ status: 'Occupied', open_session_id: session.id });

    // Khách yêu cầu tính tiền (API khách, không đổi) → Staff thấy ở bộ lọc Payment_Pending
    expect((await call('/table-sessions/current/request-payment', 'POST', undefined, guest(sessionCode))).status).toBe(200);
    expect(rows(await call('/table-sessions?status=Payment_Pending')).map((r) => r.id)).toEqual([session.id]);
    expect((await call('/table-sessions/current', 'GET', undefined, guest(sessionCode))).status).toBe(200); // khách vẫn đọc được phiên

    expect((await call(`/table-sessions/${session.id}/status`, 'PATCH', { status: 'Completed' })).status).toBe(200);
    const current = await call('/table-sessions/current', 'GET', undefined, guest(sessionCode));
    expect(current.status).toBe(404); // phiên đã đóng → như server thật

    const reopened = await call('/qr/QR-B1-T01/sessions', 'POST', undefined, {});
    expect(reopened.status).toBe(201);
    expect(one(reopened).id).not.toBe(session.id);
  });

  it('Staff đổi phiên của bàn này không đụng phiên/giỏ của bàn khác', async () => {
    const other = one(await call('/qr/QR-B1-T02/sessions', 'POST', undefined, {}));
    const mine = addSession(1, 'Payment_Pending');
    const snapshot = JSON.stringify(db.sessions.find((s) => s.id === other.id));
    await call(`/table-sessions/${mine.id}/status`, 'PATCH', { status: 'Cancelled' });
    expect(JSON.stringify(db.sessions.find((s) => s.id === other.id))).toBe(snapshot);
    expect((await call('/table-sessions/current', 'GET', undefined, guest(other.session_code as string))).status).toBe(200);
  });
});
