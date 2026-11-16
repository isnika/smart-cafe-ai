import type {
  FulfillmentType,
  IsoDateTime,
  OrderDetail,
  OrderItemDetail,
  OrderSource,
  OrderStatus,
  OrderStatusHistory,
  PaymentStatus,
} from '@/shared/types';

/**
 * API types cho đơn của CHÍNH khách đăng nhập (SmartAPI sheet "4. Order"):
 *   GET /orders/me          → mảng order summary + meta
 *   GET /orders/me/{id}     → order + items[] + status_history[]
 *   GET /orders/{id}/history→ [{id, order_id, from_status, status, changed_by, note, created_at}]
 *
 * Tái dùng OrderStatus / PaymentStatus / OrderDetail của types.ts (không sửa types.ts).
 * OrderStatus (vòng đời đơn) và PaymentStatus (read-model từ Payment) là HAI trường tách biệt, không trộn.
 */

/** Mã lỗi phía FE khi response 2xx nhưng sai hình dạng spec (enum lạ, thiếu field bắt buộc…). */
export const INVALID_RESPONSE_CODE = 'INVALID_RESPONSE';
/** Mã lỗi phía FE khi tham số gọi hàm sai (id/page/size) – không gửi request. */
export const VALIDATION_ERROR_CODE = 'VALIDATION_ERROR';

/** Mã lỗi 409 của PATCH /orders/{id}/status khi cạnh trạng thái không hợp lệ (khác INVALID_TRANSITION của API legacy). */
export const INVALID_STATE_TRANSITION_CODE = 'INVALID_STATE_TRANSITION';
/** Mã lỗi 422: vi phạm quy tắc nghiệp vụ (vd: đơn đã thanh toán không hủy được qua endpoint này). */
export const BUSINESS_RULE_VIOLATION_CODE = 'BUSINESS_RULE_VIOLATION';
/** Spec: cancel_reason ≤ 255 ký tự. */
export const MAX_CANCEL_REASON_LENGTH = 255;

export const ORDER_STATUS_VALUES: readonly OrderStatus[] = [
  'Pending_Payment',
  'Pending',
  'Confirmed',
  'Preparing',
  'Ready',
  'Shipping',
  'Served',
  'Completed',
  'Cancelled',
  'Rejected',
];

export const PAYMENT_STATUS_VALUES: readonly PaymentStatus[] = ['Unpaid', 'Paid', 'Partially_Refunded', 'Refunded'];

export const ORDER_SOURCE_VALUES: readonly OrderSource[] = ['Online', 'QR', 'POS'];
export const FULFILLMENT_TYPE_VALUES: readonly FulfillmentType[] = ['Delivery', 'Pickup', 'Dine_In'];

/** Spec: `sort=field,asc|desc`. Tên field cụ thể chưa được spec liệt kê → chỉ ràng buộc hình dạng. */
export type OrderSort = `${string},asc` | `${string},desc`;

/** Query của GET /orders/me. `status` / `paymentStatus` là MỘT giá trị (spec chưa xác nhận hỗ trợ nhiều giá trị). */
export interface ListMyOrdersParams {
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  /** ISO 8601 (UTC khuyến nghị). */
  from?: IsoDateTime;
  to?: IsoDateTime;
  /** Bắt đầu từ 1 (server mặc định 1). */
  page?: number;
  /** 1..100 (server mặc định 20, tối đa 100). */
  size?: number;
  sort?: OrderSort;
}

/** meta phân trang của spec, đã chuẩn hoá (luôn có đủ 4 số). */
export interface PageMeta {
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PageMeta;
}

/**
 * Một phần tử của GET /orders/me. Spec chỉ ghi "order summary..." (không liệt kê field) nên chỉ các field
 * định danh/trạng thái/tổng tiền là bắt buộc; phần còn lại là `null` khi server không trả.
 */
export interface MyOrderSummary {
  id: number;
  orderCode: string;
  branchId: number;
  orderSource: OrderSource;
  fulfillmentType: FulfillmentType;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  finalAmount: number;
  createdAt: IsoDateTime;

  subTotal: number | null;
  itemDiscountAmount: number | null;
  voucherCode: string | null;
  voucherDiscountAmount: number | null;
  deliveryFee: number | null;
  vatAmount: number | null;

  deliveryName: string | null;
  deliveryPhone: string | null;
  deliveryAddress: string | null;

  expiresAt: IsoDateTime | null;
  cancelReason: string | null;
  cancelledAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  note: string | null;
  /** Dùng cho optimistic lock khi huỷ – null nếu summary không trả; lấy lại từ GET /orders/me/{id}. */
  version: number | null;
  updatedAt: IsoDateTime | null;

  /** Chỉ có khi server nhúng; không suy ra từ nơi khác. */
  itemCount: number | null;
  items?: OrderItemDetail[];
}

/** Chi tiết đơn của khách = OrderDetail hiện có (items[] + options[] + statusHistory[]). */
export type MyOrderDetail = OrderDetail;

/** Một dòng lịch sử trạng thái. Giống OrderStatusHistory nhưng `fromStatus` được ràng buộc là OrderStatus. */
export interface OrderHistoryEntry extends Omit<OrderStatusHistory, 'fromStatus'> {
  fromStatus: OrderStatus | null;
}

/** Input hủy đơn của khách. `version` PHẢI lấy từ bản đơn mới nhất (GET /orders/me/{id}). */
export interface CancelMyOrderInput {
  cancelReason: string;
  version: number;
}

/** Response RÚT GỌN của PATCH /orders/{id}/status (không phải OrderDetail → refetch để có dữ liệu đầy đủ). */
export interface OrderStatusChangeResult {
  id: number;
  orderCode: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  cancelReason: string | null;
  cancelledBy: string | null;
  cancelledAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  version: number;
  updatedAt: IsoDateTime;
}
