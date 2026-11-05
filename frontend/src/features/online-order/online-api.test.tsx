// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLineKey } from '@/features/dine-in/cart';
import { SubmitOrderError } from '@/features/dine-in/submit';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { mockAccessToken } from '@/mocks/handlers/identity';
import { url } from '@/mocks/utils';
import { identityApi, isApiError, orderApi } from '@/shared/api';
import { latte, loginAs, resetWorld, startTableSession } from '@/test/helpers';
import { addressToDelivery, formatDeliveryAddress } from './address';
import { onlineBranchBlock } from './branch-policy';
import { syncOnlineCart } from './cart-sync';
import { VoucherBox } from './components/VoucherBox';
import { describeOnlineError } from './errors';
import { needsGateway, toPaymentMethod } from './payment';
import { useOnlineCartStore, type OnlineFulfillment } from './store';
import { placeOnlineOrder } from './submit';
import { ApiError } from '@/shared/api';
import type { Address, Branch } from '@/shared/types';

const server = setupServer(...handlers);
interface Seen {
  method: string;
  path: string;
  search: string;
  headers: Headers;
  req: Request;
}
const seen: Seen[] = [];
beforeAll(() => {
  server.listen();
  server.events.on('request:start', ({ request }) => {
    const u = new URL(request.url);
    seen.push({ method: request.method, path: u.pathname, search: u.search, headers: request.headers, req: request.clone() });
  });
});
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  resetWorld();
  seen.length = 0;
});

const ADDRESS = '12 Lê Lợi, Phường Bến Thành, Thành phố Hồ Chí Minh';
const CUSTOMER = { id: 'u-customer', fullName: 'Khách Hàng', phone: '0901234567' };
const customer = (id = CUSTOMER.id) => loginAs('Customer', { ...CUSTOMER, id });

function seedCart(type: OnlineFulfillment, quantity = 2) {
  useOnlineCartStore.setState({
    fulfillmentType: type,
    lines: [{ ...latte, key: buildLineKey(latte), quantity }],
    voucherCode: null,
    delivery:
      type === 'Delivery' ? { receiverName: 'Nguyễn Văn A', phone: '0901234567', addressLine: ADDRESS, latitude: 10.7769, longitude: 106.6951 } : null,
  });
}
const orderPosts = () => seen.filter((r) => r.method === 'POST' && r.path === '/api/orders');
const bodyOf = async (r: Seen) => (await r.req.json()) as Record<string, unknown>;
const cartCalls = () => seen.filter((r) => r.path.startsWith('/api/carts'));

describe('POST /orders Online: body + header theo spec', () => {
  it('body có order_source Online + fulfillment_type + cart_id; KHÔNG có user_id/voucher_code/address_id/giá/lines; Bearer, không header guest', async () => {
    customer();
    seedCart('Delivery');
    const order = await placeOnlineOrder({ method: 'card', note: ' Ít ngọt ', voucherCode: 'GIAM10' });

    const posts = orderPosts();
    expect(posts).toHaveLength(1);
    const body = await bodyOf(posts[0]!);
    expect(body).toMatchObject({
      order_source: 'Online',
      fulfillment_type: 'Delivery',
      branch_id: 1,
      delivery_name: 'Nguyễn Văn A',
      delivery_phone: '0901234567',
      delivery_address: ADDRESS, // MỘT chuỗi
      delivery_latitude: 10.7769,
      delivery_longitude: 106.6951,
      note: 'Ít ngọt',
    });
    expect(typeof body.cart_id).toBe('number');
    for (const forbidden of ['user_id', 'voucher_code', 'address_id', 'lines', 'items', 'sub_total', 'delivery_fee', 'vat_amount', 'final_amount', 'payment_method']) {
      expect(forbidden in body, forbidden).toBe(false);
    }

    const h = posts[0]!.headers;
    expect(h.get('authorization')).toBe(`Bearer ${mockAccessToken(CUSTOMER.id)}`);
    expect(h.get('idempotency-key')).toBeTruthy();
    expect(h.get('x-client-key')).toBeNull();
    expect(h.get('x-table-session-code')).toBeNull();
    expect(h.get('x-mock-payment-method')).toBeNull(); // chế độ thật không gửi gợi ý của mock

    // Server tự tính toàn bộ tiền; chủ đơn lấy từ JWT
    expect(order).toMatchObject({
      orderSource: 'Online', fulfillmentType: 'Delivery', userId: CUSTOMER.id, status: 'Pending', paymentStatus: 'Unpaid',
      subTotal: 90_000, deliveryFee: 15_000, finalAmount: 105_000, deliveryAddress: ADDRESS,
    });
    expect(order.voucherCode).toBeNull();
  });

  it('Pickup: không gửi delivery_*', async () => {
    customer();
    seedCart('Pickup');
    await placeOnlineOrder({ method: 'cod' });
    const body = await bodyOf(orderPosts()[0]!);
    expect(body).toMatchObject({ order_source: 'Online', fulfillment_type: 'Pickup' });
    expect(Object.keys(body).filter((k) => k.startsWith('delivery_'))).toEqual([]);
  });
});

