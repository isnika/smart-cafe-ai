import { http, HttpResponse } from 'msw';
import type { InvoiceRequestInput, OrderDetail, PayOrdersInput } from '@/shared/types';
import { db, nowNaive } from '../db';
import {
  assertCounterPayable, buildInvoiceDetail, markOrdersPaid, recordPayment, resultOfPayment, successfulPaymentOf,
} from '../payment-service';
import { fail, guarded, readJson, requireAuth, url } from '../utils';
import { accountFromRequest } from './identity';

const EMAIL = /^\S+@\S+\.\S+$/;

function validateInvoiceInput(inv: InvoiceRequestInput | undefined): void {
  if (inv === undefined) return;
  if (typeof inv.buyerName !== 'string' || !inv.buyerName.trim()) fail(400, 'VALIDATION_ERROR', 'Hóa đơn cần tên người mua (buyerName)');
  if (inv.email && !EMAIL.test(inv.email.trim())) fail(400, 'VALIDATION_ERROR', 'Email nhận hóa đơn không hợp lệ');
}

export const paymentHandlers = [
  // POST /payment/payments — thu tiền tại quầy (Cash) cho 1..N đơn. Số tiền LUÔN tính từ đơn trong db.
  http.post(
    url('/payment/payments'),
    guarded(async ({ request }) => {
      requireAuth(request);
      const caller = accountFromRequest(request);
      if (caller?.roleName === 'Customer') fail(403, 'FORBIDDEN', 'Chỉ nhân viên mới được thu tiền tại quầy');

      const input = await readJson<Partial<PayOrdersInput>>(request);
      // ── từ đây tới lúc ghi db KHÔNG có await: check-then-write là nguyên tử ──
      const ids = input.orderIds;
      if (!Array.isArray(ids) || ids.length === 0 || !ids.every((n) => Number.isInteger(n) && n > 0)) {
        fail(400, 'VALIDATION_ERROR', 'orderIds phải là danh sách id đơn hợp lệ, không rỗng');
      }
      if (new Set(ids).size !== ids.length) fail(400, 'VALIDATION_ERROR', 'orderIds bị trùng');
      if (!input.method) fail(400, 'VALIDATION_ERROR', 'Thiếu phương thức thanh toán (method)');

      // Idempotency: cùng key → trả lại đúng giao dịch cũ (200), không tạo giao dịch mới.
      if (input.idempotencyKey) {
        const prior = db.payments.find((p) => p.idempotencyKey === input.idempotencyKey);
        if (prior) {
          const same = db.allocations.filter((a) => a.paymentId === prior.id).map((a) => a.orderId).sort().join() === [...ids].sort().join();
          if (!same) fail(409, 'IDEMPOTENCY_KEY_REUSED', 'idempotencyKey này đã dùng cho giao dịch của đơn khác');
          return HttpResponse.json(resultOfPayment(prior), { status: 200 });
        }
      }

      if (input.method !== 'Cash') {
        fail(400, 'INVALID_PAYMENT_METHOD', `Thu tiền tại quầy chỉ hỗ trợ tiền mặt (Cash), không hỗ trợ ${input.method}`);
      }

      const orders: OrderDetail[] = ids.map((id) => db.orders.find((o) => o.id === id) ?? fail(404, 'ORDER_NOT_FOUND', `Không tìm thấy đơn ${id}`));
      orders.forEach(assertCounterPayable);

      const amount = orders.reduce((s, o) => s + o.finalAmount, 0);
      const cash = input.cashReceived;
      if (typeof cash !== 'number' || !Number.isFinite(cash)) fail(400, 'VALIDATION_ERROR', 'Thanh toán tiền mặt cần cashReceived');
      if (cash < amount) fail(400, 'INSUFFICIENT_CASH', `Khách đưa chưa đủ: cần ${amount}, nhận ${cash}`);
      validateInvoiceInput(input.invoice);

      const at = nowNaive();
      const result = recordPayment({
        orders, method: 'Cash', cashReceived: cash, createdBy: caller?.id ?? null,
        idempotencyKey: input.idempotencyKey ?? null, invoice: input.invoice, at,
      });
      markOrdersPaid(orders, at);
      return HttpResponse.json(result, { status: 201 });
    }),
  ),

  // GET /payment/invoices?orderId= — chỉ đọc. Không bao giờ phát hành hóa đơn mới.
  http.get(
    url('/payment/invoices'),
    guarded(({ request }) => {
      requireAuth(request);
      const caller = accountFromRequest(request);
      const raw = new URL(request.url).searchParams.get('orderId');
      const orderId = Number(raw);
      if (raw === null || !Number.isInteger(orderId) || orderId < 1) fail(400, 'VALIDATION_ERROR', 'orderId không hợp lệ');

      const order = db.orders.find((o) => o.id === orderId);
      if (!order || (caller?.roleName === 'Customer' && order.userId !== caller.id)) fail(404, 'ORDER_NOT_FOUND', `Không tìm thấy đơn ${orderId}`);

      const payment = successfulPaymentOf(orderId);
      if (!payment) fail(409, 'PAYMENT_NOT_COMPLETED', `Đơn ${order.orderCode} chưa có giao dịch thanh toán thành công nên chưa có hóa đơn`);
      const record = db.invoices.find((r) => r.paymentId === payment.id);
      if (!record) fail(404, 'INVOICE_NOT_FOUND', `Giao dịch #${payment.id} chưa có hóa đơn`);
      return HttpResponse.json(buildInvoiceDetail(record));
    }),
  ),
];
