import { http, HttpResponse } from 'msw'

export const cashierHandlers = [
  http.get('/api/cashier/pending', () =>
    HttpResponse.json([
      { orderId: 123, table: 5, total: 85000, status: 'PAY_AT_COUNTER' },
      { orderId: 124, table: 2, total: 120000, status: 'PAID_ONLINE' },
    ]),
  ),
]