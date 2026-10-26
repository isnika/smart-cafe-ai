import { http, HttpResponse } from 'msw';
import { canTransition, requiresStatusNote } from '@/shared/lib';
import type {
  ChangeOrderStatusInput, CreateOrderInput, DeliveryInfoInput, OrderDetail, OrderItemDetail, OrderLineInput,
  OrderStatus, PayAt,
} from '@/shared/types';
import { BRANCH_ID, db, findVariant, isSellable, nowNaive } from '../db';
import { DELIVERY_FEE } from '../fixtures';
import { fail, guarded, readJson, requireAuth, url } from '../utils';
import { evaluateVoucher } from './voucher';

/** Mirror CHECK constraint trong DB: QR→Dine_In, POS→Dine_In|Pickup, Online→Delivery|Pickup. */
const ALLOWED_COMBOS: Record<string, string[]> = {
  QR: ['Dine_In'],
  POS: ['Dine_In', 'Pickup'],
  Online: ['Delivery', 'Pickup'],
};
const PENDING_PAYMENT_TTL_MS = 15 * 60 * 1000;

type LooseInput = Partial<{ userId: string; createdBy: string; tableSessionId: number; payAt: PayAt } & DeliveryInfoInput>;

export function buildItem(line: OrderLineInput, branchId: number, orderId: number): OrderItemDetail {
  if (!Number.isInteger(line.quantity) || line.quantity < 1) fail(400, 'VALIDATION_ERROR', 'quantity phải là số nguyên ≥ 1');

  const found = findVariant(line.variantId);
  if (!found) fail(400, 'VARIANT_NOT_FOUND', `Không tìm thấy variant ${line.variantId}`);
  const { seed, variant } = found;
  if (!isSellable(branchId, seed, variant)) {
    fail(409, 'ITEM_UNAVAILABLE', `${seed.product.name} (${variant.variantName}) hiện đã hết hàng`);
  }

  // Option: kiểm tra tồn tại + ràng buộc từng group (required / maxSelect).
  const picked = (line.options ?? []).map((sel) => {
    const group = seed.groups.find((g) => g.options.some((o) => o.id === sel.optionId));
    const opt = group?.options.find((o) => o.id === sel.optionId);
    if (!group || !opt) fail(400, 'OPTION_NOT_FOUND', `Option ${sel.optionId} không thuộc ${seed.product.name}`);
    return { group, opt, quantity: sel.quantity ?? 1 };
  });
  for (const g of seed.groups) {
    const count = picked.filter((p) => p.group.id === g.id).length;
    if (count < Math.max(g.minSelect, g.isRequired ? 1 : 0)) fail(422, 'OPTION_REQUIRED', `Vui lòng chọn "${g.name}" cho ${seed.product.name}`);
    if (count > g.maxSelect) fail(400, 'OPTION_LIMIT', `"${g.name}" chỉ được chọn tối đa ${g.maxSelect}`);
  }

  const optionsUnitTotal = picked.reduce((sum, p) => sum + p.opt.extraPrice * p.quantity, 0);
  // Reward: giảm đúng giá base 1 ly (không check số tem – chưa mock loyalty).
  if (line.isRewardItem && line.quantity !== 1) fail(400, 'VALIDATION_ERROR', 'Món thưởng chỉ được quantity = 1');
  const discountAmount = line.isRewardItem ? variant.price : 0;

  const itemId = ++db.seq.item;
  return {
    id: itemId, orderId,
    productId: seed.product.id, variantId: variant.id,
    productName: seed.product.name, variantName: variant.variantName,
    quantity: line.quantity, unitPrice: variant.price, optionsUnitTotal, discountAmount,
    isRewardItem: !!line.isRewardItem,
    lineTotal: line.quantity * (variant.price + optionsUnitTotal) - discountAmount,
    note: line.note ?? null,
    options: picked.map((p) => ({
      id: ++db.seq.option, orderItemId: itemId, optionId: p.opt.id,
      optionName: p.opt.optionName, quantity: p.quantity, unitPrice: p.opt.extraPrice,
    })),
  };
}

