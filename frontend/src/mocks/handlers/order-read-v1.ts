import { http } from 'msw';
import { toUtcIso } from '@/shared/lib';
import { ORDER_STATUS_VALUES, PAYMENT_STATUS_VALUES } from '@/shared/api/order-me.types';
import type { OrderDetail, OrderStatus, OrderStatusHistory, PaymentStatus } from '@/shared/types';
import { db } from '../db';
import { fail, guardedV1, ok, url } from '../utils';
import { accountFromRequest, type MockAccount } from './identity';

/**
 * Handler SmartAPI v1 (sheet "4. Order") — CHỈ ĐỌC đơn:
 *   GET /orders/me          Customer            → mảng order summary + meta{page,size,total}
 *   GET /orders/me/{id}     Customer (chủ đơn)  → order + items[] + status_history[]
 *   GET /orders/{id}/history Customer (chủ đơn) | Staff | Manager → [{id,order_id,from_status,status,changed_by,note,created_at}]
 *
 * Quy tắc:
 *  - Người gọi lấy từ Bearer token, KHÔNG tin bất kỳ user id nào trong query/body.
 *  - Đơn của người khác và đơn không tồn tại đều trả 404 ORDER_NOT_FOUND (không lộ việc đơn có thật).
 *  - `status` (vòng đời đơn) và `payment_status` (read-model thanh toán) là hai trường riêng, không lẫn nhau.
 *  - Timestamp giữ đúng dạng DB (UTC, không hậu tố Z) để http.ts → normalizeTimestamps chạy thật.
 *  - Không đụng handler legacy /orders-svc/* (staff queue, cashier, dashboard vẫn dùng chúng trên cùng db.orders).
 */

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** GIẢ ĐỊNH (spec chỉ ghi `sort=field,asc|desc`, không liệt kê field): các field dưới đây. Mặc định created_at,desc. */
const SORT_FIELDS = {
  created_at: (o: OrderDetail) => utcMs(o.createdAt),
  updated_at: (o: OrderDetail) => utcMs(o.updatedAt),
  final_amount: (o: OrderDetail) => o.finalAmount,
  id: (o: OrderDetail) => o.id,
} as const;
type SortField = keyof typeof SORT_FIELDS;
const isSortField = (v: string): v is SortField => Object.prototype.hasOwnProperty.call(SORT_FIELDS, v);

const notFound = (id: number): never => fail(404, 'ORDER_NOT_FOUND', `Không tìm thấy đơn ${String(id)}`);

function utcMs(value: string): number {
  const iso = toUtcIso(value);
  return iso === null ? Number.NaN : Date.parse(iso);
}

// ── Auth ──────────────────────────────────────────────────────────────
function accountOf(request: Request): MockAccount {
  const account = accountFromRequest(request);
  if (!account) fail(401, 'UNAUTHORIZED', 'Thiếu hoặc sai access token');
  return account;
}

function customerOf(request: Request): MockAccount {
  const account = accountOf(request);
  if (account.roleName !== 'Customer') fail(403, 'FORBIDDEN', 'Chỉ khách hàng mới xem được đơn của mình');
  return account;
}

// ── Tham số ───────────────────────────────────────────────────────────
function parseId(raw: unknown): number {
  const text = String(raw);
  const n = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(n) || n <= 0) fail(400, 'VALIDATION_ERROR', 'id đơn không hợp lệ');
  return n;
}

/** Spec không nói `status`/`payment_status` nhận nhiều giá trị → mock chỉ nhận MỘT (lặp key = 400, để lộ lệch contract). */
function single(sp: URLSearchParams, name: string): string | undefined {
  const all = sp.getAll(name);
  if (all.length > 1) fail(400, 'VALIDATION_ERROR', `${name} chỉ nhận một giá trị`);
  return all[0];
}

function enumParam<T extends string>(sp: URLSearchParams, name: string, values: readonly T[]): T | undefined {
  const v = single(sp, name);
  if (v === undefined) return undefined;
  const hit = values.find((x) => x === v);
  if (hit === undefined) fail(400, 'VALIDATION_ERROR', `${name} không hợp lệ: ${v}`);
  return hit;
}

function intParam(sp: URLSearchParams, name: string, fallback: number, min: number, max = Number.POSITIVE_INFINITY): number {
  const v = single(sp, name);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!/^-?\d+$/.test(v) || !Number.isSafeInteger(n) || n < min || n > max) {
    fail(400, 'VALIDATION_ERROR', `${name} phải là số nguyên trong khoảng ${min}..${Number.isFinite(max) ? max : '∞'}`);
  }
  return n;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** `from`/`to`: ISO datetime (thiếu timezone → UTC) hoặc YYYY-MM-DD (from = 00:00:00Z, to = hết ngày). Cả hai đầu đều bao gồm. */
function instantParam(sp: URLSearchParams, name: 'from' | 'to'): number | undefined {
  const v = single(sp, name);
  if (v === undefined) return undefined;
  const iso = DATE_ONLY.test(v) ? `${v}T${name === 'from' ? '00:00:00.000' : '23:59:59.999'}Z` : toUtcIso(v);
  const ms = iso === null ? Number.NaN : Date.parse(iso);
  if (Number.isNaN(ms)) fail(400, 'VALIDATION_ERROR', `${name} không phải ISO 8601 hợp lệ: ${v}`);
  return ms;
}

