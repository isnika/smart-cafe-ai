import type { ChangeOrderStatusInput, CreateOrderInput, ListOrdersParams, OrderDetail, Page } from '@/shared/types';
import { http } from './http';
import { guestHeaders, HEADER_IDEMPOTENCY_KEY } from './guest';

const P = '/orders-svc';

// ── Giỏ hàng QR (spec "4. Order / Giỏ hàng"; guest = X-Table-Session-Code + X-Client-Key + ?source=QR) ──
export interface QrCartOption {
  optionId: number;
  quantity: number;
  optionName?: string | null;
  unitPrice?: number | null;
  isAvailable?: boolean;
}

/** Spec chỉ cố định {id, variant_id, quantity, note, options[]}; các field snapshot bên dưới là TUỲ CHỌN (xem báo cáo, mục Giả định). */
export interface QrCartItem {
  id: number;
  variantId: number;
  quantity: number;
  note: string | null;
  options: QrCartOption[];
  productId?: number | null;
  productName?: string | null;
  productImage?: string | null;
  variantName?: string | null;
  unitPrice?: number | null;
  optionsUnitTotal?: number | null;
  lineTotal?: number | null;
  isAvailable?: boolean;
}

/** pricing◇ do server tính (FE chỉ hiển thị). */
export interface QrCartPricing {
  subTotal: number | null;
  itemCount?: number | null;
}

export interface QrCart {
  id: number;
  cartSource: 'Online' | 'QR';
  branchId: number;
  fulfillmentType: string;
  tableSessionId: number | null;
  clientKey: string | null;
  status: 'Active' | 'Converted' | 'Abandoned';
  items: QrCartItem[];
  pricing: QrCartPricing | null;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

type Loose = Record<string, unknown>;

/** Mapper: DECIMAL dạng chuỗi → number, thiếu mảng → [], nhận cả `lines` thay cho `items`. */
export function toQrCart(raw: unknown): QrCart {
  const r = (raw ?? {}) as Loose;
  const rawItems = (Array.isArray(r.items) ? r.items : Array.isArray(r.lines) ? r.lines : []) as Loose[];
  const pricing = r.pricing as Loose | null | undefined;
  return {
    id: Number(r.id),
    cartSource: (r.cartSource as QrCart['cartSource']) ?? 'QR',
    branchId: Number(r.branchId),
    fulfillmentType: String(r.fulfillmentType ?? 'Dine_In'),
    tableSessionId: num(r.tableSessionId),
    clientKey: (r.clientKey as string | null | undefined) ?? null,
    status: (r.status as QrCart['status']) ?? 'Active',
    items: rawItems.map((it) => ({
      id: Number(it.id),
      variantId: Number(it.variantId),
      quantity: Number(it.quantity),
      note: (it.note as string | null | undefined) ?? null,
      options: ((Array.isArray(it.options) ? it.options : []) as Loose[]).map((o) => ({
        optionId: Number(o.optionId),
        quantity: num(o.quantity) ?? 1,
        optionName: (o.optionName as string | null | undefined) ?? null,
        unitPrice: num(o.unitPrice ?? o.extraPrice),
        ...(o.isAvailable === undefined ? {} : { isAvailable: Boolean(o.isAvailable) }),
      })),
      productId: num(it.productId),
      productName: (it.productName as string | null | undefined) ?? null,
      productImage: (it.productImage as string | null | undefined) ?? null,
      variantName: (it.variantName as string | null | undefined) ?? null,
      unitPrice: num(it.unitPrice),
      optionsUnitTotal: num(it.optionsUnitTotal),
      lineTotal: num(it.lineTotal),
      ...(it.isAvailable === undefined ? {} : { isAvailable: Boolean(it.isAvailable) }),
    })),
    pricing: pricing
      ? { subTotal: num(pricing.subTotal ?? pricing.total), itemCount: num(pricing.itemCount) }
      : null,
  };
}

export interface QrCartCtx {
  sessionCode: string;
}
export interface QrCartItemInput {
  variantId: number;
  quantity: number;
  note?: string | null;
  options?: { optionId: number; quantity?: number }[];
}

const QR_QUERY = { source: 'QR' } as const;
/** auth:false → guest bị 401/403 không kích hoạt refresh/logout của lát 1. */
const guestOpts = (ctx: QrCartCtx) => ({ auth: false, query: QR_QUERY, headers: guestHeaders(ctx.sessionCode, { clientKey: true }) });

const cleanItem = (input: QrCartItemInput) => ({
  variantId: input.variantId,
  quantity: input.quantity,
  ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  options: (input.options ?? []).map((o) => ({ optionId: o.optionId, quantity: o.quantity ?? 1 })),
});

/** POST /carts — tạo hoặc lấy giỏ Active (200 = đã có, 201 = mới). Idempotent theo (phiên bàn, client key). */
export const ensureCart = async (ctx: QrCartCtx, branchId: number) =>
  toQrCart(
    await http.post<unknown>(
      '/carts',
      { cartSource: 'QR', branchId, fulfillmentType: 'Dine_In' },
      { ...guestOpts(ctx), snake: true },
    ),
  );
/** GET /carts/current — 404 nếu chưa có giỏ Active. */
export const getCurrentCart = async (ctx: QrCartCtx, signal?: AbortSignal) =>
  toQrCart(await http.get<unknown>('/carts/current', { ...guestOpts(ctx), signal }));
export const addCartItem = async (ctx: QrCartCtx, input: QrCartItemInput) =>
  toQrCart(await http.post<unknown>('/carts/current/items', cleanItem(input), { ...guestOpts(ctx), snake: true }));
/** PUT thay TOÀN BỘ quantity/note/options của một dòng. */
export const updateCartItem = async (ctx: QrCartCtx, itemId: number, input: QrCartItemInput) =>
  toQrCart(await http.put<unknown>(`/carts/current/items/${itemId}`, cleanItem(input), { ...guestOpts(ctx), snake: true }));
/** DELETE → 204, không có body: caller tự GET lại giỏ. */
export const removeCartItem = (ctx: QrCartCtx, itemId: number) => http.delete(`/carts/current/items/${itemId}`, guestOpts(ctx));
/** DELETE /carts/current — chuyển giỏ sang Abandoned. */
export const clearCart = (ctx: QrCartCtx) => http.delete('/carts/current', guestOpts(ctx));

// Order
/** @deprecated Legacy (mock /orders-svc, body `lines`) – Online/POS. Dine-in QR dùng createQrOrder. */
export const createOrder = (input: CreateOrderInput) => http.post<OrderDetail>(`${P}/orders`, input);
/** Page<OrderDetail>: Kanban cần items/tableNumber để vẽ card mà không phải gọi N lần. */
export const listOrders = (params: ListOrdersParams = {}, signal?: AbortSignal) =>
  http.get<Page<OrderDetail>>(`${P}/orders`, { query: params, signal });
export const getOrder = (id: number) => http.get<OrderDetail>(`${P}/orders/${id}`);

/** Lệch version → ApiError 409 VERSION_CONFLICT; sai transition → INVALID_TRANSITION. */
export const changeOrderStatus = (id: number, input: ChangeOrderStatusInput) =>
  http.patch<OrderDetail>(`${P}/orders/${id}/status`, input);

// ── Đặt hàng QR (spec: POST /orders) ──────────────────────────────────
const MONEY_KEYS = new Set([
  'subTotal', 'itemDiscountAmount', 'voucherDiscountAmount', 'deliveryFee', 'vatAmount', 'finalAmount',
  'unitPrice', 'optionsUnitTotal', 'discountAmount', 'lineTotal',
]);

function normalizeMoney(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((v) => normalizeMoney(v));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeMoney(v, k)]));
  }
  return key && MONEY_KEYS.has(key) ? (num(value) ?? 0) : value;
}