export const orderHandlers = [
  // POST /orders-svc/orders
  http.post(
    url('/orders-svc/orders'),
    guarded(async ({ request }) => {
      const input = await readJson<CreateOrderInput>(request);
      const r = input as LooseInput;

      // Idempotency: cùng key → trả lại đơn cũ (200), không tạo đơn mới.
      if (input.idempotencyKey) {
        const dup = db.orders.find((o) => o.idempotencyKey === input.idempotencyKey);
        if (dup) return HttpResponse.json(dup, { status: 200 });
      }

      // Tổ hợp + trường bắt buộc (mirror CHECK của DB).
      if (!ALLOWED_COMBOS[input.orderSource]?.includes(input.fulfillmentType)) {
        fail(400, 'INVALID_ORDER_COMBINATION', `${input.orderSource} không thể là ${input.fulfillmentType}`);
      }
      if (input.orderSource === 'Online' && !r.userId) fail(400, 'VALIDATION_ERROR', 'Đơn Online bắt buộc userId');
      if (input.orderSource === 'POS' && !r.createdBy) fail(400, 'VALIDATION_ERROR', 'Đơn POS bắt buộc createdBy');
      if (input.fulfillmentType === 'Delivery' && !(r.deliveryName && r.deliveryPhone && r.deliveryAddress)) {
        fail(400, 'VALIDATION_ERROR', 'Đơn giao hàng bắt buộc deliveryName/Phone/Address');
      }
      if (input.branchId !== BRANCH_ID) fail(404, 'BRANCH_NOT_FOUND', `Không có chi nhánh ${input.branchId}`);
      if (!input.lines?.length) fail(400, 'VALIDATION_ERROR', 'Đơn phải có ít nhất 1 món');
      if (input.lines.filter((l) => l.isRewardItem).length > 1) fail(400, 'VALIDATION_ERROR', 'Tối đa 1 món thưởng mỗi đơn');

      // Dine_In: phải có session Active và đúng chi nhánh.
      let tableNumber: string | null = null;
      let tableSessionId: number | null = null;
      if (input.fulfillmentType === 'Dine_In') {
        const session = db.sessions.find((s) => s.id === r.tableSessionId);
        if (!session) fail(404, 'SESSION_NOT_FOUND', 'Không tìm thấy phiên bàn');
        if (session.status !== 'Active') fail(409, 'SESSION_NOT_ACTIVE', 'Phiên bàn đã đóng');
        const table = db.tables.find((t) => t.id === session.tableId);
        if (table?.branchId !== input.branchId) fail(400, 'VALIDATION_ERROR', 'Bàn không thuộc chi nhánh này');
        tableSessionId = session.id;
        tableNumber = table.tableNumber;
      }

      // Tiền: subTotal = gross trước giảm giá; finalAmount = sub - itemDiscount - voucher + deliveryFee.
      const orderId = db.seq.order + 1;
      const items = input.lines.map((line) => buildItem(line, input.branchId, orderId));
      const subTotal = items.reduce((s, i) => s + i.quantity * (i.unitPrice + i.optionsUnitTotal), 0);
      const itemDiscountAmount = items.reduce((s, i) => s + i.discountAmount, 0);
      const voucherDiscountAmount = input.voucherCode
        ? (() => {
            const v = evaluateVoucher(input.voucherCode, subTotal - itemDiscountAmount);
            if (!v.valid) fail(400, 'VOUCHER_INVALID', v.message ?? 'Mã giảm giá không hợp lệ');
            return v.discountAmount;
          })()
        : 0;
      const deliveryFee = input.fulfillmentType === 'Delivery' ? DELIVERY_FEE : 0;
      const finalAmount = subTotal - itemDiscountAmount - voucherDiscountAmount + deliveryFee;

      // Online + payAt 'online' → chờ thanh toán (có hạn). Mặc định (không gửi payAt) coi như 'counter'.
      const awaitingPayment = input.orderSource === 'Online' && r.payAt === 'online';
      const status: OrderStatus = awaitingPayment ? 'Pending_Payment' : 'Pending';
      const now = nowNaive();

      db.seq.order = orderId;
      const order: OrderDetail = {
        id: orderId,
        orderCode: `SC${String(orderId).padStart(5, '0')}`,
        idempotencyKey: input.idempotencyKey ?? null,
        userId: r.userId ?? null,
        createdBy: r.createdBy ?? null,
        branchId: input.branchId,
        tableSessionId,
        orderSource: input.orderSource,
        fulfillmentType: input.fulfillmentType,
        deliveryName: r.deliveryName ?? null,
        deliveryPhone: r.deliveryPhone ?? null,
        deliveryAddress: r.deliveryAddress ?? null,
        deliveryLatitude: r.deliveryLatitude ?? null,
        deliveryLongitude: r.deliveryLongitude ?? null,
        subTotal, itemDiscountAmount,
        voucherCode: voucherDiscountAmount > 0 ? input.voucherCode!.toUpperCase() : null,
        voucherDiscountAmount, deliveryFee,
        vatAmount: Math.round((finalAmount * 8) / 108), // VAT 8% đã nằm trong giá
        finalAmount,
        status,
        paymentStatus: 'Unpaid',
        expiresAt: awaitingPayment ? nowNaive(PENDING_PAYMENT_TTL_MS) : null,
        cancelReason: null, cancelledBy: null, cancelledAt: null, completedAt: null,
        note: input.note ?? null,
        version: 1,
        createdAt: now, updatedAt: now,
        tableNumber,
        items,
        statusHistory: [{ id: ++db.seq.history, orderId, fromStatus: null, status, changedBy: null, note: null, createdAt: now }],
      };
      db.orders.push(order);
      return HttpResponse.json(order, { status: 201 });
    }),
  ),

  // PATCH /orders-svc/orders/:id/status  { to, version, note? }
  http.patch(
    url('/orders-svc/orders/:id/status'),
    guarded(async ({ request, params }) => {
      requireAuth(request);
      const body = await readJson<Partial<ChangeOrderStatusInput>>(request);
      const { to, version, note } = body;

      if (!to || !Number.isInteger(version)) fail(400, 'VALIDATION_ERROR', 'Cần `to` và `version` (số nguyên)');
      if (requiresStatusNote(to) && !note?.trim()) fail(400, 'VALIDATION_ERROR', `Chuyển sang ${to} bắt buộc có lý do (note)`);

      const order = db.orders.find((o) => o.id === Number(params.id));
      if (!order) fail(404, 'ORDER_NOT_FOUND', `Không tìm thấy đơn ${String(params.id)}`);

      // Thứ tự kiểm tra: version trước, transition sau. Client đang nhìn bản cũ thì
      // "transition có hợp lệ không" chưa có nghĩa, phải tải lại đơn trước đã.
      if (version !== order.version) {
        fail(409, 'VERSION_CONFLICT', `Đơn đã được cập nhật bởi người khác (version hiện tại ${order.version}, bạn gửi ${version})`);
      }
      if (!canTransition(order.fulfillmentType, order.status, to)) {
        fail(409, 'INVALID_TRANSITION', `Không thể chuyển ${order.fulfillmentType} từ ${order.status} sang ${to}`);
      }

      const now = nowNaive();
      const from = order.status;
      order.status = to;
      order.version += 1;
      order.updatedAt = now;
      if (to === 'Cancelled' || to === 'Rejected') {
        order.cancelReason = note!.trim();
        order.cancelledAt = now;
      }
      if (to === 'Completed') order.completedAt = now;
      order.statusHistory.push({ id: ++db.seq.history, orderId: order.id, fromStatus: from, status: to, changedBy: null, note: note?.trim() ?? null, createdAt: now });

      return HttpResponse.json(order);
    }),
  ),
];