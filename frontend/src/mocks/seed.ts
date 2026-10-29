import type { FulfillmentType, OrderDetail, OrderLineInput, OrderStatus, TableSession } from '@/shared/types';
import { BRANCH_ID, db, nowNaive } from './db';
import { DELIVERY_FEE } from './fixtures';
import { buildItem } from './handlers/order';

/**
 * Dữ liệu demo cho trình duyệt. KHÔNG nằm trong createDb() để test cũ (handlers.test.ts) vẫn bắt đầu từ db rỗng.
 * Gọi: enableMocking() tự seed; `__mock.resetWithDemoData()` để về lại trạng thái này.
 */
const PATH: Record<FulfillmentType, OrderStatus[]> = {
  Dine_In: ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Served', 'Completed'],
  Pickup: ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Completed'],
  Delivery: ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Shipping', 'Completed'],
};

interface Spec {
  source: OrderDetail['orderSource'];
  fulfillment: FulfillmentType;
  status: OrderStatus;
  minutesAgo: number;
  lines: OrderLineInput[];
  table?: number;
  /** Chỉ dùng cho Cancelled/Rejected: trạng thái ngay trước khi bị huỷ (mặc định Pending). */
  cancelFrom?: OrderStatus;
  reason?: string;
  note?: string;
  /** Chủ đơn Online (mặc định u-customer). */
  userId?: string;
}

const CAFE_M: OrderLineInput = { variantId: 12, quantity: 2, options: [{ optionId: 101 }, { optionId: 104 }] }; // M, 100% đường, trân châu
const BAC_XIU: OrderLineInput = { variantId: 21, quantity: 1, options: [{ optionId: 201 }] };
const AMERICANO: OrderLineInput = { variantId: 31, quantity: 1, options: [{ optionId: 301 }] };
const TRA_DAO: OrderLineInput = { variantId: 51, quantity: 1, options: [{ optionId: 501 }, { optionId: 504 }] };
const CROISSANT: OrderLineInput = { variantId: 71, quantity: 2 };

const SPECS: Spec[] = [
  // Dine_In: đủ các trạng thái, Ready ở bàn 3
  { source: 'QR', fulfillment: 'Dine_In', status: 'Pending', minutesAgo: 3, table: 1, lines: [CAFE_M] },
  { source: 'QR', fulfillment: 'Dine_In', status: 'Preparing', minutesAgo: 12, table: 2, lines: [BAC_XIU, CROISSANT] },
  { source: 'QR', fulfillment: 'Dine_In', status: 'Ready', minutesAgo: 18, table: 3, lines: [TRA_DAO] },
  { source: 'POS', fulfillment: 'Dine_In', status: 'Served', minutesAgo: 35, table: 4, lines: [AMERICANO] },
  { source: 'QR', fulfillment: 'Dine_In', status: 'Completed', minutesAgo: 90, table: 5, lines: [CAFE_M] },
  // Pickup
  { source: 'POS', fulfillment: 'Pickup', status: 'Pending', minutesAgo: 5, lines: [AMERICANO] },
  { source: 'Online', fulfillment: 'Pickup', status: 'Ready', minutesAgo: 20, lines: [BAC_XIU] },
  { source: 'Online', fulfillment: 'Pickup', status: 'Completed', minutesAgo: 120, lines: [TRA_DAO] },
  { source: 'POS', fulfillment: 'Pickup', status: 'Rejected', minutesAgo: 150, cancelFrom: 'Pending', reason: 'Hết nguyên liệu', lines: [CROISSANT] },
  // Delivery
  { source: 'Online', fulfillment: 'Delivery', status: 'Pending_Payment', minutesAgo: 4, lines: [CAFE_M] },
  { source: 'Online', fulfillment: 'Delivery', status: 'Ready', minutesAgo: 25, lines: [TRA_DAO, CROISSANT] },
  { source: 'Online', fulfillment: 'Delivery', status: 'Shipping', minutesAgo: 40, lines: [BAC_XIU], userId: 'u-customer2' },
  { source: 'Online', fulfillment: 'Delivery', status: 'Cancelled', minutesAgo: 200, cancelFrom: 'Confirmed', reason: 'Khách đổi ý', lines: [AMERICANO] },
];

