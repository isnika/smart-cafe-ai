import type { TableSessionStatus, TableStatus } from '@/shared/types';
import type { StaffSessionPatchStatus, StaffTable, StaffTableSession } from '@/shared/api/staff-table.types';
import type { BadgeTone } from '@/shared/ui';

export const SESSION_STATUS_LABEL: Record<TableSessionStatus, string> = {
  Active: 'Đang phục vụ',
  Payment_Pending: 'Chờ thanh toán',
  Completed: 'Đã hoàn tất',
  Cancelled: 'Đã hủy',
};

export const SESSION_STATUS_TONE: Record<TableSessionStatus, BadgeTone> = {
  Active: 'info',
  Payment_Pending: 'warning',
  Completed: 'success',
  Cancelled: 'neutral',
};

export const TABLE_STATUS_LABEL: Record<TableStatus, string> = { Empty: 'Trống', Occupied: 'Đang có khách' };

/** `open` = Active + Payment_Pending (hai lần gọi, vì spec không nói rõ status đa trị). */
export type SessionFilter = 'open' | TableSessionStatus;

export const SESSION_FILTERS: { id: SessionFilter; label: string }[] = [
  { id: 'Payment_Pending', label: 'Chờ thanh toán' },
  { id: 'open', label: 'Đang mở' },
  { id: 'Active', label: 'Đang phục vụ' },
  { id: 'Completed', label: 'Đã hoàn tất' },
  { id: 'Cancelled', label: 'Đã hủy' },
];

export const EMPTY_SESSIONS: Record<SessionFilter, string> = {
  open: 'Hiện không có phiên bàn nào đang mở.',
  Payment_Pending: 'Không có phiên nào đang chờ thanh toán.',
  Active: 'Không có phiên nào đang phục vụ.',
  Completed: 'Chưa có phiên nào hoàn tất.',
  Cancelled: 'Chưa có phiên nào bị hủy.',
};

/**
 * Thao tác UI cho phép theo trạng thái phiên. Chỉ là gợi ý hiển thị; server mới là nơi quyết định chuyển trạng thái
 * hợp lệ (sai → 409). "Hoàn tất" chỉ đưa ra khi phiên đã Payment_Pending theo luồng sau thanh toán.
 */
export function sessionActions(status: TableSessionStatus): StaffSessionPatchStatus[] {
  if (status === 'Payment_Pending') return ['Completed', 'Cancelled'];
  if (status === 'Active') return ['Cancelled'];
  return [];
}

export const SESSION_SUCCESS: Record<StaffSessionPatchStatus, string> = {
  Payment_Pending: 'Đã chuyển phiên sang chờ thanh toán.',
  Completed: 'Đã hoàn tất phiên bàn.',
  Cancelled: 'Đã hủy phiên bàn.',
};

export const CONFLICT_MESSAGE = 'Phiên bàn vừa được cập nhật bởi người khác. Đã tải lại dữ liệu mới nhất, vui lòng kiểm tra rồi thao tác lại nếu cần.';

/** Nhãn bàn của một phiên: ưu tiên table_number◇ của server, sau đó tra danh sách bàn; không có thì dùng id bàn. */
export function tableLabelOf(session: Pick<StaffTableSession, 'tableId' | 'tableNumber'>, tables: readonly StaffTable[] | undefined): string {
  const number = session.tableNumber ?? tables?.find((t) => t.id === session.tableId)?.tableNumber;
  return number ? `Bàn ${number}` : `Bàn #${session.tableId}`;
}

/** Đếm theo status do server trả (không suy diễn): bàn status=null không thuộc nhóm nào. */
export function countTables(tables: readonly StaffTable[]): { empty: number; occupied: number; unknown: number } {
  let empty = 0;
  let occupied = 0;
  let unknown = 0;
  for (const t of tables) {
    if (t.status === 'Empty') empty += 1;
    else if (t.status === 'Occupied') occupied += 1;
    else unknown += 1;
  }
  return { empty, occupied, unknown };
}