describe('giỏ Online dùng Bearer, tách khỏi giỏ guest', () => {
  it('mọi call giỏ có Authorization Bearer + ?source=Online, không X-Client-Key / X-Table-Session-Code', async () => {
    customer();
    seedCart('Pickup');
    await syncOnlineCart({ fulfillmentType: 'Pickup', branchId: 1, lines: useOnlineCartStore.getState().lines });
    const calls = cartCalls();
    expect(calls.map((c) => `${c.method} ${c.path.replace('/api', '')}`)).toEqual(
      expect.arrayContaining(['POST /carts', 'POST /carts/current/items', 'GET /carts/current']),
    );
    for (const c of calls) {
      expect(c.headers.get('authorization')).toBe(`Bearer ${mockAccessToken(CUSTOMER.id)}`);
      expect(c.headers.get('x-client-key')).toBeNull();
      expect(c.headers.get('x-table-session-code')).toBeNull();
      if (c.path !== '/api/carts') expect(c.search).toContain('source=Online'); // POST /carts mang cart_source trong body
    }
    expect(await bodyOf(calls[0]!)).toMatchObject({ cart_source: 'Online', fulfillment_type: 'Pickup', branch_id: 1 });
  });

  it('đồng bộ: đổi số lượng → PUT (không thêm trùng), bỏ dòng → DELETE, tổng đọc từ pricing của server', async () => {
    customer();
    const key = buildLineKey(latte);
    const line = (quantity: number) => [{ ...latte, key, quantity }];
    const a = await syncOnlineCart({ fulfillmentType: 'Pickup', branchId: 1, lines: line(1) });
    expect(a.pricing?.subTotal).toBe(45_000);
    const b = await syncOnlineCart({ fulfillmentType: 'Pickup', branchId: 1, lines: line(3) });
    expect(b.id).toBe(a.id);
    expect(b.items).toHaveLength(1);
    expect(b.pricing?.subTotal).toBe(135_000);
    expect(seen.some((r) => r.method === 'PUT' && r.path.startsWith('/api/carts/current/items/'))).toBe(true);
    const c = await syncOnlineCart({ fulfillmentType: 'Pickup', branchId: 1, lines: [] });
    expect(c.items).toHaveLength(0);
    expect(seen.some((r) => r.method === 'DELETE' && r.path.startsWith('/api/carts/current/items/'))).toBe(true);
  });

  it('đổi Giao hàng ↔ Mang đi → giỏ cũ Abandoned, mở giỏ mới (một giỏ Active/user)', async () => {
    customer();
    const lines = [{ ...latte, key: buildLineKey(latte), quantity: 1 }];
    const first = await syncOnlineCart({ fulfillmentType: 'Delivery', branchId: 1, lines });
    const second = await syncOnlineCart({ fulfillmentType: 'Pickup', branchId: 1, lines });
    expect(second.id).not.toBe(first.id);
    expect(second.fulfillmentType).toBe('Pickup');
    expect(db.onlineCarts.find((c) => c.id === first.id)!.status).toBe('Abandoned');
    expect(db.onlineCarts.filter((c) => c.status === 'Active')).toHaveLength(1);
  });
});

