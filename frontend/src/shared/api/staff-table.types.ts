import type { IsoDateTime, TableSessionStatus, TableStatus } from '@/shared/types';
import type { PageMeta } from './order-me.types';

/** Các trạng thái PATCH /table-sessions/{id}/status chấp nhận (spec). `Active` không được phép gửi. */
export type StaffSessionPatchStatus = 'Payment_Pending' | 'Completed' | 'Cancelled';
export const STAFF_SESSION_PATCH_STATUSES: readonly StaffSessionPatchStatus[] = ['Payment_Pending', 'Completed', 'Cancelled'];

/**
 * Một dòng của GET /branches/{branchId}/tables. `status` và `openSessionId` là field ◇ do server suy ra từ v_table_status:
 * FE chỉ hiển thị, KHÔNG tự tính từ danh sách phiên. Server không trả → `null` (UI hiện "Không rõ").
 */
export interface StaffTable {
  id: number;
  branchId: number;
  tableNumber: string;
  qrCode: string | null;
  isActive: boolean;
  status: TableStatus | null;
  openSessionId: number | null;
}

/**
 * Một phiên bàn trong GET /table-sessions và response PATCH. Cố ý KHÔNG có `sessionCode`:
 * đó là token bí mật của khách (header X-Table-Session-Code), nhân viên không cần và không nên giữ.
 */
export interface StaffTableSession {
  id: number;
  tableId: number;
  customerId: string | null;
  status: TableSessionStatus;
  openedAt: IsoDateTime | null;
  expiresAt: IsoDateTime | null;
  closedAt: IsoDateTime | null;
  branchId: number | null;
  tableNumber: string | null;
}

export interface ListStaffTablesParams {
  isActive?: boolean;
  status?: TableStatus;
}

export interface ListStaffSessionsParams {
  branchId?: number;
  status?: TableSessionStatus;
  tableId?: number;
  page?: number;
  size?: number;
}

export interface StaffSessionPage {
  items: StaffTableSession[];
  meta: PageMeta;
}