function chainOf(spec: Spec): OrderStatus[] {
  if (spec.status === 'Pending_Payment') return ['Pending_Payment'];
  const path = PATH[spec.fulfillment];
  if (spec.status === 'Cancelled' || spec.status === 'Rejected') {
    return [...path.slice(0, path.indexOf(spec.cancelFrom ?? 'Pending') + 1), spec.status];
  }
  return path.slice(0, path.indexOf(spec.status) + 1);
}

function sessionFor(tableId: number, minutesAgo: number): TableSession {
  const existing = db.sessions.find((s) => s.tableId === tableId);
  if (existing) return existing;
  const session: TableSession = {
    id: ++db.seq.session, tableId, sessionCode: `seed-session-${tableId}`, customerId: null, status: 'Active',
    openedAt: nowNaive(-minutesAgo * 60_000), expiresAt: nowNaive(4 * 60 * 60_000), closedAt: null,
  };
  db.sessions.push(session);
  return session;
}

function build(spec: Spec): OrderDetail {
  const id = ++db.seq.order;
  const items = spec.lines.map((l) => buildItem(l, BRANCH_ID, id));
  const subTotal = items.reduce((s, i) => s + i.quantity * (i.unitPrice + i.optionsUnitTotal), 0);
  const deliveryFee = spec.fulfillment === 'Delivery' ? DELIVERY_FEE : 0;
  const finalAmount = subTotal + deliveryFee;

  const table = spec.table ? db.tables.find((t) => t.id === spec.table) : undefined;
  const session = table ? sessionFor(table.id, spec.minutesAgo) : undefined;

  const chain = chainOf(spec);
  const stamp = (i: number) => nowNaive(-spec.minutesAgo * 60_000 + i * 120_000); // mỗi bước cách nhau 2 phút
  const last = chain.length - 1;
  const failed = spec.status === 'Cancelled' || spec.status === 'Rejected';
  const isDelivery = spec.fulfillment === 'Delivery';

  return {
    id,
    orderCode: `SC${String(id).padStart(5, '0')}`,
    idempotencyKey: null,
    userId: spec.source === 'Online' ? (spec.userId ?? 'u-customer') : null,
    createdBy: spec.source === 'POS' ? 'u-cashier' : null,
    branchId: BRANCH_ID,
    tableSessionId: session?.id ?? null,
    orderSource: spec.source,
    fulfillmentType: spec.fulfillment,
    deliveryName: isDelivery ? 'Nguyễn Văn A' : null,
    deliveryPhone: isDelivery ? '0901234567' : null,
    deliveryAddress: isDelivery ? '12 Nguyễn Huệ, Q.1, TP.HCM' : null,
    deliveryLatitude: isDelivery ? 10.7743 : null,
    deliveryLongitude: isDelivery ? 106.7019 : null,
    subTotal, itemDiscountAmount: 0, voucherCode: null, voucherDiscountAmount: 0, deliveryFee,
    vatAmount: Math.round((finalAmount * 8) / 108),
    finalAmount,
    status: spec.status,
    paymentStatus: 'Unpaid', // TODO: đổi sang giá trị "đã thanh toán" thật khi có enum PaymentStatus trong types.ts
    expiresAt: spec.status === 'Pending_Payment' ? nowNaive(-spec.minutesAgo * 60_000 + 15 * 60_000) : null,
    cancelReason: failed ? (spec.reason ?? null) : null,
    cancelledBy: null,
    cancelledAt: failed ? stamp(last) : null,
    completedAt: spec.status === 'Completed' ? stamp(last) : null,
    note: spec.note ?? null,
    version: chain.length,
    createdAt: stamp(0),
    updatedAt: stamp(last),
    tableNumber: table?.tableNumber ?? null,
    items,
    statusHistory: chain.map((status, i) => ({
      id: ++db.seq.history, orderId: id, fromStatus: chain[i - 1] ?? null, status, changedBy: null,
      note: failed && i === last ? (spec.reason ?? null) : null, createdAt: stamp(i),
    })),
  };
}

export function seedDemoOrders(): void {
  if (db.orders.length > 0) return; // idempotent (HMR / gọi lại không nhân đôi)
  for (const spec of SPECS) db.orders.push(build(spec));
}

/** Dùng trong DevTools: __mock.resetWithDemoData() */
export function resetWithDemoData(resetDb: () => void): void {
  resetDb();
  seedDemoOrders();
}