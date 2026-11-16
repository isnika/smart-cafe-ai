import { http } from 'msw';
import type { TableSession, TableSessionStatus, TableStatus } from '@/shared/types';
import { BRANCH_ID, db, isExpired, nowNaive } from '../db';
import { envelopeError, guardedV1, ok, readJson, requireAuth, url } from '../utils';
import { accountFromRequest, type MockAccount } from './identity';

/**
 * Handler theo SmartAPI v1 (sheet "3. Store") cho Staff: danh sách bàn, danh sách phiên, đổi trạng thái phiên.
 * Dùng chung `db.sessions` với luồng khách Dine-in (không có bản sao dữ liệu) nên phiên khách mở sẽ hiện ở đây,
 * và phiên đóng ở đây thì `GET /table-sessions/current` của khách trả 404 như server thật.
 * Handler này KHÔNG tạo phiên, giỏ hay đơn và không đổi bất kỳ field nào ngoài status/closedAt của phiên.
 */

/** Công tắc dev/test: `__mock.tableSessions.conflictNext = true` → PATCH kế tiếp trả 409 như thể người khác vừa đổi phiên. */
export const tableSessionMock = { conflictNext: false };

const STAFF_ROLES = ['Staff', 'Manager'];
const PATCH_STATUSES: readonly TableSessionStatus[] = ['Payment_Pending', 'Completed', 'Cancelled'];
const ALL_STATUSES: readonly TableSessionStatus[] = ['Active', 'Payment_Pending', 'Completed', 'Cancelled'];