describe('Idempotency-Key', () => {
  it('retry sau lỗi giữ NGUYÊN key và cart_id; không tạo đơn trùng', async () => {
    customer();
    seedCart('Pickup');
    server.use(http.post(url('/orders'), () => HttpResponse.json({ success: false, error: { code: 'INTERNAL', message: 'busy' } }, { status: 503 }), { once: true }));
    await expect(placeOnlineOrder({ method: 'cod' })).rejects.toBeInstanceOf(ApiError);
    expect(db.orders).toHaveLength(0);
    const order = await placeOnlineOrder({ method: 'cod' });
    const posts = orderPosts();
    expect(posts).toHaveLength(2);
    expect(posts[1]!.headers.get('idempotency-key')).toBe(posts[0]!.headers.get('idempotency-key'));
    expect((await bodyOf(posts[1]!)).cart_id).toBe((await bodyOf(posts[0]!)).cart_id);
    expect(db.orders).toHaveLength(1);
    expect(db.orders[0]!.id).toBe(order.id);
  });

  it('server đã tạo đơn nhưng response mất → retry cùng key trả lại đúng đơn đó (không đơn thứ hai)', async () => {
    customer();
    seedCart('Pickup');
    // Lần 1: để request đi qua server thật nhưng làm rớt response ở client.
    let dropped = false;
    server.use(
      http.post(url('/orders'), async ({ request }) => {
        if (!dropped) {
          dropped = true;
          // chuyển request xuống handler mock thật (handler này trả undefined từ lần 2) để đơn được tạo, rồi làm rớt response
          await fetch(request.url, { method: 'POST', headers: request.headers, body: await request.clone().text() }).catch(() => undefined);
          return HttpResponse.error();
        }
        return undefined;
      }),
    );
    await expect(placeOnlineOrder({ method: 'cod' })).rejects.toBeDefined();
    server.resetHandlers();
    await placeOnlineOrder({ method: 'cod' });
    expect(db.orders.filter((o) => o.orderSource === 'Online')).toHaveLength(1);
  });

  it('đặt đơn MỚI (kể cả cùng nội dung) sinh key mới', async () => {
    customer();
    seedCart('Pickup');
    await placeOnlineOrder({ method: 'cod' });
    seedCart('Pickup');
    await placeOnlineOrder({ method: 'cod' });
    const [p1, p2] = orderPosts();
    expect(p1!.headers.get('idempotency-key')).toBeTruthy();
    expect(p2!.headers.get('idempotency-key')).not.toBe(p1!.headers.get('idempotency-key'));
    expect(db.orders).toHaveLength(2);
  });

  it('nội dung đổi giữa hai lần gửi → key mới', async () => {
    customer();
    seedCart('Pickup');
    server.use(http.post(url('/orders'), () => HttpResponse.json({ success: false, error: { code: 'INTERNAL', message: 'busy' } }, { status: 503 }), { once: true }));
    await expect(placeOnlineOrder({ method: 'cod', note: 'a' })).rejects.toBeDefined();
    await placeOnlineOrder({ method: 'cod', note: 'b' });
    const [p1, p2] = orderPosts();
    expect(p2!.headers.get('idempotency-key')).not.toBe(p1!.headers.get('idempotency-key'));
  });
});

