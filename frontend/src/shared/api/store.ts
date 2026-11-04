import type {
  Branch,
  ListSchedulesParams,
  OpenTableSessionInput,
  ScheduleView,
  Shift,
  TableBill,
  TableSession,
  TableSessionStatus,
  TableStatus,
  TableStatusView,
  Timekeeping,
  TimekeepingScanInput,
} from '@/shared/types';
import { http } from './http';
import { guestHeaders } from './guest';

const P = '/store';

// ── Chi nhánh (spec: GET /branches, GET /branches/{id}; công khai) ────
/** DECIMAL(15,0)/(5,2) có thể về dạng chuỗi → number. */
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Mapper chi nhánh: tiền/toạ độ/bán kính về number, deliveryFee mặc định 0 (cột DEFAULT 0). */
export function toBranch(raw: Branch): Branch {
  return {
    ...raw,
    latitude: num(raw.latitude),
    longitude: num(raw.longitude),
    deliveryRadiusKm: num(raw.deliveryRadiusKm),
    deliveryFee: num(raw.deliveryFee) ?? 0,
    acceptsOnlineOrders: raw.acceptsOnlineOrders ?? true,
  };
}

export const listBranches = async (params: { status?: 'Active' | 'Inactive'; q?: string } = {}) =>
  (await http.get<Branch[]>('/branches', { query: params, auth: false })).map(toBranch);
export const getBranch = async (id: number) => toBranch(await http.get<Branch>(`/branches/${id}`, { auth: false }));

// ── Bàn & QR / Phiên bàn (guest, không cần đăng nhập) ─────────────────
export const listTables = (branchId: number) => http.get<TableStatusView[]>(`${P}/branches/${branchId}/tables`);

/** GET /qr/{qr_code}: bàn + chi nhánh của mã QR (status◇ Empty|Occupied, open_session_id◇). */
export interface QrTableInfo {
  tableId: number;
  tableNumber: string;
  branch: { id: number; name: string };
  tableIsActive: boolean;
  status?: TableStatus;
  openSessionId?: number | null;
}
export const getQr = (qrCode: string) => http.get<QrTableInfo>(`/qr/${encodeURIComponent(qrCode)}`, { auth: false });

/** GET /table-sessions/current kèm branch_id◇, table_number◇. */
export interface CurrentTableSession extends TableSession {
  branchId?: number;
  tableNumber?: string;
}

/**
 * POST /qr/{qr_code}/sessions: tạo hoặc lấy phiên mở của bàn (200 = nối lại, 201 = mới).
 * Bearer là tuỳ chọn (customer_id lấy từ token). auth:false → 401 ở đây KHÔNG kích hoạt refresh/logout của lát 1;
 * nếu khách đã đăng nhập thì truyền accessToken để server gắn customer_id.
 */
export const createQrSession = (qrCode: string, opts: { accessToken?: string | null } = {}) =>
  http.post<CurrentTableSession>(`/qr/${encodeURIComponent(qrCode)}/sessions`, undefined, {
    auth: false,
    ...(opts.accessToken ? { headers: { Authorization: `Bearer ${opts.accessToken}` } } : {}),
  });

/** GET /table-sessions/current (header X-Table-Session-Code). */
export const getCurrentSession = (sessionCode: string, signal?: AbortSignal) =>
  http.get<CurrentTableSession>('/table-sessions/current', { auth: false, headers: guestHeaders(sessionCode), signal });

/** POST /table-sessions/current/request-payment: Active → Payment_Pending. Sai state → 409. */
export const requestPayment = (sessionCode: string) =>
  http.post<{ id: number; status: TableSessionStatus }>('/table-sessions/current/request-payment', undefined, {
    auth: false,
    headers: guestHeaders(sessionCode),
  });

// ── Legacy (mock cũ /store/*): chỉ còn test helper dùng; luồng Dine-in đã chuyển sang getQr/createQrSession ──
/** @deprecated Dùng createQrSession (POST /qr/{qr_code}/sessions). */
export const openTableSession = (input: OpenTableSessionInput) =>
  http.post<TableSession>(`${P}/table-sessions`, input, { auth: false });
export const getTableSession = (sessionCode: string) =>
  http.get<TableSession>(`${P}/table-sessions/${encodeURIComponent(sessionCode)}`, { auth: false });
export const getTableBill = (sessionId: number) => http.get<TableBill>(`${P}/table-sessions/${sessionId}/bill`);

// Workforce
export const listShifts = (branchId: number) => http.get<Shift[]>(`${P}/branches/${branchId}/shifts`);
export const listSchedules = (params: ListSchedulesParams) => http.get<ScheduleView[]>(`${P}/schedules`, { query: params });
export const checkIn = (input: TimekeepingScanInput) => http.post<Timekeeping>(`${P}/timekeeping/check-in`, input);
export const checkOut = (input: TimekeepingScanInput) => http.post<Timekeeping>(`${P}/timekeeping/check-out`, input);