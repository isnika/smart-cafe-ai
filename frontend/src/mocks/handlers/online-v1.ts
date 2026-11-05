import { http } from 'msw';
import type { OrderDetail, OrderStatus } from '@/shared/types';
import { MOCK_BRANCH } from './branch';
import { buildItem } from './order';
import { accountFromRequest, type MockAccount } from './identity';
import { evaluateVoucher } from './voucher';
import { itemView, OutOfStock, parseLine, touch, withStock, type LineBody } from './dine-in-v1';
import { db, findVariant, isSellable, nowNaive, type MockAddress, type MockOnlineCart } from '../db';
import { DELIVERY_FEE } from '../fixtures';
import { fail, guardedV1, noContent, ok, readJson, url } from '../utils';

/**
 * Handler SmartAPI v1 cho luồng ONLINE (Customer, Bearer):
 *  - Giỏ Online (POST /carts {cart_source:'Online'}, /carts/current…?source=Online) — tách hẳn giỏ QR, cô lập theo user_id.
 *  - POST /orders với order_source='Online'.
 *  - Địa chỉ giao hàng /users/me/addresses.
 * Request không thuộc Online được NHẢ XUỐNG handler Dine-in (resolver trả undefined → MSW thử handler kế tiếp),
 * nên luồng QR không bị ảnh hưởng. Đơn tạo ở đây nằm trong db.orders → vẫn hiện ở hàng đợi nhân viên mock.
 */
const PENDING_PAYMENT_TTL_MS = 15 * 60 * 1000;
/** Header chỉ mock: spec POST /orders không có phương thức thanh toán nên mock cần gợi ý để tạo Pending_Payment (VNPay/Momo). */
const H_MOCK_PAYMENT = 'X-Mock-Payment-Method';

type Info = Parameters<Parameters<typeof guardedV1>[0]>[0];
type Resolver = (info: Info) => ReturnType<Parameters<typeof guardedV1>[0]>;

/** Chỉ xử lý khi `isOnline`; ngược lại trả undefined để MSW chuyển sang handler Dine-in. */
const onlyWhen =
  (isOnline: (info: Info) => boolean | Promise<boolean>, resolver: Resolver): Resolver =>
  async (info) =>
    (await isOnline(info)) ? resolver(info) : undefined;

const queryIsOnline = ({ request }: Info) => new URL(request.url).searchParams.get('source') === 'Online';
const bodyIs = (field: string, value: string) => async ({ request }: Info) => {
  try {
    return ((await request.clone().json()) as Record<string, unknown>)[field] === value;
  } catch {
    return false;
  }
};

/** Online bắt buộc Bearer của Customer: thiếu/sai token → 401, không phải Customer → 403. KHÔNG dùng header guest. */
function customerOf(request: Request): MockAccount {
  const account = accountFromRequest(request);
  if (!account) fail(401, 'UNAUTHORIZED', 'Thiếu hoặc sai access token');
  if (account.roleName !== 'Customer') fail(403, 'FORBIDDEN', 'Chỉ khách hàng mới dùng giỏ/đơn Online');
  return account;
}

// ── Giỏ ───────────────────────────────────────────────────────────────
const activeCart = (userId: string) => db.onlineCarts.find((c) => c.userId === userId && c.status === 'Active');

function requireActiveCart(userId: string): MockOnlineCart {
  const cart = activeCart(userId);
  if (!cart) fail(404, 'NOT_FOUND', 'Chưa có giỏ hàng đang hoạt động');
  return cart;
}

function cartView(cart: MockOnlineCart) {
  const items = cart.items.map((it) => itemView(cart, it));
  return {
    id: cart.id,
    cartSource: 'Online',
    branchId: cart.branchId,
    fulfillmentType: cart.fulfillmentType,
    userId: cart.userId,
    tableSessionId: null,
    clientKey: null,
    status: cart.status,
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
    items,
    pricing: { subTotal: items.reduce((s, i) => s + i.lineTotal, 0), itemCount: items.reduce((s, i) => s + i.quantity, 0) },
  };
}

// ── Địa chỉ ───────────────────────────────────────────────────────────
interface AddressBody {
  label?: string | null;
  receiver_name?: string;
  phone?: string;
  province?: string;
  district?: string | null;
  ward?: string;
  address_line?: string;
  latitude?: number | null;
  longitude?: number | null;
  is_default?: boolean;
}