describe('phương thức thanh toán', () => {
  it('Visa/Master → VNPay, MoMo → Momo, COD → COD', () => {
    expect(toPaymentMethod('card')).toBe('VNPay');
    expect(toPaymentMethod('momo')).toBe('Momo');
    expect(toPaymentMethod('cod')).toBe('COD');
    expect(needsGateway('card')).toBe(true);
    expect(needsGateway('momo')).toBe(true);
    expect(needsGateway('cod')).toBe(false);
  });

  it('COD: đơn Pending/Unpaid và KHÔNG gọi POST /payments', async () => {
    customer();
    seedCart('Pickup');
    const order = await placeOnlineOrder({ method: 'cod' });
    expect(order).toMatchObject({ status: 'Pending', paymentStatus: 'Unpaid' });
    expect(seen.filter((r) => /payment/i.test(r.path))).toEqual([]);
  });

  it('VNPay/Momo ở mock: đơn Pending_Payment (có hạn), Unpaid; vẫn không gọi POST /payments (Workload 2)', async () => {
    vi.stubEnv('VITE_USE_MOCK', 'true');
    customer();
    for (const [choice, method] of [['card', 'VNPay'], ['momo', 'Momo']] as const) {
      seedCart('Pickup');
      const order = await placeOnlineOrder({ method: choice });
      expect(order).toMatchObject({ orderSource: 'Online', status: 'Pending_Payment', paymentStatus: 'Unpaid' });
      expect(order.expiresAt).toBeTruthy();
      expect(orderPosts().at(-1)!.headers.get('x-mock-payment-method')).toBe(method);
    }
    seedCart('Pickup');
    expect(await placeOnlineOrder({ method: 'cod' })).toMatchObject({ status: 'Pending' });
    expect(seen.filter((r) => /payment/i.test(r.path))).toEqual([]);
  });
});

describe('địa chỉ giao hàng', () => {
  const address = {
    label: 'Nhà', receiverName: 'Nguyễn Văn A', phone: '0901234567', province: 'TP. Hồ Chí Minh', ward: 'Phường Bến Thành',
    addressLine: '12 Lê Lợi', latitude: 10.7769, longitude: 106.6951, isDefault: false,
  };

  it('ghép delivery_address thành MỘT chuỗi từ địa chỉ đã lưu; bỏ phần rỗng', () => {
    const a = { ...address, id: 1, userId: 'u', district: null, createdAt: '', updatedAt: '' } as Address;
    expect(formatDeliveryAddress(a)).toBe('12 Lê Lợi, Phường Bến Thành, TP. Hồ Chí Minh');
    expect(formatDeliveryAddress({ ...a, district: ' Quận 1 ' })).toBe('12 Lê Lợi, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh');
    expect(addressToDelivery(a)).toEqual({
      receiverName: 'Nguyễn Văn A', phone: '0901234567', addressLine: '12 Lê Lợi, Phường Bến Thành, TP. Hồ Chí Minh', latitude: 10.7769, longitude: 106.6951,
    });
    expect('latitude' in addressToDelivery({ ...a, latitude: null })).toBe(false);
  });

  it('API đúng path/method spec: GET/POST /users/me/addresses, PATCH …/{id}/default; body snake_case; Bearer', async () => {
    customer();
    const a = await identityApi.createAddress(address);
    const b = await identityApi.createAddress({ ...address, label: 'Công ty', addressLine: '99 Nguyễn Huệ', isDefault: true });
    expect(a.isDefault).toBe(false);
    expect(b.isDefault).toBe(true);
    const created = seen.filter((r) => r.method === 'POST' && r.path === '/api/users/me/addresses');
    expect(await bodyOf(created[0]!)).toMatchObject({ receiver_name: 'Nguyễn Văn A', address_line: '12 Lê Lợi', is_default: false, province: 'TP. Hồ Chí Minh', ward: 'Phường Bến Thành' });
    expect(created[0]!.headers.get('authorization')).toBe(`Bearer ${mockAccessToken(CUSTOMER.id)}`);

    const switched = await identityApi.setDefaultAddress(a.id);
    expect(switched).toMatchObject({ id: a.id, isDefault: true });
    expect(seen.some((r) => r.method === 'PATCH' && r.path === `/api/users/me/addresses/${a.id}/default`)).toBe(true);
    const list = await identityApi.listAddresses();
    expect(list.filter((x) => x.isDefault).map((x) => x.id)).toEqual([a.id]); // bỏ mặc định cũ
    expect(list[0]!.id).toBe(a.id); // mặc định lên đầu
    expect(typeof list[0]!.latitude).toBe('number');
  });

  it('thiếu trường bắt buộc (ward/province/…) → 400 VALIDATION_ERROR', async () => {
    customer();
    const err = await identityApi.createAddress({ ...address, ward: '' }).catch((e: unknown) => e);
    expect(isApiError(err) && err.status === 400 && err.code === 'VALIDATION_ERROR').toBe(true);
  });

  it('mock cô lập theo user: khách khác không thấy / không sửa được địa chỉ của nhau; không token → 401', async () => {
    customer('u-customer');
    const mine = await identityApi.createAddress(address);
    customer('u-customer2');
    expect(await identityApi.listAddresses()).toEqual([]);
    const err = await identityApi.setDefaultAddress(mine.id).catch((e: unknown) => e);
    expect(isApiError(err) && err.status === 404).toBe(true);
    loginAs('Customer', { id: 'u-customer' });
    expect(await identityApi.listAddresses()).toHaveLength(1);
    const res = await fetch('http://localhost/api/users/me/addresses');
    expect(res.status).toBe(401);
  });
});