/** Chuyển trạng thái hợp lệ (giả định của mock, chờ backend xác nhận): Completed/Cancelled là trạng thái cuối. */
const TRANSITIONS: Record<TableSessionStatus, readonly TableSessionStatus[]> = {
  Active: ['Payment_Pending', 'Cancelled'],
  Payment_Pending: ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

function staffAccount(request: Request): MockAccount | Response {
  requireAuth(request);
  const account = accountFromRequest(request);
  if (!account) return envelopeError(401, 'UNAUTHORIZED', 'Chưa đăng nhập hoặc token không hợp lệ');
  if (!STAFF_ROLES.includes(account.roleName)) return envelopeError(403, 'FORBIDDEN', 'Chỉ nhân viên hoặc quản lý được xem bàn và phiên bàn');
  return account;
}

/** Staff chỉ thao tác chi nhánh của mình; Manager không bị ràng buộc theo claim. */
const outOfBranch = (account: MockAccount, branchId: number) => account.roleName === 'Staff' && account.branchId !== null && account.branchId !== branchId;

const isOpen = (s: TableSession) => s.status === 'Active' || s.status === 'Payment_Pending';
/** v_table_status do "server" (mock) tính: bàn Occupied ⇔ có phiên mở chưa hết hạn — cùng quy tắc với GET /qr/{qr}. */
const openSessionOf = (tableId: number) => db.sessions.find((s) => s.tableId === tableId && isOpen(s) && !isExpired(s.expiresAt));

const sessionView = (s: TableSession) => {
  const table = db.tables.find((t) => t.id === s.tableId);
  return { ...s, branchId: table?.branchId ?? BRANCH_ID, tableNumber: table?.tableNumber ?? null };
};

const intParam = (value: string | null): number | null => {
  if (value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : Number.NaN;
};

export const staffTableV1Handlers = [
  // GET /branches/{branchId}/tables?is_active&status
  http.get(
    url('/branches/:branchId/tables'),
    guardedV1(({ request, params }) => {
      const account = staffAccount(request);
      if (account instanceof Response) return account;
      const branchId = Number(params.branchId);
      if (!Number.isInteger(branchId) || branchId !== BRANCH_ID) return envelopeError(404, 'NOT_FOUND', `Không có chi nhánh ${String(params.branchId)}`);
      if (outOfBranch(account, branchId)) return envelopeError(403, 'FORBIDDEN', 'Không có quyền với chi nhánh này');

      const q = new URL(request.url).searchParams;
      const isActive = q.get('is_active');
      const status = q.get('status');
      if (isActive !== null && isActive !== 'true' && isActive !== 'false') return envelopeError(400, 'VALIDATION_ERROR', 'is_active phải là true|false');
      if (status !== null && status !== 'Empty' && status !== 'Occupied') return envelopeError(400, 'VALIDATION_ERROR', 'status phải là Empty|Occupied');

      const rows = db.tables
        .filter((t) => t.branchId === branchId)
        .map((t) => {
          const open = openSessionOf(t.id);
          const tableStatus: TableStatus = open ? 'Occupied' : 'Empty';
          return { id: t.id, branchId: t.branchId, tableNumber: t.tableNumber, qrCode: t.qrCode ?? null, isActive: t.isActive, status: tableStatus, openSessionId: open?.id ?? null };
        })
        .filter((t) => isActive === null || t.isActive === (isActive === 'true'))
        .filter((t) => status === null || t.status === status);
      return ok(rows);
    }),
  ),

  // GET /table-sessions?branch_id&status&table_id&page&size
  http.get(
    url('/table-sessions'),
    guardedV1(({ request }) => {
      const account = staffAccount(request);
      if (account instanceof Response) return account;
      const q = new URL(request.url).searchParams;
      const branchId = intParam(q.get('branch_id'));
      const tableId = intParam(q.get('table_id'));
      const status = q.get('status');
      const page = intParam(q.get('page')) ?? 1;
      const size = intParam(q.get('size')) ?? 20;
      if (Number.isNaN(branchId) || Number.isNaN(tableId) || Number.isNaN(page) || Number.isNaN(size) || page < 1 || size < 1 || size > 100) {
        return envelopeError(400, 'VALIDATION_ERROR', 'branch_id, table_id, page, size không hợp lệ');
      }
      if (status !== null && !ALL_STATUSES.includes(status as TableSessionStatus)) return envelopeError(400, 'VALIDATION_ERROR', 'status không hợp lệ');
      if (branchId !== null && branchId !== BRANCH_ID) return envelopeError(404, 'NOT_FOUND', `Không có chi nhánh ${branchId}`);
      if (branchId !== null && outOfBranch(account, branchId)) return envelopeError(403, 'FORBIDDEN', 'Không có quyền với chi nhánh này');

      const matched = db.sessions
        .filter((s) => status === null || s.status === status)
        .filter((s) => tableId === null || s.tableId === tableId)
        .sort((a, b) => (b.openedAt === a.openedAt ? b.id - a.id : b.openedAt.localeCompare(a.openedAt))); // mới nhất trước
      const items = matched.slice((page - 1) * size, page * size).map(sessionView);
      return ok(items, { page, size, total: matched.length, totalPages: Math.ceil(matched.length / size) });
    }),
  ),

  // PATCH /table-sessions/{id}/status  { status: Payment_Pending | Completed | Cancelled }
  http.patch(
    url('/table-sessions/:id/status'),
    guardedV1(async ({ request, params }) => {
      const account = staffAccount(request);
      if (account instanceof Response) return account;
      const body = await readJson<{ status?: unknown }>(request);
      if (typeof body.status !== 'string' || !PATCH_STATUSES.includes(body.status as TableSessionStatus)) {
        return envelopeError(400, 'VALIDATION_ERROR', 'status phải là Payment_Pending|Completed|Cancelled');
      }
      const next = body.status as TableSessionStatus;
      const session = db.sessions.find((s) => s.id === Number(params.id));
      if (!session) return envelopeError(404, 'NOT_FOUND', `Không tìm thấy phiên bàn ${String(params.id)}`);
      const view = sessionView(session);
      if (outOfBranch(account, view.branchId)) return envelopeError(403, 'FORBIDDEN', 'Không có quyền với chi nhánh này');

      if (tableSessionMock.conflictNext) {
        // Giả lập người khác vừa đóng phiên trước khi request này tới: đổi dữ liệu thật rồi trả 409 (FE phải refetch).
        tableSessionMock.conflictNext = false;
        if (isOpen(session)) {
          session.status = 'Completed';
          session.closedAt = nowNaive();
        }
        return envelopeError(409, 'CONFLICT', 'Phiên bàn vừa được cập nhật bởi người khác');
      }
      if (!TRANSITIONS[session.status].includes(next)) {
        return envelopeError(409, 'INVALID_STATE_TRANSITION', `Không thể chuyển phiên từ ${session.status} sang ${next}`);
      }
      session.status = next;
      if (next === 'Completed' || next === 'Cancelled') session.closedAt = nowNaive(); // spec: đóng/hủy phải set closed_at
      return ok(sessionView(session));
    }),
  ),
];
