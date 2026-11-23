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
 *  - Danh sách staff/manager dùng contract v1 /orders; các handler alias legacy chỉ giữ cho kiểm thử tương thích.
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

function staffOf(request: Request): MockAccount {
  const account = accountOf(request);
  if (account.roleName !== 'Staff' && account.roleName !== 'Manager' && account.roleName !== 'Admin') fail(403, 'FORBIDDEN', 'Không đủ quyền xem đơn');
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
  http.get(url('/orders/public/best-selling-branch'), guardedV1(() => {
    const best = db.orders.filter((o) => o.status === 'Completed').reduce((counts, order) => counts.set(order.branchId, (counts.get(order.branchId) ?? 0) + 1), new Map<number, number>());
    const branchId = [...best].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 1;
    return ok(branchId);
  })),
  // GET /orders?branch_id=&page=&size=&sort= — Manager/Staff branch scoped list.
  http.get(url('/orders'), guardedV1(({ request }) => {
    const viewer = staffOf(request);
    const sp = new URL(request.url).searchParams;
    const requestedBranch = sp.has('branch_id') ? intParam(sp, 'branch_id', 1, 1) : viewer.branchId;
    if (requestedBranch === null) fail(400, 'VALIDATION_ERROR', 'branch_id là bắt buộc');
    if (viewer.roleName !== 'Admin' && requestedBranch !== viewer.branchId) fail(403, 'FORBIDDEN', 'Không có quyền xem đơn của chi nhánh này');
    const status = enumParam(sp, 'status', ORDER_STATUS_VALUES);
    const page = intParam(sp, 'page', 1, 1);
    const size = intParam(sp, 'size', DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const sort = sortParam(sp);
    const key = SORT_FIELDS[sort.field];
    const rows = db.orders
      .filter((o) => o.branchId === requestedBranch)
      .filter((o) => status === undefined || o.status === status)
      .sort((a, b) => sort.dir * (key(a) - key(b)) || sort.dir * (a.id - b.id));
    const start = (page - 1) * size;
    return ok(rows.slice(start, start + size), { page, size, total: rows.length, totalPages: Math.ceil(rows.length / size) });
  })),

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

  // GET /orders/{id} — Staff/Manager in the order's branch.
  http.get(url('/orders/:id'), guardedV1(({ request, params }) => {
    const viewer = staffOf(request);
    const id = parseId(params.id);
    const order = db.orders.find((candidate) =>
      candidate.id === id && (viewer.roleName === 'Admin' || candidate.branchId === viewer.branchId),
    );
    if (!order) return notFound(id);
    return ok(detailView(order, viewer));
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

  // GET /orders/reports/revenue — Doanh thu tổng quan & 3 chi nhánh
  http.get(url('/orders/reports/revenue'), guardedV1(({ request }) => {
    staffOf(request);
    const sp = new URL(request.url).searchParams;
    const branchParam = sp.get('branch_id');
    const branchId = branchParam ? Number(branchParam) : null;
    const from = sp.get('from') || '2026-11-01';
    const to = sp.get('to') || '2026-11-23';

    const branchOrders = db.orders.filter((o) => branchId === null || o.branchId === branchId);
    const completed = branchOrders.filter((o) => o.status === 'Completed' || o.paymentStatus === 'Paid');
    const totalRev = completed.reduce((sum, o) => sum + (o.finalAmount || 0), 0) || 297000;
    const completedCount = completed.length || 5;

    const b1Rev = Math.round(totalRev * 0.46);
    const b2Rev = Math.round(totalRev * 0.37);
    const b3Rev = totalRev - b1Rev - b2Rev;

    return ok({
      from,
      to,
      branch_id: branchId,
      summary: {
        total_revenue: totalRev,
        sub_total: Math.round(totalRev * 0.85),
        item_discount_amount: 0,
        voucher_discount_amount: 0,
        delivery_fee: Math.round(totalRev * 0.15),
        vat_amount: 0,
        total_orders: branchOrders.length || 8,
        completed_orders: completedCount,
        cancelled_orders: 0,
        average_order_value: Math.round(totalRev / Math.max(1, completedCount)),
      },
      by_branch: [
        { branch_id: 1, orders_count: Math.round(completedCount * 0.45) || 2, revenue: b1Rev, percentage: 46.13 },
        { branch_id: 2, orders_count: Math.round(completedCount * 0.35) || 2, revenue: b2Rev, percentage: 37.04 },
        { branch_id: 3, orders_count: Math.round(completedCount * 0.20) || 1, revenue: b3Rev, percentage: 16.84 },
      ].filter((b) => branchId === null || b.branch_id === branchId),
      timeline: [
        { period: '2026-11-18', orders_count: 1, revenue: Math.round(totalRev * 0.22) },
        { period: '2026-11-19', orders_count: 1, revenue: Math.round(totalRev * 0.18) },
        { period: '2026-11-20', orders_count: 1, revenue: Math.round(totalRev * 0.25) },
        { period: '2026-11-21', orders_count: 1, revenue: Math.round(totalRev * 0.15) },
        { period: '2026-11-22', orders_count: 1, revenue: Math.round(totalRev * 0.20) },
      ],
    });
  })),

  // GET /orders/reports/revenue/branches — Phân bổ doanh thu 3 chi nhánh
  http.get(url('/orders/reports/revenue/branches'), guardedV1(({ request }) => {
    staffOf(request);
    const sp = new URL(request.url).searchParams;
    const branchParam = sp.get('branch_id');
    const branchId = branchParam ? Number(branchParam) : null;
    const from = sp.get('from') || '2026-11-01';
    const to = sp.get('to') || '2026-11-23';

    const totalRev = 297000;
    const b1Rev = 137000;
    const b2Rev = 110000;
    const b3Rev = 50000;

    const branches = [
      {
        branch_id: 1,
        orders_count: 2,
        sub_total: 107000,
        item_discount_amount: 0,
        voucher_discount_amount: 0,
        delivery_fee: 30000,
        vat_amount: 0,
        final_amount: b1Rev,
        average_order_value: 68500,
        revenue_percentage: 46.13,
      },
      {
        branch_id: 2,
        orders_count: 2,
        sub_total: 80000,
        item_discount_amount: 0,
        voucher_discount_amount: 0,
        delivery_fee: 30000,
        vat_amount: 0,
        final_amount: b2Rev,
        average_order_value: 55000,
        revenue_percentage: 37.04,
      },
      {
        branch_id: 3,
        orders_count: 1,
        sub_total: 35000,
        item_discount_amount: 0,
        voucher_discount_amount: 0,
        delivery_fee: 15000,
        vat_amount: 0,
        final_amount: b3Rev,
        average_order_value: 50000,
        revenue_percentage: 16.84,
      },
    ].filter((b) => branchId === null || b.branch_id === branchId);

    return ok({
      from,
      to,
      branch_id: branchId,
      total_orders: 5,
      total_revenue: totalRev,
      branches,
    });
  })),
];
