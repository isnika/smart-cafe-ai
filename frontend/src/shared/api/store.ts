import type {
  Branch,
  ListSchedulesParams,
  OpenTableSessionInput,
  ScheduleView,
  Shift,
  TableBill,
  TableSession,
  TableStatusView,
  Timekeeping,
  TimekeepingScanInput,
} from '@/shared/types';
import { http } from './http';

const P = '/store';

// Branch / Table / TableSession
export const listBranches = () => http.get<Branch[]>(`${P}/branches`, { auth: false });
export const getBranch = (id: number) => http.get<Branch>(`${P}/branches/${id}`, { auth: false });
export const listTables = (branchId: number) => http.get<TableStatusView[]>(`${P}/branches/${branchId}/tables`);

/** Khách quét QR bàn → mở (hoặc nối lại) session. */
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