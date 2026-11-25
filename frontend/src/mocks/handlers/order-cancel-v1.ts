import { http } from 'msw';
import type { OrderDetail, OrderStatus } from '@/shared/types';
import { db, nowNaive } from '../db';
import { fail, guardedV1, ok, readJson, url } from '../utils';
import { accountFromRequest, type MockAccount } from './identity';

/**
 * MSW cho `PATCH /orders/{id}/status` (SmartAPI v1, sheet "4. Order" #14).
 *
 * Nguồn luật: sheet "Enum & Trạng thái" (bảng "Luồng trạng thái đơn hàng") + "Chuẩn chung" (mã lỗi, optimistic locking).
 * Handler KHÔNG dùng `ORDER_TRANSITIONS` của FE (shared/lib/order-transitions.ts): bảng đó có cạnh `Preparing → Cancelled`
 * mà Excel không có. Bảng bên dưới chép đúng từng dòng của Excel.
 *
 * Không làm: refund, sửa payment/payment_status, giải phóng reservation, phát event.
 */

export type TransitionActor = 'Customer' | 'Staff' | 'Manager' | 'System';

export interface TransitionRule {
  from: OrderStatus;
  to: OrderStatus;
  actors: readonly TransitionActor[];
}

/** Chép nguyên từ Excel: cột Từ | Sang | Ai được làm (13 dòng). Dòng nào Excel không có thì KHÔNG hợp lệ. */
export const EXCEL_ORDER_TRANSITIONS: readonly TransitionRule[] = [
  { from: 'Pending_Payment', to: 'Pending', actors: ['System'] },
  { from: 'Pending_Payment', to: 'Cancelled', actors: ['Customer', 'System'] },
  { from: 'Pending', to: 'Confirmed', actors: ['Staff', 'Manager'] },
  { from: 'Pending', to: 'Rejected', actors: ['Staff', 'Manager'] },
  { from: 'Pending', to: 'Cancelled', actors: ['Customer', 'Staff', 'Manager'] },
  { from: 'Confirmed', to: 'Preparing', actors: ['Staff', 'Manager'] },
  { from: 'Confirmed', to: 'Cancelled', actors: ['Staff', 'Manager'] },
  { from: 'Preparing', to: 'Ready', actors: ['Staff', 'Manager'] },
  { from: 'Ready', to: 'Shipping', actors: ['Staff', 'Manager'] },
  { from: 'Ready', to: 'Completed', actors: ['Staff', 'Manager'] },
  { from: 'Ready', to: 'Served', actors: ['Staff', 'Manager'] },
  { from: 'Shipping', to: 'Completed', actors: ['Staff', 'Manager'] },
  { from: 'Served', to: 'Completed', actors: ['Staff', 'Manager', 'System'] },
];

const ORDER_STATUSES: readonly OrderStatus[] = [
  'Pending_Payment', 'Pending', 'Confirmed', 'Preparing', 'Ready', 'Shipping', 'Served', 'Completed', 'Cancelled', 'Rejected',
];
const PAID_STATUSES: readonly string[] = ['Paid', 'Partially_Refunded', 'Refunded'];
const MAX_TEXT = 255;
const notFound = (id: number): never => fail(404, 'ORDER_NOT_FOUND', `Không tìm thấy đơn ${id}`);

/** Cạnh `from → to` có trong Excel không (không xét người làm). */
export const isExcelTransition = (from: OrderStatus, to: OrderStatus): boolean =>
  EXCEL_ORDER_TRANSITIONS.some((r) => r.from === from && r.to === to);

/** Cạnh `from → to` có trong Excel VÀ `actor` được phép làm. */
export const canActorTransition = (actor: TransitionActor, from: OrderStatus, to: OrderStatus): boolean =>
  EXCEL_ORDER_TRANSITIONS.some((r) => r.from === from && r.to === to && r.actors.includes(actor));

interface PatchBody {
  status?: unknown;
  note?: unknown;
  cancel_reason?: unknown;
  version?: unknown;
}

function orderIdOf(raw: unknown): number {
  const text = String(raw);
  if (!/^\d+$/.test(text) || Number(text) < 1) fail(400, 'VALIDATION_ERROR', 'id đơn phải là số nguyên dương');
  return Number(text);
}

/** Chuỗi tùy chọn ≤255; rỗng/khoảng trắng → null. Sai kiểu hoặc quá dài → 400. */
function optionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') fail(400, 'VALIDATION_ERROR', `${field} phải là chuỗi`);
  const text = value.trim();
  if (text.length > MAX_TEXT) fail(400, 'VALIDATION_ERROR', `${field} tối đa ${MAX_TEXT} ký tự`);
  return text || null;
}

