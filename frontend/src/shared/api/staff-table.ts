import { ApiError, http } from './http';
import { toPageMeta } from './order-me.mapper';
import { MAX_PAGE_SIZE } from './order-me';
import { toStaffTableSession, toStaffTableSessions, toStaffTables } from './staff-table.mapper';
import {
  STAFF_SESSION_PATCH_STATUSES,
  type ListStaffSessionsParams,
  type ListStaffTablesParams,
  type StaffSessionPage,
  type StaffSessionPatchStatus,
  type StaffTable,
  type StaffTableSession,
} from './staff-table.types';

/**
 * Bàn & phiên bàn cho Staff (SmartAPI v1, sheet "3. Store"). Dùng http.ts mặc định → Bearer + refresh single-flight.
 * Hoàn toàn tách khỏi luồng khách: KHÔNG gắn X-Table-Session-Code, không đụng getQr/createQrSession/getCurrentSession
 * và không động tới `listTables` legacy (/store/branches/{id}/tables).
 */
const validation = (message: string): ApiError => new ApiError(400, { code: 'VALIDATION_ERROR', message });
const assertId = (value: number, what: string): void => {
  if (!Number.isSafeInteger(value) || value <= 0) throw validation(`${what} không hợp lệ: ${String(value)}`);
};

/** GET /branches/{branchId}/tables — mỗi bàn kèm status◇ (Empty|Occupied) và open_session_id◇ do server tính. */
export async function listStaffTables(branchId: number, params: ListStaffTablesParams = {}, signal?: AbortSignal): Promise<StaffTable[]> {
  assertId(branchId, 'branchId');
  const data = await http.get<unknown>(`/branches/${branchId}/tables`, {
    query: { is_active: params.isActive, status: params.status },
    signal,
  });
  return toStaffTables(data);
}

/** GET /table-sessions — query branch_id, status, table_id, page, size; trả mảng + meta. Mỗi lần một status (spec không nói rõ đa trị). */
export async function listStaffTableSessions(params: ListStaffSessionsParams = {}, signal?: AbortSignal): Promise<StaffSessionPage> {
  if (params.branchId !== undefined) assertId(params.branchId, 'branchId');
  if (params.tableId !== undefined) assertId(params.tableId, 'tableId');
  if (params.page !== undefined && (!Number.isInteger(params.page) || params.page < 1)) throw validation(`page phải là số nguyên >= 1: ${params.page}`);
  if (params.size !== undefined && (!Number.isInteger(params.size) || params.size < 1 || params.size > MAX_PAGE_SIZE)) {
    throw validation(`size phải trong khoảng 1..${MAX_PAGE_SIZE}: ${params.size}`);
  }
  const { data, meta } = await http.getWithMeta<unknown>('/table-sessions', {
    query: { branch_id: params.branchId, status: params.status, table_id: params.tableId, page: params.page, size: params.size },
    signal,
  });
  const items = toStaffTableSessions(data);
  return { items, meta: toPageMeta(meta, { page: params.page ?? 1, size: params.size ?? items.length, count: items.length }) };
}

/**
 * PATCH /table-sessions/{id}/status — body { status }. Chỉ nhận Payment_Pending | Completed | Cancelled (`Active` bị chặn
 * ngay ở client, không gửi request). Sai state → server trả 409: caller phải refetch, KHÔNG tự retry.
 */
export async function updateStaffTableSessionStatus(id: number, status: StaffSessionPatchStatus): Promise<StaffTableSession> {
  assertId(id, 'id phiên bàn');
  if (!STAFF_SESSION_PATCH_STATUSES.includes(status)) throw validation(`Trạng thái không được phép gửi: ${String(status)}`);
  return toStaffTableSession(await http.patch<unknown>(`/table-sessions/${id}/status`, { status }, { snake: true }));
}

/**
 * Tra "phiên này còn mở không, đang ở trạng thái nào" sau khi thanh toán (spec chưa có GET /table-sessions/{id} cho Staff).
 * Hai lần gọi song song theo từng status (Active, Payment_Pending); số phiên mở ≤ số bàn nên một trang size 100 là đủ.
 * Trả null khi không thấy trong hai danh sách đó (đã Completed/Cancelled hoặc không thuộc chi nhánh).
 */
export async function findOpenStaffTableSession(branchId: number, sessionId: number, signal?: AbortSignal): Promise<StaffTableSession | null> {
  assertId(sessionId, 'id phiên bàn');
  const [active, pending] = await Promise.all([
    listStaffTableSessions({ branchId, status: 'Active', size: MAX_PAGE_SIZE }, signal),
    listStaffTableSessions({ branchId, status: 'Payment_Pending', size: MAX_PAGE_SIZE }, signal),
  ]);
  return [...active.items, ...pending.items].find((s) => s.id === sessionId) ?? null;
}
