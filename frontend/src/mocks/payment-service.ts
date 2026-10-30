import { isTerminalOrderStatus } from '@/shared/lib';
import type {
  Invoice, InvoiceDetail, InvoiceItem, InvoiceRequestInput, OrderDetail, Payment, PaymentMethod, PayResult,
} from '@/shared/types';
import { db, nowNaive, type MockInvoiceRecord } from './db';
import { fail } from './utils';

/**
 * Nghiệp vụ thanh toán + hóa đơn của mock, tách khỏi handler để seed và handler dùng chung.
 * Mọi hàm ở đây ĐỒNG BỘ: kiểm tra → ghi db không có `await` xen giữa, nên hai request đến cùng lúc
 * luôn được xử lý lần lượt (request thứ hai thấy đơn đã Paid).
 */

const VAT_RATE = 8;
const PAID_STATUSES = new Set(['Paid', 'Partially_Refunded', 'Refunded']);
export const GATEWAY_METHODS: PaymentMethod[] = ['VNPay', 'Momo'];
const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** Giao dịch thành công của đơn (nếu có). Đơn có thể từng có giao dịch Failed/Expired — những cái đó không tính. */
export function successfulPaymentOf(orderId: number): Payment | undefined {
  for (const a of db.allocations) {
    if (a.orderId !== orderId) continue;
    const p = db.payments.find((x) => x.id === a.paymentId);
    if (p?.status === 'Success') return p;
  }
  return undefined;
}

/** Đơn tại quầy (QR/POS), còn mở, chưa thanh toán → nhân viên được thu tiền mặt. */
export const isCounterPayable = (o: OrderDetail): boolean =>
  o.orderSource !== 'Online' && o.paymentStatus === 'Unpaid' && !isTerminalOrderStatus(o.status) && o.status !== 'Pending_Payment';

/** Đơn Online đã được cổng thanh toán ghi nhận: chỉ xem/in bill, không thu lại. */
export const isPaidOnline = (o: OrderDetail): boolean =>
  o.orderSource === 'Online' && o.paymentStatus === 'Paid' && !isTerminalOrderStatus(o.status);

/** Ném đúng lỗi nghiệp vụ nếu đơn không thể thu tiền tại quầy. */
export function assertCounterPayable(o: OrderDetail): void {
  if (PAID_STATUSES.has(o.paymentStatus)) {
    const prior = successfulPaymentOf(o.id);
    const online = prior ? GATEWAY_METHODS.includes(prior.paymentMethod) : o.orderSource === 'Online';
    fail(409, 'ORDER_ALREADY_PAID', online
      ? `Đơn ${o.orderCode} đã thanh toán online, không thu thêm tại quầy`
      : `Đơn ${o.orderCode} đã được thu tiền tại quầy`);
  }
  if (o.orderSource === 'Online') fail(409, 'ORDER_NOT_PAYABLE', `Đơn Online ${o.orderCode} không thu tiền tại quầy`);
  if (o.status === 'Pending_Payment' || isTerminalOrderStatus(o.status)) {
    fail(409, 'ORDER_NOT_PAYABLE', `Đơn ${o.orderCode} đang ở trạng thái ${o.status}, không thể thanh toán`);
  }
}

function describeItem(i: OrderDetail['items'][number]): string {
  const extras = [i.variantName !== 'Standard' ? `Size ${i.variantName}` : null, ...i.options.map((o) => o.optionName)].filter(Boolean);
  return extras.length ? `${i.productName} (${extras.join(', ')})` : i.productName;
}

/** Phát hành hóa đơn cho một payment THÀNH CÔNG. Đã có hóa đơn của payment này → trả lại cái cũ, không tạo thêm. */
export function issueInvoice(payment: Payment, orders: OrderDetail[], buyer: InvoiceRequestInput | undefined, at: string): MockInvoiceRecord {
  if (payment.status !== 'Success') fail(409, 'PAYMENT_NOT_COMPLETED', 'Chỉ phát hành hóa đơn cho giao dịch thanh toán thành công');
  const existing = db.invoices.find((r) => r.paymentId === payment.id);
  if (existing) return existing;

  const total = orders.reduce((s, o) => s + o.finalAmount, 0);
  const vat = orders.reduce((s, o) => s + o.vatAmount, 0);
  const id = ++db.seq.invoice;
  const buyerName = buyer?.buyerName?.trim() || 'Khách lẻ'; // hóa đơn bán lẻ khi không ghi thông tin người mua
  const yy = at.slice(2, 4);
  const invoice: Invoice = {
    id,
    invoiceNumber: `SC-${at.slice(0, 4)}-${pad(id, 5)}`,
    symbol: `C${yy}TSC`,
    templateCode: '1/001',
    buyerName,
    buyerTaxCode: buyer?.buyerTaxCode?.trim() || null,
    buyerAddress: buyer?.buyerAddress?.trim() || null,
    email: buyer?.email?.trim() || null,
    subtotalAmount: total - vat,
    vatRate: VAT_RATE,
    vatAmount: vat,
    totalAmount: total,
    lookupCode: `SCLK${pad(id, 6)}`,
    pdfUrl: null, // mock: không có file PDF thật
    status: 'Issued',
    relatedInvoiceId: null,
    relationType: null,
    issuedAt: at,
    createdAt: at,
  };

  let lineNo = 0;
  const items: InvoiceItem[] = orders.flatMap((o) =>
    o.items.map((i) => ({
      id: ++db.seq.invoiceItem, invoiceId: id, lineNo: ++lineNo, description: describeItem(i), unit: null,
      quantity: i.quantity, unitPrice: i.unitPrice + i.optionsUnitTotal, amount: i.lineTotal, vatRate: VAT_RATE,
    })),
  );

  const record: MockInvoiceRecord = { invoice, paymentId: payment.id, orderIds: orders.map((o) => o.id), items };
  db.invoices.push(record);
  return record;
}

