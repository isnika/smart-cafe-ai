import { ApiError, clearSessionCode, isApiError, loadSessionCode, saveSessionCode, storeApi } from '@/shared/api';
import type { TableSession } from '@/shared/types';
import { useAuthStore } from '@/features/auth/store';

/** Phiên bàn + thông tin bàn/chi nhánh (POST sessions không trả branch_id◇/table_number◇ nên ghép từ GET /qr). */
export interface DineInSession extends TableSession {
  tableCode: string;
  tableNumber: string;
  branchId: number;
  branchName: string;
}

const isOpen = (s: TableSession) => s.status === 'Active' || s.status === 'Payment_Pending';

/**
 * Mở (hoặc nối lại) phiên bàn cho mã QR trong URL:
 *  1. GET /qr/{qr_code}            → bàn + chi nhánh (bàn khoá → 409 TABLE_INACTIVE)
 *  2. có session_code đã lưu       → GET /table-sessions/current (F5 / mở lại tab); hết hiệu lực thì xoá và tạo mới
 *  3. POST /qr/{qr_code}/sessions  → tạo/lấy phiên mở (200|201), lưu session_code theo tableCode
 * Bàn có phiên khác đang mở/chờ thanh toán → server trả 409 (ApiError.status 409) để UI báo thân thiện.
 */
export async function openDineInSession(tableCode: string): Promise<DineInSession> {
  const table = await storeApi.getQr(tableCode);
  if (!table.tableIsActive) {
    throw new ApiError(409, { code: 'TABLE_INACTIVE', message: `Bàn ${table.tableNumber} đang tạm ngưng phục vụ` });
  }
  const merge = (s: storeApi.CurrentTableSession): DineInSession => ({
    ...s,
    tableCode,
    tableNumber: s.tableNumber ?? table.tableNumber,
    branchId: s.branchId ?? table.branch.id,
    branchName: table.branch.name,
  });

  const saved = loadSessionCode(tableCode);
  if (saved) {
    try {
      const current = await storeApi.getCurrentSession(saved);
      if (isOpen(current)) return merge(current);
      clearSessionCode(tableCode);
    } catch (e) {
      // Chỉ bỏ mã khi server nói rõ mã không còn dùng được; lỗi mạng/5xx → để caller thử lại, không tạo phiên mới.
      if (isApiError(e) && [401, 403, 404].includes(e.status)) clearSessionCode(tableCode);
      else throw e;
    }
  }

  const created = await storeApi.createQrSession(tableCode, { accessToken: useAuthStore.getState().accessToken });
  saveSessionCode(tableCode, created.sessionCode);
  return merge(created);
}

/** Thông báo thân thiện cho lỗi mở phiên (409 bàn/phiên xung đột, 404 mã QR sai…). */
export function describeSessionError(err: unknown): { title: string; message: string; retryable: boolean } {
  if (!isApiError(err)) return { title: 'Không thể mở bàn', message: 'Đã có lỗi xảy ra. Vui lòng thử lại.', retryable: true };
  if (err.is('TABLE_INACTIVE')) return { title: 'Bàn tạm ngưng phục vụ', message: err.message, retryable: false };
  if (err.status === 404) {
    return { title: 'Không nhận diện được mã bàn', message: 'Mã QR không hợp lệ hoặc đã được đổi. Vui lòng quét lại mã trên bàn.', retryable: false };
  }
  if (err.status === 409) {
    return {
      title: 'Bàn đang được sử dụng',
      message: 'Bàn này đang có phiên gọi món khác hoặc đang chờ thanh toán. Vui lòng liên hệ nhân viên để được hỗ trợ.',
      retryable: false,
    };
  }
  const retryable = err.status === 0 || err.status >= 500;
  return { title: 'Không thể mở bàn', message: err.message, retryable };
}