function sortParam(sp: URLSearchParams): { field: SortField; dir: 1 | -1 } {
  const v = single(sp, 'sort');
  if (v === undefined) return { field: 'created_at', dir: -1 };
  const [field, dir, ...rest] = v.split(',');
  if (field === undefined || !isSortField(field) || (dir !== 'asc' && dir !== 'desc') || rest.length > 0) {
    fail(400, 'VALIDATION_ERROR', `sort không hợp lệ: ${v} (dạng field,asc|desc; field: ${Object.keys(SORT_FIELDS).join('|')})`);
  }
  return { field, dir: dir === 'asc' ? 1 : -1 };
}

// ── View: chỉ field spec cần, không rò dữ liệu nội bộ / người khác ─────────
function summaryView(o: OrderDetail) {
  return {
    id: o.id,
    orderCode: o.orderCode,
    branchId: o.branchId,
    orderSource: o.orderSource,
    fulfillmentType: o.fulfillmentType,
    status: o.status,
    paymentStatus: o.paymentStatus,
    subTotal: o.subTotal,
    itemDiscountAmount: o.itemDiscountAmount,
    voucherCode: o.voucherCode,
    voucherDiscountAmount: o.voucherDiscountAmount,
    deliveryFee: o.deliveryFee,
    vatAmount: o.vatAmount,
    finalAmount: o.finalAmount,
    deliveryName: o.deliveryName,
    deliveryPhone: o.deliveryPhone,
    deliveryAddress: o.deliveryAddress,
    expiresAt: o.expiresAt,
    cancelReason: o.cancelReason,
    cancelledAt: o.cancelledAt,
    completedAt: o.completedAt,
    note: o.note,
    version: o.version,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
  };
}

/** Khách chỉ thấy changed_by của chính mình; id nhân viên/hệ thống → null (không lộ người khác). Staff/Manager thấy đủ. */
function historyView(h: OrderStatusHistory, viewer: MockAccount) {
  const hide = viewer.roleName === 'Customer' && h.changedBy !== viewer.id;
  return { id: h.id, orderId: h.orderId, fromStatus: h.fromStatus, status: h.status, changedBy: hide ? null : h.changedBy, note: h.note, createdAt: h.createdAt };
}

/** Cũ → mới (createdAt, rồi id). */
const sortedHistory = (o: OrderDetail): OrderStatusHistory[] =>
  [...o.statusHistory].sort((a, b) => utcMs(a.createdAt) - utcMs(b.createdAt) || a.id - b.id);

function detailView(o: OrderDetail, viewer: MockAccount) {
  // Bỏ idempotencyKey / createdBy (nội bộ) khỏi payload; statusHistory đổi tên theo spec → status_history.
  const { idempotencyKey: _key, createdBy: _by, statusHistory: _history, ...rest } = o;
  void _key; void _by; void _history;
  return { ...rest, statusHistory: sortedHistory(o).map((h) => historyView(h, viewer)) };
}

export const orderReadV1Handlers = [
  // GET /orders/me?status=&payment_status=&from=&to=&page=&size=&sort=
  http.get(url('/orders/me'), guardedV1(({ request }) => {
    const me = customerOf(request);
    const sp = new URL(request.url).searchParams;

    const status: OrderStatus | undefined = enumParam(sp, 'status', ORDER_STATUS_VALUES);
    const paymentStatus: PaymentStatus | undefined = enumParam(sp, 'payment_status', PAYMENT_STATUS_VALUES);
    const from = instantParam(sp, 'from');
    const to = instantParam(sp, 'to');
    if (from !== undefined && to !== undefined && from > to) fail(400, 'VALIDATION_ERROR', 'from phải <= to');
    const page = intParam(sp, 'page', 1, 1);
    const size = intParam(sp, 'size', DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const { field, dir } = sortParam(sp);
    const key = SORT_FIELDS[field];

    const rows = db.orders
      .filter((o) => o.userId === me.id) // phạm vi chủ đơn: luôn theo token
      .filter((o) => status === undefined || o.status === status)
      .filter((o) => paymentStatus === undefined || o.paymentStatus === paymentStatus)
      .filter((o) => from === undefined || utcMs(o.createdAt) >= from)
      .filter((o) => to === undefined || utcMs(o.createdAt) <= to)
      .sort((a, b) => dir * (key(a) - key(b)) || dir * (a.id - b.id));

    const start = (page - 1) * size;
    return ok(rows.slice(start, start + size).map(summaryView), { page, size, total: rows.length });
  })),

  // GET /orders/me/:id
  http.get(url('/orders/me/:id'), guardedV1(({ request, params }) => {
    const me = customerOf(request);
    const id = parseId(params.id);
    const order = db.orders.find((o) => o.id === id && o.userId === me.id);
    if (!order) return notFound(id);
    return ok(detailView(order, me));
  })),

  // GET /orders/:id/history — Customer (chủ đơn) | Staff | Manager
  http.get(url('/orders/:id/history'), guardedV1(({ request, params }) => {
    const viewer = accountOf(request);
    if (viewer.roleName !== 'Customer' && viewer.roleName !== 'Staff' && viewer.roleName !== 'Manager') {
      fail(403, 'FORBIDDEN', 'Không đủ quyền xem lịch sử đơn');
    }
    const id = parseId(params.id);
    const order = db.orders.find((o) => o.id === id);
    const allowed =
      order !== undefined &&
      (viewer.roleName === 'Customer'
        ? order.userId === viewer.id
        : viewer.branchId === null || viewer.branchId === order.branchId); // nhân viên chỉ xem đơn chi nhánh mình
    if (!order || !allowed) return notFound(id);
    return ok(sortedHistory(order).map((h) => historyView(h, viewer)));
  })),
];
