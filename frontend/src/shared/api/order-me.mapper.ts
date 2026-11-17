import type {
  FulfillmentType,
  IsoDateTime,
  OrderItemDetail,
  OrderItemOption,
  OrderSource,
  OrderStatus,
  PaymentStatus,
} from '@/shared/types';
import { toUtcIso } from '@/shared/lib';
import { ApiError } from './http';
import type { ApiMeta } from './http';
import {
  FULFILLMENT_TYPE_VALUES,
  INVALID_RESPONSE_CODE,
  ORDER_SOURCE_VALUES,
  ORDER_STATUS_VALUES,
  PAYMENT_STATUS_VALUES,
} from './order-me.types';
import type { MyOrderDetail, MyOrderSummary, OrderHistoryEntry, OrderStatusChangeResult, PageMeta } from './order-me.types';

/**
 * Mapper cho response của /orders/me, /orders/me/{id}, /orders/{id}/history.
 * Đầu vào là payload ĐÃ qua http.ts (key camelCase, timestamp thiếu timezone đã thêm 'Z').
 * Mapper vẫn gọi toUtcIso một lần nữa nên đúng cả khi bị gọi với payload thô.
 *
 * Quy ước lỗi: response 2xx sai hình dạng spec → ApiError(502, code INVALID_RESPONSE), không im lặng đoán giá trị.
 */

type Loose = Record<string, unknown>;

const invalid = (what: string, detail?: string): ApiError =>
  new ApiError(502, {
    message: `Phản hồi ${what} không hợp lệ${detail ? ` (${detail})` : ''}`,
    code: INVALID_RESPONSE_CODE,
  });

const isRecord = (v: unknown): v is Loose => v !== null && typeof v === 'object' && !Array.isArray(v);

// ── Primitive helpers ─────────────────────────────────────────────────
/** DECIMAL có thể về dạng chuỗi ("85000.00") → number; rỗng/NaN → null. */
const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

const reqNum = (r: Loose, key: string, what: string): number => {
  const n = toNum(r[key]);
  if (n === null) throw invalid(what, `thiếu hoặc sai số: ${key}`);
  return n;
};

const optStr = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

const reqStr = (r: Loose, key: string, what: string): string => {
  const s = optStr(r[key]);
  if (s === null) throw invalid(what, `thiếu chuỗi: ${key}`);
  return s;
};

/** Datetime: chuẩn hoá về ISO có offset (thiếu timezone → UTC). Không parse được → null. */
const optDate = (v: unknown): IsoDateTime | null => {
  const s = optStr(v);
  return s === null ? null : (toUtcIso(s) ?? null);
};

const reqDate = (r: Loose, key: string, what: string): IsoDateTime => {
  const d = optDate(r[key]);
  if (d === null) throw invalid(what, `thiếu hoặc sai datetime: ${key}`);
  return d;
};

