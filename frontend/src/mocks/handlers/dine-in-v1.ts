import { http } from 'msw';
import type { OrderDetail, OrderStatus, TableSession } from '@/shared/types';
import { MOCK_BRANCH } from './branch';
import { buildItem } from './order';
import { accountFromRequest } from './identity';
import { BRANCH_ID, db, findVariant, isExpired, isSellable, nowNaive, type MockCart, type MockCartItem } from '../db';
import { envelopeError, fail, guardedV1, noContent, ok, readJson, url } from '../utils';

/**
 * Handler theo SmartAPI v1 cho luồng Dine-in (Store: Bàn & QR / Phiên bàn / Chi nhánh; Order: Giỏ hàng / Đặt hàng QR).
 * Envelope {success,data,meta,trace_id}, JSON snake_case, header guest. Trạng thái phiên/giỏ nằm trong RAM (db) →
 * đơn tạo ở đây là đơn thật trong db.orders nên vẫn hiện ở hàng đợi nhân viên mock.
 */
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const H_SESSION = 'X-Table-Session-Code';
const H_CLIENT = 'X-Client-Key';

const tableOpenSession = (tableId: number) =>
  db.sessions.find((s) => s.tableId === tableId && (s.status === 'Active' || s.status === 'Payment_Pending') && !isExpired(s.expiresAt));

const sessionView = (s: TableSession) => {
  const table = db.tables.find((t) => t.id === s.tableId);
  return { ...s, branchId: table?.branchId ?? BRANCH_ID, tableNumber: table?.tableNumber ?? null };
};

/** Thiếu header → 401, mã lạ → 403 (spec 401/403); phiên hết hạn coi như không hợp lệ. */
function sessionFromHeader(request: Request): TableSession {
  const code = request.headers.get(H_SESSION);
  if (!code) fail(401, 'UNAUTHORIZED', `Thiếu header ${H_SESSION}`);
  const session = db.sessions.find((s) => s.sessionCode === code);
  if (!session) fail(403, 'FORBIDDEN', 'Mã phiên bàn không hợp lệ');
  return session;
}

// ── Giỏ ───────────────────────────────────────────────────────────────
function guestCartCtx(request: Request) {
  const session = sessionFromHeader(request);
  const clientKey = request.headers.get(H_CLIENT);
  if (!clientKey) fail(400, 'VALIDATION_ERROR', `Thiếu header ${H_CLIENT}`);
  if (new URL(request.url).searchParams.get('source') !== 'QR') fail(400, 'VALIDATION_ERROR', 'Thiếu query source=QR');
  return { session, clientKey };
}

const activeCart = (sessionId: number, clientKey: string) =>
  db.carts.find((c) => c.tableSessionId === sessionId && c.clientKey === clientKey && c.status === 'Active');

function requireActiveCart(session: TableSession, clientKey: string): MockCart {
  const cart = activeCart(session.id, clientKey);
  if (!cart) fail(404, 'NOT_FOUND', 'Chưa có giỏ hàng đang hoạt động');
  return cart;
}

function requireOpenForOrdering(session: TableSession): void {
  if (session.status !== 'Active' || isExpired(session.expiresAt)) {
    fail(409, 'INVALID_STATE_TRANSITION', 'Phiên bàn không còn nhận món (đã yêu cầu thanh toán hoặc đã đóng)');
  }
}

interface LineBody {
  variant_id?: unknown;
  quantity?: unknown;
  note?: unknown;
  options?: { option_id?: unknown; quantity?: unknown }[];
}

/** Validate như server: variant tồn tại, còn hàng (422 OUT_OF_STOCK), option đúng ràng buộc nhóm. */
function parseLine(body: LineBody, branchId: number): Omit<MockCartItem, 'id'> {
  const variantId = Number(body.variant_id);
  const quantity = Number(body.quantity);
  if (!Number.isInteger(variantId)) fail(400, 'VALIDATION_ERROR', 'variant_id không hợp lệ');
  if (!Number.isInteger(quantity) || quantity < 1) fail(400, 'VALIDATION_ERROR', 'quantity phải là số nguyên ≥ 1');
  const found = findVariant(variantId);
  if (!found) fail(404, 'NOT_FOUND', `Không tìm thấy variant ${variantId}`);
  if (!isSellable(branchId, found.seed, found.variant)) {
    throw new OutOfStock(variantId, `${found.seed.product.name} (${found.variant.variantName}) hiện đã hết hàng`);
  }
  const options = (body.options ?? []).map((o) => ({ optionId: Number(o.option_id), quantity: Number(o.quantity ?? 1) }));
  // Tái dùng validator option của đơn legacy; khôi phục bộ đếm id vì đây chỉ là kiểm tra.
  const keep = { item: db.seq.item, option: db.seq.option };
  try {
    buildItem({ variantId, quantity, options }, branchId, 0);
  } finally {
    db.seq.item = keep.item;
    db.seq.option = keep.option;
  }
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
  return { variantId, quantity, note, options };
}