/** Mapper đơn: tiền → number; items/options/statusHistory thiếu → [] (spec gọi lịch sử là `history`). */
export function toOrderDetail(raw: unknown): OrderDetail {
  const o = normalizeMoney(raw) as OrderDetail & { history?: OrderDetail['statusHistory'] };
  const { history, ...rest } = o;
  return {
    ...rest,
    items: (o.items ?? []).map((i) => ({ ...i, options: i.options ?? [] })),
    statusHistory: o.statusHistory ?? history ?? [],
  };
}

export interface CreateQrOrderInput {
  cartId: number;
  branchId: number;
  tableSessionId: number;
  note?: string;
}

/**
 * Body {cart_id, order_source:'QR', fulfillment_type:'Dine_In', branch_id, table_session_id, note?}.
 * Idempotency-Key BẮT BUỘC (caller giữ nguyên key khi retry). KHÔNG gửi giá/tổng tiền: server snapshot + tính.
 * Bearer tuỳ chọn (gắn user để tích điểm); auth:false để 401 không kích hoạt logout.
 */
export const createQrOrder = async (
  input: CreateQrOrderInput,
  ctx: { sessionCode: string; idempotencyKey: string; accessToken?: string | null },
) =>
  toOrderDetail(
    await http.post<unknown>(
      '/orders',
      {
        cartId: input.cartId,
        orderSource: 'QR',
        fulfillmentType: 'Dine_In',
        branchId: input.branchId,
        tableSessionId: input.tableSessionId,
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      },
      {
        auth: false,
        snake: true,
        headers: {
          ...guestHeaders(ctx.sessionCode),
          [HEADER_IDEMPOTENCY_KEY]: ctx.idempotencyKey,
          ...(ctx.accessToken ? { Authorization: `Bearer ${ctx.accessToken}` } : {}),
        },
      },
    ),
  );