const addressView = (a: MockAddress) => a;
const mine = (userId: string) => db.addresses.filter((a) => a.userId === userId);

function requireOwn(userId: string, id: unknown): MockAddress {
  // Địa chỉ của user khác → 404 (spec: "resource không thuộc phạm vi được xem").
  const found = db.addresses.find((a) => a.id === Number(id) && a.userId === userId);
  if (!found) fail(404, 'NOT_FOUND', 'Không tìm thấy địa chỉ');
  return found;
}

function readAddress(body: AddressBody): Omit<MockAddress, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'isDefault'> {
  const required = { receiver_name: body.receiver_name, phone: body.phone, province: body.province, ward: body.ward, address_line: body.address_line };
  const missing = Object.entries(required).filter(([, v]) => typeof v !== 'string' || !v.trim()).map(([k]) => k);
  if (missing.length) fail(400, 'VALIDATION_ERROR', `Thiếu trường bắt buộc: ${missing.join(', ')}`);
  return {
    label: body.label?.trim() || null,
    receiverName: body.receiver_name!.trim(),
    phone: body.phone!.trim(),
    province: body.province!.trim(),
    district: body.district?.trim() || null,
    ward: body.ward!.trim(),
    addressLine: body.address_line!.trim(),
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
  };
}

function makeDefault(userId: string, address: MockAddress): void {
  for (const a of mine(userId)) a.isDefault = a.id === address.id; // cùng "transaction": bỏ mặc định cũ
}