class OutOfStock extends Error {
  readonly variantId: number;
  constructor(variantId: number, message: string) {
    super(message);
    this.variantId = variantId;
  }
}

/** 422 OUT_OF_STOCK kèm details[{variant_id}] như spec. */
const outOfStockResponse = (e: OutOfStock) =>
  envelopeError(422, 'OUT_OF_STOCK', e.message, [{ variant_id: e.variantId }]);

function itemView(cart: MockCart, it: MockCartItem) {
  const { seed, variant } = findVariant(it.variantId)!;
  const allOptions = seed.groups.flatMap((g) => g.options);
  const options = it.options.map((o) => {
    const opt = allOptions.find((x) => x.id === o.optionId);
    return { optionId: o.optionId, quantity: o.quantity, optionName: opt?.optionName ?? '', unitPrice: opt?.extraPrice ?? 0 };
  });
  const optionsUnitTotal = options.reduce((s, o) => s + o.unitPrice * o.quantity, 0);
  return {
    id: it.id,
    variantId: it.variantId,
    quantity: it.quantity,
    note: it.note,
    options,
    productId: seed.product.id,
    productName: seed.product.name,
    productImage: seed.product.image,
    variantName: variant.variantName,
    unitPrice: variant.price,
    optionsUnitTotal,
    lineTotal: it.quantity * (variant.price + optionsUnitTotal),
    isAvailable: isSellable(cart.branchId, seed, variant),
  };
}

/** Cart + items + pricing◇ (server tính). */
function cartView(cart: MockCart) {
  const items = cart.items.map((it) => itemView(cart, it));
  return {
    id: cart.id,
    cartSource: 'QR',
    branchId: cart.branchId,
    fulfillmentType: 'Dine_In',
    userId: null,
    tableSessionId: cart.tableSessionId,
    clientKey: cart.clientKey,
    status: cart.status,
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
    items,
    pricing: { subTotal: items.reduce((s, i) => s + i.lineTotal, 0), itemCount: items.reduce((s, i) => s + i.quantity, 0) },
  };
}

const touch = (cart: MockCart) => {
  cart.updatedAt = nowNaive();
};

/** guardedV1 + chuyển OutOfStock thành 422 có details. */
const withStock = (resolver: Parameters<typeof guardedV1>[0]): ReturnType<typeof guardedV1> =>
  guardedV1(async (info) => {
    try {
      return await resolver(info);
    } catch (e) {
      if (e instanceof OutOfStock) return outOfStockResponse(e);
      throw e;
    }
  });

