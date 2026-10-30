import { http, HttpResponse } from 'msw'
import { db } from '../db'
import { isCounterPayable, isPaidOnline } from '../payment-service'
import { url } from '../utils'

/**
 * GET /cashier/pending (/api/cashier/pending) — view cũ của mock, giữ nguyên dạng response nhưng giờ suy ra từ db thật
 * (trước đây là 2 dòng cố định, không đổi sau khi thanh toán). UI Thu ngân dùng /orders-svc/orders?cashier=feed.
 */
export const cashierHandlers = [
  http.get(url('/cashier/pending'), () =>
    HttpResponse.json(
      db.orders.flatMap((o) => {
        const status = isCounterPayable(o) ? 'PAY_AT_COUNTER' : isPaidOnline(o) ? 'PAID_ONLINE' : null
        if (!status) return []
        const table = o.tableNumber ? Number(o.tableNumber) : null
        return [{ orderId: o.id, table: Number.isFinite(table) ? table : null, total: o.finalAmount, status }]
      }),
    ),
  ),
]