export const onlineV1Handlers = [
  // ── Địa chỉ giao hàng ──
  http.get(url('/users/me/addresses'), guardedV1(({ request }) => {
    const u = customerOf(request);
    return ok([...mine(u.id)].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.id - a.id).map(addressView));
  })),
  http.post(url('/users/me/addresses'), guardedV1(async ({ request }) => {
    const u = customerOf(request);
    const body = await readJson<AddressBody>(request);
    const fields = readAddress(body);
    const now = nowNaive();
    const address: MockAddress = { id: ++db.seq.address, userId: u.id, ...fields, isDefault: false, createdAt: now, updatedAt: now };
    db.addresses.push(address);
    if (body.is_default === true) makeDefault(u.id, address);
    return ok(addressView(address), null, { status: 201 });
  })),
  http.get(url('/users/me/addresses/:id'), guardedV1(({ request, params }) => ok(addressView(requireOwn(customerOf(request).id, params.id))))),
  http.put(url('/users/me/addresses/:id'), guardedV1(async ({ request, params }) => {
    const u = customerOf(request);
    const address = requireOwn(u.id, params.id);
    const body = await readJson<AddressBody>(request);
    Object.assign(address, readAddress(body), { updatedAt: nowNaive() });
    if (body.is_default === true) makeDefault(u.id, address);
    return ok(addressView(address));
  })),
  http.patch(url('/users/me/addresses/:id/default'), guardedV1(({ request, params }) => {
    const u = customerOf(request);
    const address = requireOwn(u.id, params.id);
    makeDefault(u.id, address);
    address.updatedAt = nowNaive();
    return ok(addressView(address));
  })),
  http.delete(url('/users/me/addresses/:id'), guardedV1(({ request, params }) => {
    const u = customerOf(request);
    const address = requireOwn(u.id, params.id);
    db.addresses.splice(db.addresses.indexOf(address), 1);
    return noContent();
  })),

  // ── Giỏ Online ──
  http.post(url('/carts'), onlyWhen(bodyIs('cart_source', 'Online'), guardedV1(async ({ request }) => {
    const u = customerOf(request);
    const body = await readJson<{ branch_id?: number; fulfillment_type?: string }>(request);
    if (body.fulfillment_type !== 'Delivery' && body.fulfillment_type !== 'Pickup') {
      fail(400, 'VALIDATION_ERROR', 'Giỏ Online bắt buộc fulfillment_type là Delivery hoặc Pickup');
    }
    if (body.branch_id !== MOCK_BRANCH.id) fail(404, 'NOT_FOUND', `Không có chi nhánh ${String(body.branch_id)}`);
    const existing = activeCart(u.id); // một giỏ Active/user
    if (existing) return ok(cartView(existing), null, { status: 200 });
    const now = nowNaive();
    const cart: MockOnlineCart = {
      id: ++db.seq.cart, userId: u.id, branchId: body.branch_id, fulfillmentType: body.fulfillment_type,
      status: 'Active', items: [], createdAt: now, updatedAt: now,
    };
    db.onlineCarts.push(cart);
    return ok(cartView(cart), null, { status: 201 });
  }))),
  http.get(url('/carts/current'), onlyWhen(queryIsOnline, guardedV1(({ request }) => ok(cartView(requireActiveCart(customerOf(request).id)))))),
  http.post(url('/carts/current/items'), onlyWhen(queryIsOnline, withStock(async ({ request }) => {
    const cart = requireActiveCart(customerOf(request).id);
    const line = parseLine(await readJson<LineBody>(request), cart.branchId);
    cart.items.push({ id: ++db.seq.cartItem, ...line });
    touch(cart);
    return ok(cartView(cart), null, { status: 201 });
  }))),
  http.put(url('/carts/current/items/:itemId'), onlyWhen(queryIsOnline, withStock(async ({ request, params }) => {
    const cart = requireActiveCart(customerOf(request).id);
    const item = cart.items.find((i) => i.id === Number(params.itemId));
    if (!item) fail(404, 'NOT_FOUND', 'Không tìm thấy dòng giỏ');
    Object.assign(item, parseLine({ ...(await readJson<LineBody>(request)), variant_id: item.variantId }, cart.branchId));
    touch(cart);
    return ok(cartView(cart));
  }))),
  http.delete(url('/carts/current/items/:itemId'), onlyWhen(queryIsOnline, guardedV1(({ request, params }) => {
    const cart = requireActiveCart(customerOf(request).id);
    const idx = cart.items.findIndex((i) => i.id === Number(params.itemId));
    if (idx < 0) fail(404, 'NOT_FOUND', 'Không tìm thấy dòng giỏ');
    cart.items.splice(idx, 1);
    touch(cart);
    return noContent();
  }))),
  http.delete(url('/carts/current'), onlyWhen(queryIsOnline, guardedV1(({ request }) => {
    const cart = requireActiveCart(customerOf(request).id);
    cart.status = 'Abandoned';
    touch(cart);
    return noContent();
  }))),

  // ── Đặt hàng Online (POST /orders) ──
  http.post(url('/orders'), onlyWhen(bodyIs('order_source', 'Online'), withStock(async ({ request }) => {
    const u = customerOf(request);
    const key = request.headers.get('Idempotency-Key');
    if (!key) fail(400, 'VALIDATION_ERROR', 'Thiếu header Idempotency-Key');
    const body = await readJson<{
      cart_id?: number; fulfillment_type?: string; branch_id?: number; note?: string; voucher_code?: string;
      delivery_name?: string; delivery_phone?: string; delivery_address?: string; delivery_latitude?: number; delivery_longitude?: number;
    }>(request);

    // Cùng key + cùng user → trả lại đơn cũ (200). Khác payload → 409 IDEMPOTENCY_CONFLICT.
    const dup = db.orders.find((o) => o.idempotencyKey === key && o.userId === u.id);
    if (dup) {
      const cart = db.onlineCarts.find((c) => c.userId === u.id && c.id === body.cart_id);
      if (!cart || dup.fulfillmentType !== body.fulfillment_type) fail(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency-Key đã dùng cho yêu cầu khác');
      return ok(dup, null, { status: 200 });
    }

    const fulfillment = body.fulfillment_type;
    if (fulfillment !== 'Delivery' && fulfillment !== 'Pickup') fail(400, 'VALIDATION_ERROR', 'Đơn Online bắt buộc fulfillment_type là Delivery hoặc Pickup');
    if (fulfillment === 'Delivery' && !(body.delivery_name?.trim() && body.delivery_phone?.trim() && body.delivery_address?.trim())) {
      fail(400, 'VALIDATION_ERROR', 'Đơn giao hàng bắt buộc delivery_name/delivery_phone/delivery_address');
    }
    if (body.branch_id !== MOCK_BRANCH.id) fail(404, 'NOT_FOUND', `Không có chi nhánh ${String(body.branch_id)}`);
    if (!MOCK_BRANCH.acceptsOnlineOrders) fail(422, 'BUSINESS_RULE_VIOLATION', 'Chi nhánh không nhận đơn Online');

    const cart = db.onlineCarts.find((c) => c.id === body.cart_id && c.userId === u.id); // giỏ của user khác → 404
    if (!cart) fail(404, 'NOT_FOUND', 'Không tìm thấy giỏ hàng');
    if (cart.status !== 'Active') fail(409, 'INVALID_STATE_TRANSITION', `Giỏ hàng đã ${cart.status}`);
    if (cart.fulfillmentType !== fulfillment) fail(422, 'BUSINESS_RULE_VIOLATION', 'Hình thức nhận hàng không khớp giỏ hàng');
    if (cart.items.length === 0) fail(422, 'BUSINESS_RULE_VIOLATION', 'Giỏ hàng trống');
    for (const it of cart.items) {
      const f = findVariant(it.variantId)!;
      if (!isSellable(cart.branchId, f.seed, f.variant)) {
        throw new OutOfStock(it.variantId, `${f.seed.product.name} (${f.variant.variantName}) hiện đã hết hàng`);
      }
    }

    // Server tự snapshot và tính toàn bộ tiền: FE không gửi số tiền nào.
    const orderId = db.seq.order + 1;
    const items = cart.items.map((it) =>
      buildItem({ variantId: it.variantId, quantity: it.quantity, options: it.options, ...(it.note ? { note: it.note } : {}) }, cart.branchId, orderId),
    );
    const subTotal = items.reduce((s, i) => s + i.quantity * (i.unitPrice + i.optionsUnitTotal), 0);
    let voucherDiscountAmount = 0;
    if (body.voucher_code) {
      const v = evaluateVoucher(body.voucher_code, subTotal);
      if (!v.valid) fail(422, 'BUSINESS_RULE_VIOLATION', v.message ?? 'Mã giảm giá không hợp lệ');
      voucherDiscountAmount = v.discountAmount;
    }
    const deliveryFee = fulfillment === 'Delivery' ? DELIVERY_FEE : 0;
    const finalAmount = subTotal - voucherDiscountAmount + deliveryFee;

    // VNPay/Momo → Pending_Payment (có hạn); COD/không gợi ý → Pending, payment_status Unpaid.
    const hint = request.headers.get(H_MOCK_PAYMENT);
    const awaitingPayment = hint === 'VNPay' || hint === 'Momo';
    const status: OrderStatus = awaitingPayment ? 'Pending_Payment' : 'Pending';
    const now = nowNaive();
    db.seq.order = orderId;
    const order: OrderDetail = {
      id: orderId,
      orderCode: `SC${String(orderId).padStart(5, '0')}`,
      idempotencyKey: key,
      userId: u.id,
      createdBy: null,
      branchId: cart.branchId,
      tableSessionId: null,
      orderSource: 'Online',
      fulfillmentType: fulfillment,
      deliveryName: fulfillment === 'Delivery' ? body.delivery_name!.trim() : null,
      deliveryPhone: fulfillment === 'Delivery' ? body.delivery_phone!.trim() : null,
      deliveryAddress: fulfillment === 'Delivery' ? body.delivery_address!.trim() : null,
      deliveryLatitude: fulfillment === 'Delivery' ? (body.delivery_latitude ?? null) : null,
      deliveryLongitude: fulfillment === 'Delivery' ? (body.delivery_longitude ?? null) : null,
      subTotal, itemDiscountAmount: 0,
      voucherCode: voucherDiscountAmount > 0 ? body.voucher_code!.toUpperCase() : null,
      voucherDiscountAmount, deliveryFee,
      vatAmount: Math.round((finalAmount * 8) / 108), // VAT 8% đã nằm trong giá
      finalAmount,
      status,
      paymentStatus: 'Unpaid',
      expiresAt: awaitingPayment ? nowNaive(PENDING_PAYMENT_TTL_MS) : null,
      cancelReason: null, cancelledBy: null, cancelledAt: null, completedAt: null,
      note: body.note?.trim() || null,
      version: 1,
      createdAt: now, updatedAt: now,
      tableNumber: null,
      items,
      statusHistory: [{ id: ++db.seq.history, orderId, fromStatus: null, status, changedBy: null, note: null, createdAt: now }],
    };
    db.orders.push(order);
    cart.status = 'Converted';
    touch(cart);
    return ok(order, null, { status: 201 });
  }))),
];