export const dineInV1Handlers = [
  // ── Chi nhánh ──
  http.get(url('/branches'), guardedV1(() => ok([MOCK_BRANCH]))),
  http.get(
    url('/branches/:id'),
    guardedV1(({ params }) => {
      if (Number(params.id) !== MOCK_BRANCH.id) fail(404, 'NOT_FOUND', `Không có chi nhánh ${String(params.id)}`);
      return ok(MOCK_BRANCH);
    }),
  ),

  // ── Bàn & QR / Phiên bàn ──
  http.get(
    url('/qr/:qr'),
    guardedV1(({ params }) => {
      const table = db.tables.find((t) => t.qrCode === params.qr);
      if (!table) fail(404, 'NOT_FOUND', 'Mã QR không hợp lệ');
      const open = tableOpenSession(table.id);
      return ok({
        tableId: table.id,
        tableNumber: table.tableNumber,
        branch: { id: MOCK_BRANCH.id, name: MOCK_BRANCH.name },
        tableIsActive: table.isActive,
        status: open ? 'Occupied' : 'Empty',
        openSessionId: open?.id ?? null,
      });
    }),
  ),

  http.post(
    url('/qr/:qr/sessions'),
    guardedV1(({ params, request }) => {
      const table = db.tables.find((t) => t.qrCode === params.qr);
      if (!table) fail(404, 'NOT_FOUND', 'Mã QR không hợp lệ');
      if (!table.isActive) fail(409, 'CONFLICT', `Bàn ${table.tableNumber} đang tạm ngưng phục vụ`);

      const caller = accountFromRequest(request); // Bearer tuỳ chọn → customer_id
      const customerId = caller?.roleName === 'Customer' ? caller.id : null;

      const open = tableOpenSession(table.id);
      if (open) {
        if (open.status === 'Payment_Pending') fail(409, 'CONFLICT', 'Bàn đang chờ thanh toán');
        if (customerId && !open.customerId) open.customerId = customerId;
        return ok(open, null, { status: 200 });
      }
      const session: TableSession = {
        id: ++db.seq.session,
        tableId: table.id,
        sessionCode: crypto.randomUUID().replaceAll('-', ''),
        customerId,
        status: 'Active',
        openedAt: nowNaive(),
        expiresAt: nowNaive(SESSION_TTL_MS),
        closedAt: null,
      };
      db.sessions.push(session);
      return ok(session, null, { status: 201 });
    }),
  ),

  http.get(
    url('/table-sessions/current'),
    guardedV1(({ request }) => {
      const session = sessionFromHeader(request);
      if (session.status !== 'Active' && session.status !== 'Payment_Pending') fail(404, 'NOT_FOUND', 'Phiên bàn đã đóng');
      return ok(sessionView(session));
    }),
  ),

  http.post(
    url('/table-sessions/current/request-payment'),
    guardedV1(({ request }) => {
      const session = sessionFromHeader(request);
      if (session.status !== 'Active') fail(409, 'INVALID_STATE_TRANSITION', `Không thể yêu cầu thanh toán khi phiên đang ${session.status}`);
      session.status = 'Payment_Pending';
      return ok({ id: session.id, status: session.status });
    }),
  ),

  // ── Giỏ hàng QR ──
  http.post(
    url('/carts'),
    guardedV1(async ({ request }) => {
      const { session, clientKey } = guestCartCtx(request);
      const body = await readJson<{ cart_source?: string; branch_id?: number; fulfillment_type?: string }>(request);
      if (body.cart_source !== 'QR' || body.fulfillment_type !== 'Dine_In') {
        fail(400, 'VALIDATION_ERROR', 'Giỏ QR bắt buộc cart_source=QR và fulfillment_type=Dine_In');
      }
      if (body.branch_id !== MOCK_BRANCH.id) fail(404, 'NOT_FOUND', `Không có chi nhánh ${String(body.branch_id)}`);
      requireOpenForOrdering(session);

      const existing = activeCart(session.id, clientKey);
      if (existing) return ok(cartView(existing), null, { status: 200 });
      const now = nowNaive();
      const cart: MockCart = {
        id: ++db.seq.cart, branchId: body.branch_id, tableSessionId: session.id, clientKey,
        status: 'Active', items: [], createdAt: now, updatedAt: now,
      };
      db.carts.push(cart);
      return ok(cartView(cart), null, { status: 201 });
    }),
  ),

  http.get(
    url('/carts/current'),
    guardedV1(({ request }) => {
      const { session, clientKey } = guestCartCtx(request);
      return ok(cartView(requireActiveCart(session, clientKey)));
    }),
  ),

  http.post(
    url('/carts/current/items'),
    withStock(async ({ request }) => {
      const { session, clientKey } = guestCartCtx(request);
      requireOpenForOrdering(session);
      const cart = requireActiveCart(session, clientKey);
      const line = parseLine(await readJson<LineBody>(request), cart.branchId);
      cart.items.push({ id: ++db.seq.cartItem, ...line });
      touch(cart);
      return ok(cartView(cart), null, { status: 201 });
    }),
  ),

  http.put(
    url('/carts/current/items/:itemId'),
    withStock(async ({ request, params }) => {
      const { session, clientKey } = guestCartCtx(request);
      requireOpenForOrdering(session);
      const cart = requireActiveCart(session, clientKey);
      const item = cart.items.find((i) => i.id === Number(params.itemId));
      if (!item) fail(404, 'NOT_FOUND', 'Không tìm thấy dòng giỏ');
      const body = await readJson<LineBody>(request);
      Object.assign(item, parseLine({ ...body, variant_id: item.variantId }, cart.branchId));
      touch(cart);
      return ok(cartView(cart));
    }),
  ),

  http.delete(
    url('/carts/current/items/:itemId'),
    guardedV1(({ request, params }) => {
      const { session, clientKey } = guestCartCtx(request);
      const cart = requireActiveCart(session, clientKey);
      const idx = cart.items.findIndex((i) => i.id === Number(params.itemId));
      if (idx < 0) fail(404, 'NOT_FOUND', 'Không tìm thấy dòng giỏ');
      cart.items.splice(idx, 1);
      touch(cart);
      return noContent();
    }),
  ),

  http.delete(
    url('/carts/current'),
    guardedV1(({ request }) => {
      const { session, clientKey } = guestCartCtx(request);
      const cart = requireActiveCart(session, clientKey);
      cart.status = 'Abandoned';
      touch(cart);
      return noContent();
    }),
  ),

  // ── Đặt hàng QR (POST /orders) ──
  http.post(
    url('/orders'),
    withStock(async ({ request }) => {
      const key = request.headers.get('Idempotency-Key');
      if (!key) fail(400, 'VALIDATION_ERROR', 'Thiếu header Idempotency-Key');
      const session = sessionFromHeader(request);
      const body = await readJson<{
        cart_id?: number; order_source?: string; fulfillment_type?: string; branch_id?: number; table_session_id?: number; note?: string;
      }>(request);

      // Cùng key → trả lại đơn cũ, không tạo thêm (retry sau mất response). Khác payload → 409 IDEMPOTENCY_CONFLICT.
      const dup = db.orders.find((o) => o.idempotencyKey === key);
      if (dup) {
        if (dup.tableSessionId !== body.table_session_id) fail(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency-Key đã dùng cho yêu cầu khác');
        return ok(dup, null, { status: 200 });
      }

      if (body.order_source !== 'QR' || body.fulfillment_type !== 'Dine_In') {
        fail(400, 'VALIDATION_ERROR', 'Mock POST /orders chỉ hỗ trợ order_source=QR, fulfillment_type=Dine_In');
      }
      if (body.table_session_id !== session.id) fail(403, 'FORBIDDEN', 'table_session_id không khớp phiên bàn');
      requireOpenForOrdering(session);
      if (body.branch_id !== MOCK_BRANCH.id) fail(404, 'NOT_FOUND', `Không có chi nhánh ${String(body.branch_id)}`);

      const cart = db.carts.find((c) => c.id === body.cart_id && c.tableSessionId === session.id);
      if (!cart) fail(404, 'NOT_FOUND', 'Không tìm thấy giỏ hàng');
      if (cart.status !== 'Active') fail(409, 'INVALID_STATE_TRANSITION', `Giỏ hàng đã ${cart.status}`);
      if (cart.items.length === 0) fail(422, 'BUSINESS_RULE_VIOLATION', 'Giỏ hàng trống');

      // Kiểm tra lại tồn ngay lúc đặt: món vừa hết sau khi thêm vào giỏ → 422.
      for (const it of cart.items) {
        const f = findVariant(it.variantId)!;
        if (!isSellable(cart.branchId, f.seed, f.variant)) {
          throw new OutOfStock(it.variantId, `${f.seed.product.name} (${f.variant.variantName}) hiện đã hết hàng`);
        }
      }

      const table = db.tables.find((t) => t.id === session.tableId);
      const orderId = db.seq.order + 1;
      const items = cart.items.map((it) =>
        buildItem({ variantId: it.variantId, quantity: it.quantity, options: it.options, ...(it.note ? { note: it.note } : {}) }, cart.branchId, orderId),
      );
      // Server tự snapshot và tính: FE không gửi bất kỳ số tiền nào.
      const subTotal = items.reduce((s, i) => s + i.quantity * (i.unitPrice + i.optionsUnitTotal), 0);
      const finalAmount = subTotal;
      const now = nowNaive();
      const status: OrderStatus = 'Pending';
      db.seq.order = orderId;
      const order: OrderDetail = {
        id: orderId,
        orderCode: `SC${String(orderId).padStart(5, '0')}`,
        idempotencyKey: key,
        userId: session.customerId ?? null,
        createdBy: null,
        branchId: cart.branchId,
        tableSessionId: session.id,
        orderSource: 'QR',
        fulfillmentType: 'Dine_In',
        deliveryName: null, deliveryPhone: null, deliveryAddress: null, deliveryLatitude: null, deliveryLongitude: null,
        subTotal, itemDiscountAmount: 0, voucherCode: null, voucherDiscountAmount: 0, deliveryFee: 0,
        vatAmount: Math.round((finalAmount * 8) / 108), // VAT 8% đã nằm trong giá
        finalAmount,
        status,
        paymentStatus: 'Unpaid',
        expiresAt: null,
        cancelReason: null, cancelledBy: null, cancelledAt: null, completedAt: null,
        note: body.note?.trim() || null,
        version: 1,
        createdAt: now, updatedAt: now,
        tableNumber: table?.tableNumber ?? null,
        items,
        statusHistory: [{ id: ++db.seq.history, orderId, fromStatus: null, status, changedBy: null, note: null, createdAt: now }],
      };
      db.orders.push(order);
      cart.status = 'Converted';
      touch(cart);
      return ok(order, null, { status: 201 });
    }),
  ),
];