describe('mock phân biệt Online / Dine-in và cô lập user', () => {
  it('giỏ Online nằm ở db.onlineCarts, giỏ QR ở db.carts; Dine-in vẫn chạy song song', async () => {
    customer();
    seedCart('Pickup');
    await syncOnlineCart({ fulfillmentType: 'Pickup', branchId: 1, lines: useOnlineCartStore.getState().lines });
    expect(db.onlineCarts).toHaveLength(1);
    expect(db.carts).toHaveLength(0);

    await startTableSession();
    const { useDineInCartStore } = await import('@/features/dine-in/store');
    await useDineInCartStore.getState().addLine(latte, 1);
    expect(db.carts).toHaveLength(1);
    expect(db.carts[0]).toMatchObject({ clientKey: expect.any(String) });
    expect(db.onlineCarts).toHaveLength(1);
    // Dine-in vẫn đặt được
    const { placeDineInOrder } = await import('@/features/dine-in/submit');
    const dine = await placeDineInOrder();
    expect(dine).toMatchObject({ orderSource: 'QR', fulfillmentType: 'Dine_In' });
    const online = await placeOnlineOrder({ method: 'cod' });
    expect(online.orderSource).toBe('Online');
    expect(db.orders.map((o) => o.orderSource).sort()).toEqual(['Online', 'QR']);
  });

  it('Online bắt buộc Bearer Customer: không token → 401; Bearer không dùng được cho giỏ QR; header guest không dùng được cho giỏ Online', async () => {
    const noAuth = await fetch('http://localhost/api/carts/current?source=Online');
    expect(noAuth.status).toBe(401);
    const guestOnOnline = await fetch('http://localhost/api/carts/current?source=Online', {
      headers: { 'X-Client-Key': 'ck', 'X-Table-Session-Code': 'abc' },
    });
    expect(guestOnOnline.status).toBe(401);
    const staffRes = await fetch('http://localhost/api/carts/current?source=Online', { headers: { Authorization: `Bearer ${mockAccessToken('u-staff')}` } });
    expect(staffRes.status).toBe(403);
    const bearerOnQr = await fetch('http://localhost/api/carts/current?source=QR', { headers: { Authorization: `Bearer ${mockAccessToken(CUSTOMER.id)}` } });
    expect(bearerOnQr.status).toBe(401); // QR cần header guest
  });

  it('giỏ & đơn cô lập theo user: user 2 không thấy giỏ của user 1 và không đặt được bằng cart_id của user 1', async () => {
    customer('u-customer');
    const cart = await syncOnlineCart({ fulfillmentType: 'Pickup', branchId: 1, lines: [{ ...latte, key: buildLineKey(latte), quantity: 1 }] });
    customer('u-customer2');
    const err = await orderApi.getCurrentCart({ source: 'Online', fulfillmentType: 'Pickup' }).catch((e: unknown) => e);
    expect(isApiError(err) && err.status === 404).toBe(true);
    const steal = await orderApi.createOnlineOrder({ cartId: cart.id, fulfillmentType: 'Pickup', branchId: 1 }, { idempotencyKey: 'steal-1' }).catch((e: unknown) => e);
    expect(isApiError(steal) && steal.status === 404).toBe(true);
    expect(db.orders).toHaveLength(0);
  });

  it('thiếu Idempotency-Key → 400; fulfillment Delivery thiếu delivery_* → 400', async () => {
    customer();
    const cart = await syncOnlineCart({ fulfillmentType: 'Delivery', branchId: 1, lines: [{ ...latte, key: buildLineKey(latte), quantity: 1 }] });
    const res = await fetch('http://localhost/api/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${mockAccessToken(CUSTOMER.id)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart_id: cart.id, order_source: 'Online', fulfillment_type: 'Delivery', branch_id: 1 }),
    });
    expect(res.status).toBe(400);
    const err = await orderApi.createOnlineOrder({ cartId: cart.id, fulfillmentType: 'Delivery', branchId: 1 }, { idempotencyKey: 'k-1' }).catch((e: unknown) => e);
    expect(isApiError(err) && err.status === 400 && err.code === 'VALIDATION_ERROR').toBe(true);
  });
});