const oneOf = <T extends string>(values: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (values as readonly string[]).includes(v);

const reqEnum = <T extends string>(values: readonly T[], r: Loose, key: string, what: string): T => {
  const v = r[key];
  if (!oneOf(values, v)) throw invalid(what, `giá trị không hợp lệ: ${key}=${String(v)}`);
  return v;
};

export const toOrderStatus = (r: Loose, key: string, what: string): OrderStatus => reqEnum(ORDER_STATUS_VALUES, r, key, what);
export const toPaymentStatus = (r: Loose, key: string, what: string): PaymentStatus =>
  reqEnum(PAYMENT_STATUS_VALUES, r, key, what);
const toOrderSource = (r: Loose, what: string): OrderSource => reqEnum(ORDER_SOURCE_VALUES, r, 'orderSource', what);
const toFulfillment = (r: Loose, what: string): FulfillmentType =>
  reqEnum(FULFILLMENT_TYPE_VALUES, r, 'fulfillmentType', what);

// ── Items ─────────────────────────────────────────────────────────────
function toItemOption(raw: unknown, orderItemId: number): OrderItemOption {
  if (!isRecord(raw)) throw invalid('đơn hàng', 'option không phải object');
  return {
    // Spec không liệt kê field của items[]/options[]; id nội bộ không quyết định nghiệp vụ → 0 nếu thiếu.
    id: toNum(raw.id) ?? 0,
    orderItemId: toNum(raw.orderItemId) ?? orderItemId,
    optionId: reqNum(raw, 'optionId', 'option của đơn'),
    optionName: optStr(raw.optionName) ?? '',
    quantity: toNum(raw.quantity) ?? 1,
    unitPrice: toNum(raw.unitPrice) ?? 0,
  };
}

function toItem(raw: unknown, orderId: number): OrderItemDetail {
  if (!isRecord(raw)) throw invalid('đơn hàng', 'item không phải object');
  const id = reqNum(raw, 'id', 'dòng món');
  return {
    id,
    orderId: toNum(raw.orderId) ?? orderId,
    productId: reqNum(raw, 'productId', 'dòng món'),
    variantId: reqNum(raw, 'variantId', 'dòng món'),
    productName: optStr(raw.productName) ?? '',
    variantName: optStr(raw.variantName) ?? '',
    quantity: reqNum(raw, 'quantity', 'dòng món'),
    unitPrice: toNum(raw.unitPrice) ?? 0,
    optionsUnitTotal: toNum(raw.optionsUnitTotal) ?? 0,
    discountAmount: toNum(raw.discountAmount) ?? 0,
    isRewardItem: raw.isRewardItem === true,
    lineTotal: toNum(raw.lineTotal) ?? 0,
    note: optStr(raw.note),
    options: (Array.isArray(raw.options) ? raw.options : []).map((o) => toItemOption(o, id)),
  };
}

// ── History ───────────────────────────────────────────────────────────
function toHistoryEntry(raw: unknown, fallbackOrderId?: number): OrderHistoryEntry {
  const what = 'lịch sử đơn';
  if (!isRecord(raw)) throw invalid(what, 'phần tử không phải object');
  const from = raw.fromStatus;
  const orderId = toNum(raw.orderId) ?? fallbackOrderId;
  if (orderId === undefined) throw invalid(what, 'thiếu orderId');
  return {
    id: reqNum(raw, 'id', what),
    orderId,
    // from_status null ở dòng đầu tiên (đơn mới tạo); có giá trị thì phải là OrderStatus hợp lệ.
    fromStatus: from === null || from === undefined || from === '' ? null : toOrderStatus(raw, 'fromStatus', what),
    status: toOrderStatus(raw, 'status', what),
    changedBy: optStr(raw.changedBy), // null = hệ thống
    note: optStr(raw.note),
    createdAt: reqDate(raw, 'createdAt', what),
  };
}

/** Cũ → mới (createdAt, rồi id) để UI vẽ timeline mà không phụ thuộc thứ tự server. Không đổi mảng đầu vào. */
const byTimeline = (a: OrderHistoryEntry, b: OrderHistoryEntry): number =>
  Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id;

export function toOrderHistory(raw: unknown, fallbackOrderId?: number): OrderHistoryEntry[] {
  if (!Array.isArray(raw)) throw invalid('lịch sử đơn', 'data không phải mảng');
  return raw.map((e) => toHistoryEntry(e, fallbackOrderId)).sort(byTimeline);
}

// ── Detail ────────────────────────────────────────────────────────────
/** GET /orders/me/{id}: order + items[] + status_history[] (nhận cả `history` – xem H8 trong P4_RECONNAISSANCE). */
export function toMyOrderDetail(raw: unknown): MyOrderDetail {
  const what = 'chi tiết đơn';
  if (!isRecord(raw)) throw invalid(what, 'data không phải object');
  const id = reqNum(raw, 'id', what);
  const historyRaw = raw.statusHistory ?? raw.history ?? [];
  const money = (key: string): number => toNum(raw[key]) ?? 0;
  return {
    id,
    orderCode: reqStr(raw, 'orderCode', what),
    idempotencyKey: optStr(raw.idempotencyKey),
    userId: optStr(raw.userId),
    createdBy: optStr(raw.createdBy),
    branchId: reqNum(raw, 'branchId', what),
    tableSessionId: toNum(raw.tableSessionId),
    orderSource: toOrderSource(raw, what),
    fulfillmentType: toFulfillment(raw, what),

    deliveryName: optStr(raw.deliveryName),
    deliveryPhone: optStr(raw.deliveryPhone),
    deliveryAddress: optStr(raw.deliveryAddress),
    deliveryLatitude: toNum(raw.deliveryLatitude),
    deliveryLongitude: toNum(raw.deliveryLongitude),

    subTotal: money('subTotal'),
    itemDiscountAmount: money('itemDiscountAmount'),
    voucherCode: optStr(raw.voucherCode),
    voucherDiscountAmount: money('voucherDiscountAmount'),
    deliveryFee: money('deliveryFee'),
    vatAmount: money('vatAmount'),
    finalAmount: reqNum(raw, 'finalAmount', what),

    status: toOrderStatus(raw, 'status', what),
    paymentStatus: toPaymentStatus(raw, 'paymentStatus', what),
    expiresAt: optDate(raw.expiresAt),
    cancelReason: optStr(raw.cancelReason),
    cancelledBy: optStr(raw.cancelledBy),
    cancelledAt: optDate(raw.cancelledAt),
    completedAt: optDate(raw.completedAt),
    note: optStr(raw.note),
    version: reqNum(raw, 'version', what),
    createdAt: reqDate(raw, 'createdAt', what),
    updatedAt: reqDate(raw, 'updatedAt', what),

    tableNumber: optStr(raw.tableNumber),
    items: (Array.isArray(raw.items) ? raw.items : []).map((i) => toItem(i, id)),
    statusHistory: toOrderHistory(historyRaw, id),
  };
}

// ── List ──────────────────────────────────────────────────────────────
function toSummary(raw: unknown): MyOrderSummary {
  const what = 'danh sách đơn';
  if (!isRecord(raw)) throw invalid(what, 'phần tử không phải object');
  const id = reqNum(raw, 'id', what);
  const optMoney = (key: string): number | null => toNum(raw[key]);
  return {
    id,
    orderCode: reqStr(raw, 'orderCode', what),
    branchId: reqNum(raw, 'branchId', what),
    orderSource: toOrderSource(raw, what),
    fulfillmentType: toFulfillment(raw, what),
    status: toOrderStatus(raw, 'status', what),
    paymentStatus: toPaymentStatus(raw, 'paymentStatus', what),
    finalAmount: reqNum(raw, 'finalAmount', what),
    createdAt: reqDate(raw, 'createdAt', what),

    subTotal: optMoney('subTotal'),
    itemDiscountAmount: optMoney('itemDiscountAmount'),
    voucherCode: optStr(raw.voucherCode),
    voucherDiscountAmount: optMoney('voucherDiscountAmount'),
    deliveryFee: optMoney('deliveryFee'),
    vatAmount: optMoney('vatAmount'),

    deliveryName: optStr(raw.deliveryName),
    deliveryPhone: optStr(raw.deliveryPhone),
    deliveryAddress: optStr(raw.deliveryAddress),

    expiresAt: optDate(raw.expiresAt),
    cancelReason: optStr(raw.cancelReason),
    cancelledAt: optDate(raw.cancelledAt),
    completedAt: optDate(raw.completedAt),
    note: optStr(raw.note),
    version: optMoney('version'),
    updatedAt: optDate(raw.updatedAt),

    itemCount: optMoney('itemCount'),
    ...(Array.isArray(raw.items) ? { items: raw.items.map((i) => toItem(i, id)) } : {}),
  };
}

export function toMyOrderSummaries(raw: unknown): MyOrderSummary[] {
  if (!Array.isArray(raw)) throw invalid('danh sách đơn', 'data không phải mảng');
  return raw.map(toSummary);
}

/**
 * meta phân trang → PageMeta đủ 4 số. Spec luôn trả meta {page,size,total}; nếu thiếu (mock/legacy)
 * thì suy từ tham số yêu cầu + số phần tử nhận được. totalPages tự tính khi server không trả.
 */
export function toPageMeta(meta: ApiMeta | null, fallback: { page: number; size: number; count: number }): PageMeta {
  const page = toNum(meta?.page) ?? fallback.page;
  const size = toNum(meta?.size) ?? fallback.size;
  const total = toNum(meta?.total) ?? fallback.count;
  const totalPages = toNum(meta?.totalPages) ?? (size > 0 ? Math.ceil(total / size) : 0);
  return { page, size, total, totalPages };
}

// ── PATCH /orders/{id}/status (bản rút gọn) ───────────────────────────
export function toStatusChangeResult(raw: unknown): OrderStatusChangeResult {
  const what = 'kết quả đổi trạng thái đơn';
  if (!isRecord(raw)) throw invalid(what, 'data không phải object');
  return {
    id: reqNum(raw, 'id', what),
    orderCode: reqStr(raw, 'orderCode', what),
    status: toOrderStatus(raw, 'status', what),
    paymentStatus: toPaymentStatus(raw, 'paymentStatus', what),
    cancelReason: optStr(raw.cancelReason),
    cancelledBy: optStr(raw.cancelledBy),
    cancelledAt: optDate(raw.cancelledAt),
    completedAt: optDate(raw.completedAt),
    version: reqNum(raw, 'version', what),
    updatedAt: reqDate(raw, 'updatedAt', what),
  };
}