export interface RecordPaymentArgs {
  orders: OrderDetail[];
  method: PaymentMethod;
  cashReceived?: number;
  createdBy?: string | null;
  idempotencyKey?: string | null;
  invoice?: InvoiceRequestInput;
  /** Mặc định: bây giờ. Seed truyền thời điểm của đơn. */
  at?: string;
}

/** Ghi payment (Success) + allocation + hóa đơn. KHÔNG sửa đơn — gọi `markOrdersPaid` riêng khi là giao dịch mới. */
export function recordPayment(args: RecordPaymentArgs): PayResult {
  const at = args.at ?? nowNaive();
  const amount = args.orders.reduce((s, o) => s + o.finalAmount, 0);
  const isCash = args.method === 'Cash';
  const id = ++db.seq.payment;
  const payment: Payment = {
    id,
    branchId: args.orders[0]!.branchId,
    cashierShiftId: null, // chưa mock ca thu ngân
    idempotencyKey: args.idempotencyKey ?? null,
    paymentMethod: args.method,
    amount,
    refundedAmount: 0,
    cashReceived: isCash ? (args.cashReceived ?? amount) : null,
    changeAmount: isCash ? (args.cashReceived ?? amount) - amount : null,
    collectedBy: isCash ? (args.createdBy ?? null) : null,
    transactionId: GATEWAY_METHODS.includes(args.method) ? `MOCK-${args.method.toUpperCase()}-${pad(id, 6)}` : null,
    status: 'Success',
    expiresAt: null,
    paidAt: at,
    createdBy: args.createdBy ?? null,
    createdAt: at,
    updatedAt: at,
  };
  db.payments.push(payment);

  const allocations = args.orders.map((o) => ({
    id: ++db.seq.allocation, paymentId: id, orderId: o.id, allocatedAmount: o.finalAmount, createdAt: at,
  }));
  db.allocations.push(...allocations);

  const record = issueInvoice(payment, args.orders, args.invoice, at);
  return { payment, allocations, redirectUrl: null, invoice: record.invoice };
}

/** Cập nhật trạng thái thanh toán của đơn sau giao dịch mới; version tăng như mọi thay đổi khác của đơn. */
export function markOrdersPaid(orders: OrderDetail[], at: string): void {
  for (const o of orders) {
    o.paymentStatus = 'Paid';
    o.version += 1;
    o.updatedAt = at;
  }
}

/** Kết quả của một giao dịch đã có (replay theo idempotencyKey). */
export function resultOfPayment(payment: Payment): PayResult {
  const rec = db.invoices.find((r) => r.paymentId === payment.id);
  return { payment, allocations: db.allocations.filter((a) => a.paymentId === payment.id), redirectUrl: null, invoice: rec?.invoice ?? null };
}

/** Ghép hóa đơn với payment/đơn thật để UI đối chiếu. */
export function buildInvoiceDetail(rec: MockInvoiceRecord): InvoiceDetail {
  const payment = db.payments.find((p) => p.id === rec.paymentId);
  if (!payment?.paidAt) fail(409, 'PAYMENT_NOT_COMPLETED', 'Giao dịch của hóa đơn chưa hoàn tất');
  const orders = rec.orderIds.map((id) => db.orders.find((o) => o.id === id)).filter((o): o is OrderDetail => !!o);
  return {
    ...rec.invoice,
    paymentId: payment.id,
    paymentMethod: payment.paymentMethod,
    paymentStatus: payment.status,
    paidAt: payment.paidAt,
    orders: orders.map((o) => ({ id: o.id, orderCode: o.orderCode })),
    items: rec.items,
    grossAmount: orders.reduce((s, o) => s + o.subTotal, 0),
    discountAmount: orders.reduce((s, o) => s + o.itemDiscountAmount + o.voucherDiscountAmount, 0),
    deliveryFee: orders.reduce((s, o) => s + o.deliveryFee, 0),
  };
}