describe('chi nhánh không nhận Online bị chặn ở FE', () => {
  const branch: Pick<Branch, 'status' | 'acceptsOnlineOrders' | 'deliveryRadiusKm' | 'latitude' | 'longitude'> = {
    status: 'Active', acceptsOnlineOrders: true, deliveryRadiusKm: 5, latitude: 10.7769, longitude: 106.6951,
  };

  it('onlineBranchBlock: không nhận Online / ngừng hoạt động / không giao hàng / ngoài bán kính', () => {
    expect(onlineBranchBlock(branch, { fulfillmentType: 'Delivery' })).toBeNull();
    expect(onlineBranchBlock({ ...branch, acceptsOnlineOrders: false }, { fulfillmentType: 'Pickup' })).toMatch(/không nhận đơn Online/);
    expect(onlineBranchBlock({ ...branch, status: 'Inactive' }, { fulfillmentType: 'Pickup' })).toMatch(/không hoạt động/);
    expect(onlineBranchBlock({ ...branch, deliveryRadiusKm: null }, { fulfillmentType: 'Delivery' })).toMatch(/không hỗ trợ giao hàng/);
    expect(onlineBranchBlock({ ...branch, deliveryRadiusKm: null }, { fulfillmentType: 'Pickup' })).toBeNull(); // Pickup không cần bán kính
    expect(onlineBranchBlock(branch, { fulfillmentType: 'Delivery', destination: { latitude: 10.78, longitude: 106.70 } })).toBeNull();
    expect(onlineBranchBlock(branch, { fulfillmentType: 'Delivery', destination: { latitude: 10.95, longitude: 106.95 } })).toMatch(/ngoài phạm vi/);
  });

  it('placeOnlineOrder: chi nhánh accepts_online_orders=false → chặn trước khi gọi giỏ/đơn', async () => {
    customer();
    seedCart('Pickup');
    server.use(
      http.get(url('/branches/:id'), () =>
        HttpResponse.json({ success: true, data: { id: 1, code: 'B1', name: 'CN', address: 'x', status: 'Active', timezone: 'Asia/Ho_Chi_Minh', accepts_online_orders: false, delivery_radius_km: 5, delivery_fee: 15000 } }),
      ),
    );
    const err = await placeOnlineOrder({ method: 'cod' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SubmitOrderError);
    expect((err as SubmitOrderError).code).toBe('BRANCH_UNAVAILABLE');
    expect(cartCalls()).toHaveLength(0);
    expect(orderPosts()).toHaveLength(0);
    expect(useOnlineCartStore.getState().lines).toHaveLength(1); // giữ giỏ
  });
});

describe('lỗi nghiệp vụ 409/422', () => {
  const err = (status: number, code: string, message = 'x') => new ApiError(status, { code, message });

  it('map theo mã, không dùng lỗi chung', () => {
    expect(describeOnlineError(err(422, 'OUT_OF_STOCK'), { itemName: 'Matcha' }).message).toContain('Matcha');
    expect(describeOnlineError(err(422, 'BUSINESS_RULE_VIOLATION', 'Chi nhánh đã đóng cửa')).message).toBe('Chi nhánh đã đóng cửa');
    expect(describeOnlineError(err(409, 'INVALID_STATE_TRANSITION')).message).toMatch(/giỏ hàng đã được đặt/i);
    expect(describeOnlineError(err(409, 'IDEMPOTENCY_CONFLICT')).message).toMatch(/Giỏ hàng đã thay đổi/);
    expect(describeOnlineError(err(409, 'VERSION_CONFLICT')).message).toMatch(/cập nhật/);
    expect(describeOnlineError(err(401, 'UNAUTHORIZED')).message).toMatch(/đăng nhập/);
    expect(describeOnlineError(err(401, 'UNAUTHORIZED')).message).not.toMatch(/QR|bàn/);
    expect(describeOnlineError(err(503, 'X')).retryable).toBe(true);
  });

  it('món hết hàng (422 OUT_OF_STOCK) khi đồng bộ giỏ → ApiError 422, không tạo đơn', async () => {
    customer();
    useOnlineCartStore.setState({
      fulfillmentType: 'Pickup',
      lines: [{ ...latte, variantId: 41, productName: 'Matcha', options: [], key: 'v41', quantity: 1 }],
    });
    const e = await placeOnlineOrder({ method: 'cod' }).catch((x: unknown) => x);
    expect(isApiError(e) && e.status === 422 && e.code === 'OUT_OF_STOCK').toBe(true);
    expect(orderPosts()).toHaveLength(0);
    expect(useOnlineCartStore.getState().lines).toHaveLength(1);
  });

  it('IDEMPOTENCY_CONFLICT từ server → lần gửi sau dùng key mới', async () => {
    customer();
    seedCart('Pickup');
    server.use(
      http.post(url('/orders'), () => HttpResponse.json({ success: false, error: { code: 'IDEMPOTENCY_CONFLICT', message: 'dup' } }, { status: 409 }), { once: true }),
    );
    await expect(placeOnlineOrder({ method: 'cod' })).rejects.toBeInstanceOf(ApiError);
    await placeOnlineOrder({ method: 'cod' });
    const [p1, p2] = orderPosts();
    expect(p2!.headers.get('idempotency-key')).not.toBe(p1!.headers.get('idempotency-key'));
  });
});

describe('voucher (Engagement, ngoài phạm vi)', () => {
  it('chế độ thật: ô nhập + nút bị vô hiệu hoá kèm chú thích', () => {
    render(<VoucherBox appliedCode={null} message={null} />);
    expect((screen.getByPlaceholderText('Nhập mã giảm giá') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Áp dụng' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/sẽ sớm được hỗ trợ/)).toBeTruthy();
  });

  it('mock: giữ hành vi hiện có (ô nhập bật)', () => {
    vi.stubEnv('VITE_USE_MOCK', 'true');
    render(<VoucherBox appliedCode={null} message={null} />);
    expect((screen.getByPlaceholderText('Nhập mã giảm giá') as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByText(/sẽ sớm được hỗ trợ/)).toBeNull();
  });

  it('mock: voucher_code được gửi và áp dụng; chế độ thật: không gửi dù có mã trong state', async () => {
    customer();
    vi.stubEnv('VITE_USE_MOCK', 'true');
    seedCart('Pickup');
    const withVoucher = await placeOnlineOrder({ method: 'cod', voucherCode: 'GIAM10' });
    expect(withVoucher).toMatchObject({ voucherCode: 'GIAM10', voucherDiscountAmount: 9_000, finalAmount: 81_000 });
    vi.unstubAllEnvs();
    seedCart('Pickup');
    await placeOnlineOrder({ method: 'cod', voucherCode: 'GIAM10' });
    expect('voucher_code' in (await bodyOf(orderPosts().at(-1)!))).toBe(false);
  });
});
