import { http, HttpResponse } from 'msw';
import { ORDER_TRANSITIONS, isTerminalOrderStatus } from '@/shared/lib';
import type { FulfillmentType, OrderDetail, OrderStatus, Page } from '@/shared/types';
import { db } from '../db';
import { fail, guarded, requireAuth, url } from '../utils';

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

const byCreatedAsc = (a: OrderDetail, b: OrderDetail) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id;

export const orderReadHandlers = [
  // GET /orders-svc/orders?status=&fulfillmentType=&cashier=feed|history&tableSessionId=&page=&size=
  http.get(
    url('/orders-svc/orders'),
    guarded(({ request }) => {
      requireAuth(request);
      const sp = new URL(request.url).searchParams;

      const statuses = parseStatuses(sp);
      const fulfillment = sp.get('fulfillmentType') as FulfillmentType | null;
      if (fulfillment && !ALL_FULFILLMENTS.includes(fulfillment)) fail(400, 'VALIDATION_ERROR', `fulfillmentType không hợp lệ: ${fulfillment}`);
      const cashier = sp.get('cashier');
      if (cashier && cashier !== 'feed' && cashier !== 'history') fail(400, 'VALIDATION_ERROR', 'cashier chỉ nhận feed | history');
      const tableSessionId = sp.has('tableSessionId') ? intParam(sp, 'tableSessionId', 0, 1) : null;
      const page = intParam(sp, 'page', 1, 1);
      const size = intParam(sp, sp.has('pageSize') ? 'pageSize' : 'size', 20, 1, 100);

      const rows = db.orders
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
      requireAuth(request);
      const order = db.orders.find((o) => o.id === Number(params.id));
      if (!order) fail(404, 'ORDER_NOT_FOUND', `Không tìm thấy đơn ${String(params.id)}`);
      return HttpResponse.json(order);
    }),
  ),
];