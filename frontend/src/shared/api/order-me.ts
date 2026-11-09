import { ApiError, http } from './http';
import { toMyOrderDetail, toMyOrderSummaries, toOrderHistory, toPageMeta, toStatusChangeResult } from './order-me.mapper';
import { MAX_CANCEL_REASON_LENGTH, VALIDATION_ERROR_CODE } from './order-me.types';
import type {
  CancelMyOrderInput,
  ListMyOrdersParams,
  MyOrderDetail,
  MyOrderSummary,
  OrderHistoryEntry,
  OrderStatusChangeResult,
  PaginatedResult,
} from './order-me.types';

/**
 * Order API cho khách đã đăng nhập (SmartAPI v1, sheet "4. Order").
 * Dùng http.ts mặc định → Bearer + refresh single-flight; KHÔNG gắn header guest (X-Table-Session-Code/X-Client-Key).
 * Đọc + `cancelMyOrder` (PATCH huỷ của khách). Không có refund, không đụng listOrders/getOrder/changeOrderStatus (legacy, staff dùng).
 */

export const MAX_PAGE_SIZE = 100;

const validation = (message: string): ApiError => new ApiError(400, { message, code: VALIDATION_ERROR_CODE });

const assertId = (id: number): void => {
  if (!Number.isSafeInteger(id) || id <= 0) throw validation(`id đơn không hợp lệ: ${String(id)}`);
};

const assertPaging = (page?: number, size?: number): void => {
  if (page !== undefined && (!Number.isInteger(page) || page < 1)) throw validation(`page phải là số nguyên >= 1: ${page}`);
  if (size !== undefined && (!Number.isInteger(size) || size < 1 || size > MAX_PAGE_SIZE)) {
    throw validation(`size phải trong khoảng 1..${MAX_PAGE_SIZE}: ${size}`);
  }
};

/**
 * GET /orders/me — query: status, payment_status, from, to, page, size, sort. Trả mảng + meta{page,size,total}.
 * Tham số không đặt thì không gửi (server dùng mặc định page=1, size=20).
 */
export async function listMyOrders(
  params: ListMyOrdersParams = {},
  signal?: AbortSignal,
): Promise<PaginatedResult<MyOrderSummary>> {
  assertPaging(params.page, params.size);
  const { data, meta } = await http.getWithMeta<unknown>('/orders/me', {
    // Key query theo spec (snake_case); buildQuery bỏ giá trị undefined.
    query: {
      status: params.status,
      payment_status: params.paymentStatus,
      from: params.from,
      to: params.to,
      page: params.page,
      size: params.size,
      sort: params.sort,
    },
    signal,
  });
  const items = toMyOrderSummaries(data);
  return { items, meta: toPageMeta(meta, { page: params.page ?? 1, size: params.size ?? items.length, count: items.length }) };
}

/** GET /orders/me/{id} — 404 khi không tồn tại HOẶC không thuộc khách này (không phân biệt, chống dò id). */
export async function getMyOrder(id: number, signal?: AbortSignal): Promise<MyOrderDetail> {
  assertId(id);
  return toMyOrderDetail(await http.get<unknown>(`/orders/me/${id}`, { signal }));
}

/**
 * GET /orders/{id}/history — spec cho phép Customer (chủ đơn), Staff, Manager.
 * Trả cũ → mới. 403/404 nếu không có quyền xem đơn.
 */
export async function getOrderHistory(id: number, signal?: AbortSignal): Promise<OrderHistoryEntry[]> {
  assertId(id);
  return toOrderHistory(await http.get<unknown>(`/orders/${id}/history`, { signal }), id);
}

/**
 * PATCH /orders/{id}/status — KHÁCH hủy đơn của chính mình. Body đúng spec: { status:'Cancelled', cancel_reason, version }.
 * `version` do người gọi truyền (lấy từ bản đơn mới nhất); hàm KHÔNG tự đọc lại, KHÔNG tự gửi lại khi 409.
 * Lỗi giữ nguyên ApiError: 409 VERSION_CONFLICT / INVALID_STATE_TRANSITION, 404 (không phải chủ đơn), 422 BUSINESS_RULE_VIOLATION…
 * Quyền sở hữu do server quyết định; không gửi user id nào.
 */
export async function cancelMyOrder(
  id: number,
  input: CancelMyOrderInput,
  signal?: AbortSignal,
): Promise<OrderStatusChangeResult> {
  assertId(id);
  const cancelReason = input.cancelReason.trim();
  if (cancelReason === '') throw validation('cancel_reason là bắt buộc');
  if (cancelReason.length > MAX_CANCEL_REASON_LENGTH) throw validation(`cancel_reason tối đa ${MAX_CANCEL_REASON_LENGTH} ký tự`);
  if (!Number.isSafeInteger(input.version) || input.version < 1) throw validation(`version phải là số nguyên >= 1: ${String(input.version)}`);
  const data = await http.patch<unknown>(
    `/orders/${id}/status`,
    { status: 'Cancelled', cancelReason, version: input.version },
    { signal, snake: true },
  );
  return toStatusChangeResult(data);
}