function parseBody(body: PatchBody): { status: OrderStatus; version: number; cancelReason: string | null; note: string | null } {
  if (typeof body.status !== 'string' || !ORDER_STATUSES.includes(body.status as OrderStatus)) {
    fail(400, 'VALIDATION_ERROR', `status bắt buộc, một trong: ${ORDER_STATUSES.join(', ')}`);
  }
  if (typeof body.version !== 'number' || !Number.isInteger(body.version) || body.version < 0) {
    fail(400, 'VALIDATION_ERROR', 'version bắt buộc, số nguyên ≥ 0');
  }
  const status = body.status as OrderStatus;
  const cancelReason = optionalText(body.cancel_reason, 'cancel_reason');
  const note = optionalText(body.note, 'note');
  if ((status === 'Cancelled' || status === 'Rejected') && !cancelReason) {
    fail(400, 'VALIDATION_ERROR', `cancel_reason bắt buộc khi chuyển sang ${status}`);
  }
  return { status, version: body.version, cancelReason, note };
}

/** Đơn của người khác và đơn không tồn tại cho CÙNG một lỗi 404 → không lộ việc đơn có thật. */
function ownedOrder(id: number, caller: MockAccount): OrderDetail {
  const order = db.orders.find((o) => o.id === id && o.userId === caller.id);
  if (!order) fail(404, 'ORDER_NOT_FOUND', `Không tìm thấy đơn ${id}`);
  return order;
}

function transitionOrder(
  order: OrderDetail,
  caller: MockAccount,
  status: OrderStatus,
  cancelReason: string | null,
  note: string | null,
): void {
  const now = nowNaive();
  const from = order.status;
  order.status = status;
  if (status === 'Cancelled' || status === 'Rejected') {
    order.cancelReason = cancelReason;
    order.cancelledBy = caller.id;
    order.cancelledAt = now;
  }
  if (status === 'Completed') order.completedAt = now;
  order.version += 1;
  order.updatedAt = now;
  order.statusHistory.push({
    id: ++db.seq.history, orderId: order.id, fromStatus: from, status,
    changedBy: caller.id, note: note ?? cancelReason, createdAt: now,
  });
}

export const orderCancelV1Handlers = [
  // PATCH /orders/:id/status { status, cancel_reason, version, note? }
  http.patch(url('/orders/:id/status'), guardedV1(async ({ request, params }) => {
    const caller = accountFromRequest(request);
    if (!caller) fail(401, 'UNAUTHORIZED', 'Thiếu hoặc sai access token');
    const id = orderIdOf(params.id);
    const input = parseBody(await readJson<PatchBody>(request));
    if (caller.roleName === 'Customer') {
      const order = ownedOrder(id, caller);

      if (input.status !== 'Cancelled') fail(403, 'FORBIDDEN', 'Khách hàng chỉ được chuyển đơn sang Cancelled');

      if (input.version !== order.version) {
        fail(409, 'VERSION_CONFLICT', `Đơn đã được cập nhật (version hiện tại ${order.version}, bạn gửi ${input.version})`);
      }
      if (!canActorTransition('Customer', order.status, 'Cancelled')) {
        fail(409, 'INVALID_STATE_TRANSITION', `Khách không thể hủy đơn đang ở trạng thái ${order.status}`);
      }
      if (PAID_STATUSES.includes(order.paymentStatus)) {
        fail(422, 'BUSINESS_RULE_VIOLATION', `Đơn ${order.orderCode} đã thanh toán (${order.paymentStatus}), không thể hủy qua endpoint này`);
      }

      transitionOrder(order, caller, input.status, input.cancelReason, input.note);

      return ok({
        id: order.id, orderCode: order.orderCode, status: order.status, paymentStatus: order.paymentStatus,
        cancelReason: order.cancelReason, cancelledBy: order.cancelledBy, cancelledAt: order.cancelledAt,
        completedAt: order.completedAt ?? null, version: order.version, updatedAt: order.updatedAt,
      });
    }

    if (caller.roleName !== 'Staff' && caller.roleName !== 'Manager') {
      fail(403, 'FORBIDDEN', 'Không đủ quyền cập nhật đơn hàng');
    }
    const order = db.orders.find((candidate) =>
      candidate.id === id && candidate.branchId === caller.branchId,
    );
    if (!order) return notFound(id);
    if (input.version !== order.version) {
      fail(409, 'VERSION_CONFLICT', `Đơn đã được cập nhật (version hiện tại ${order.version}, bạn gửi ${input.version})`);
    }
    if (!canActorTransition(caller.roleName, order.status, input.status)) {
      fail(409, 'INVALID_STATE_TRANSITION', `Không thể chuyển đơn từ ${order.status} sang ${input.status}`);
    }
    if (input.status === 'Completed' && order.paymentStatus !== 'Paid') {
      fail(422, 'BUSINESS_RULE_VIOLATION', 'Chỉ hoàn tất đơn đã thanh toán');
    }
    transitionOrder(order, caller, input.status, input.cancelReason, input.note);
    return ok(order);
  })),
];
