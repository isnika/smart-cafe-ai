import { ApiError } from './http';
import type { TableSessionStatus, TableStatus } from '@/shared/types';
import type { StaffTable, StaffTableSession } from './staff-table.types';

type Loose = Record<string, unknown>;
const isRecord = (v: unknown): v is Loose => v !== null && typeof v === 'object' && !Array.isArray(v);
const invalid = (what: string): ApiError => new ApiError(502, { code: 'INVALID_RESPONSE', message: `Phản hồi ${what} không hợp lệ` });

/** id bigint có thể về dạng chuỗi số → number an toàn; còn lại là null. */
const intOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isSafeInteger(n) ? n : null;
};
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

const SESSION_STATUSES: readonly TableSessionStatus[] = ['Active', 'Payment_Pending', 'Completed', 'Cancelled'];
const isSessionStatus = (v: unknown): v is TableSessionStatus => SESSION_STATUSES.includes(v as TableSessionStatus);
/** Trạng thái bàn lạ/thiếu → null: không đoán, không suy từ phiên. */
const toTableStatus = (v: unknown): TableStatus | null => (v === 'Empty' || v === 'Occupied' ? v : null);

export function toStaffTable(raw: unknown): StaffTable {
  if (!isRecord(raw)) throw invalid('bàn');
  const id = intOrNull(raw.id);
  const branchId = intOrNull(raw.branchId);
  const tableNumber = strOrNull(raw.tableNumber);
  if (id === null || branchId === null || tableNumber === null) throw invalid('bàn');
  return {
    id,
    branchId,
    tableNumber,
    qrCode: strOrNull(raw.qrCode),
    // Cột is_active NOT NULL DEFAULT 1: thiếu field thì coi là đang phục vụ (khớp quy ước types.ts).
    isActive: typeof raw.isActive === 'boolean' ? raw.isActive : true,
    status: toTableStatus(raw.status),
    openSessionId: intOrNull(raw.openSessionId),
  };
}

export function toStaffTables(raw: unknown): StaffTable[] {
  if (!Array.isArray(raw)) throw invalid('danh sách bàn');
  return raw.map(toStaffTable);
}

export function toStaffTableSession(raw: unknown): StaffTableSession {
  if (!isRecord(raw)) throw invalid('phiên bàn');
  const id = intOrNull(raw.id);
  const tableId = intOrNull(raw.tableId);
  if (id === null || tableId === null || !isSessionStatus(raw.status)) throw invalid('phiên bàn');
  return {
    id,
    tableId,
    customerId: strOrNull(raw.customerId),
    status: raw.status,
    openedAt: strOrNull(raw.openedAt),
    expiresAt: strOrNull(raw.expiresAt),
    closedAt: strOrNull(raw.closedAt),
    branchId: intOrNull(raw.branchId),
    tableNumber: strOrNull(raw.tableNumber),
  };
}

export function toStaffTableSessions(raw: unknown): StaffTableSession[] {
  if (!Array.isArray(raw)) throw invalid('danh sách phiên bàn');
  return raw.map(toStaffTableSession);
}
