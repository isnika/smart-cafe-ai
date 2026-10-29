import { http, HttpResponse } from 'msw';
import { ORDER_TRANSITIONS, isTerminalOrderStatus } from '@/shared/lib';
import type { FulfillmentType, OrderDetail, OrderStatus, Page } from '@/shared/types';
import { db } from '../db';
import { fail, guarded, requireAuth, url } from '../utils';
import { accountFromRequest, hasMockToken, type MockAccount } from './identity';

const ALL_FULFILLMENTS = Object.keys(ORDER_TRANSITIONS) as FulfillmentType[];
const ALL_STATUSES = Object.keys(ORDER_TRANSITIONS.Dine_In) as OrderStatus[];

function intParam(sp: URLSearchParams, name: string, fallback: number, min: number, max = Number.POSITIVE_INFINITY): number {
  const raw = sp.get(name);
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, 'VALIDATION_ERROR', `${name} không hợp lệ`);
  return n;
}

/** Nhận cả `?status=A,B` lẫn `?status=A&status=B`. */
function parseStatuses(sp: URLSearchParams): OrderStatus[] {
  const raw = sp.getAll('status').flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
  const bad = raw.find((s) => !ALL_STATUSES.includes(s as OrderStatus));
  if (bad) fail(400, 'VALIDATION_ERROR', `status không hợp lệ: ${bad}`);
  return raw as OrderStatus[];
}

/**
 * GIẢ ĐỊNH: Page<T> = { items, total, page (bắt đầu từ 1), size, totalPages }.
 * Nếu types.ts định nghĩa khác (content/totalElements, page từ 0...), chỉ sửa đúng hàm này
 * (và 3 chỗ đọc `items/total/totalPages` trong handlers-read.test.ts).
 */
function toPage(all: OrderDetail[], page: number, size: number): Page<OrderDetail> {
  const start = (page - 1) * size;
  return { items: all.slice(start, start + size), total: all.length, page, pageSize : size };
}

/**
 * Xác định người gọi từ token (KHÔNG tin userId trong query/body).
 * - Token hợp lệ                       → tài khoản tương ứng
 * - Token do mock cấp nhưng hết hiệu lực → 401 (luôn luôn)
 * - Không có token / token lạ          → 401 khi mockConfig.enforceAuth; ngược lại giữ hành vi cũ
 *   (ẩn danh, không có quyền riêng tư nào được cấp) để các test phía nhân viên không đổi.
 */
function callerOf(request: Request): MockAccount | undefined {
  const account = accountFromRequest(request);
  if (account) return account;
  if (hasMockToken(request)) fail(401, 'UNAUTHORIZED', 'Phiên đăng nhập không còn hợp lệ');
  requireAuth(request);
  return undefined;
}

const byCreatedAsc = (a: OrderDetail, b: OrderDetail) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id;

export const orderReadHandlers = [
  // GET /orders-svc/orders?status=&fulfillmentType=&cashier=feed|history&tableSessionId=&page=&size=
  http.get(
    url('/orders-svc/orders'),
    guarded(({ request }) => {
      const caller = callerOf(request);
      const sp = new URL(request.url).searchParams;

      // Phạm vi chủ đơn: khách chỉ thấy đơn của chính mình (lấy từ token). `userId` do client gửi
      // chỉ được chấp nhận nếu trùng với chính họ; nhân viên/quản lý mới được lọc theo userId bất kỳ.
      const userIdParam = sp.get('userId');
      if (userIdParam && !caller) fail(401, 'UNAUTHORIZED', 'Cần đăng nhập để lọc đơn theo người dùng');
      if (caller?.roleName === 'Customer' && userIdParam && userIdParam !== caller.id) {
        fail(403, 'FORBIDDEN', 'Bạn không có quyền xem đơn hàng của tài khoản khác');
      }
      const ownerId = caller?.roleName === 'Customer' ? caller.id : userIdParam;

      const statuses = parseStatuses(sp);
      const fulfillment = sp.get('fulfillmentType') as FulfillmentType | null;
      if (fulfillment && !ALL_FULFILLMENTS.includes(fulfillment)) fail(400, 'VALIDATION_ERROR', `fulfillmentType không hợp lệ: ${fulfillment}`);
      const cashier = sp.get('cashier');
      if (cashier && cashier !== 'feed' && cashier !== 'history') fail(400, 'VALIDATION_ERROR', 'cashier chỉ nhận feed | history');
      const tableSessionId = sp.has('tableSessionId') ? intParam(sp, 'tableSessionId', 0, 1) : null;
      const page = intParam(sp, 'page', 1, 1);
      const size = intParam(sp, sp.has('pageSize') ? 'pageSize' : 'size', 20, 1, 100);

      const rows = db.orders
        .filter((o) => ownerId === null || o.userId === ownerId)
        .filter((o) => statuses.length === 0 || statuses.includes(o.status))
        .filter((o) => !fulfillment || o.fulfillmentType === fulfillment)
        .filter((o) => tableSessionId === null || o.tableSessionId === tableSessionId)
        // feed = đơn còn xử lý, history = đơn đã kết thúc (GIẢ ĐỊNH – đối chiếu backend)
        .filter((o) => !cashier || (cashier === 'history') === isTerminalOrderStatus(o.status))
        // feed: cũ nhất lên đầu (FIFO cho quầy); còn lại: mới nhất lên đầu
        .sort((a, b) => (cashier === 'feed' ? byCreatedAsc(a, b) : byCreatedAsc(b, a)));

      return HttpResponse.json(toPage(rows, page, size));
    }),
  ),

  // GET /orders-svc/orders/:id
  http.get(
    url('/orders-svc/orders/:id'),
    guarded(({ request, params }) => {
      const caller = callerOf(request);
      const order = db.orders.find((o) => o.id === Number(params.id));
      // Đơn của người khác trả 404 giống đơn không tồn tại (không lộ việc đơn có thật).
      if (!order || (caller?.roleName === 'Customer' && order.userId !== caller.id)) fail(404, 'ORDER_NOT_FOUND', `Không tìm thấy đơn ${String(params.id)}`);
      return HttpResponse.json(order);
    }),
  ),
];