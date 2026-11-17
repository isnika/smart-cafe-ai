// @vitest-environment jsdom
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { envelopeError, url } from '@/mocks/utils';
import { isApiError, loadSessionCode, storeApi } from '@/shared/api';
import { resetGuestMemory } from '@/shared/api/guest';
import { loginAs, resetWorld, TABLE_CODE } from '@/test/helpers';
import { useAuthStore } from '@/features/auth/store';
import { describeSessionError, openDineInSession } from './session';

const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

let calls: string[] = [];
beforeEach(() => {
  resetWorld();
  server.events.removeAllListeners();
  calls = [];
  server.events.on('request:start', ({ request }) => calls.push(`${request.method} ${new URL(request.url).pathname}`));
});

describe('P1 mở phiên bàn', () => {
  it('lần đầu: GET /qr → POST /qr/{code}/sessions (201), lưu session_code theo tableCode, ghép bàn/chi nhánh', async () => {
    const s = await openDineInSession(TABLE_CODE);
    expect(calls).toEqual([`GET /api/qr/${TABLE_CODE}`, `POST /api/qr/${TABLE_CODE}/sessions`]);
    expect(s).toMatchObject({ status: 'Active', tableNumber: '01', branchId: 1, tableCode: TABLE_CODE });
    expect(loadSessionCode(TABLE_CODE)).toBe(s.sessionCode);
    expect(db.sessions).toHaveLength(1);
  });

  it('reload: có session_code đã lưu → GET /table-sessions/current, KHÔNG tạo phiên mới', async () => {
    const first = await openDineInSession(TABLE_CODE);
    calls.length = 0;
    const again = await openDineInSession(TABLE_CODE);
    expect(again.id).toBe(first.id);
    expect(calls).toEqual([`GET /api/qr/${TABLE_CODE}`, 'GET /api/table-sessions/current']);
    expect(db.sessions).toHaveLength(1);
  });

  it('mã đã lưu hết hiệu lực (403/404) → xoá và nối lại phiên mở của bàn (200)', async () => {
    const first = await openDineInSession(TABLE_CODE);
    localStorage.setItem(`smartcafe.dinein.session.${TABLE_CODE}`, 'ma-cu');
    const again = await openDineInSession(TABLE_CODE);
    expect(again.id).toBe(first.id);
    expect(loadSessionCode(TABLE_CODE)).toBe(first.sessionCode);
  });

  it('lỗi mạng khi nối lại → ném lỗi (không tạo phiên mới, không xoá mã)', async () => {
    const first = await openDineInSession(TABLE_CODE);
    server.use(http.get(url('/table-sessions/current'), () => envelopeError(503, 'X', 'busy'), { once: true }));
    await expect(openDineInSession(TABLE_CODE)).rejects.toMatchObject({ status: 503 });
    expect(loadSessionCode(TABLE_CODE)).toBe(first.sessionCode);
    expect(db.sessions).toHaveLength(1);
  });

  it('phiên đã Completed → bỏ mã cũ và mở phiên mới', async () => {
    const first = await openDineInSession(TABLE_CODE);
    db.sessions[0]!.status = 'Completed';
    const again = await openDineInSession(TABLE_CODE);
    expect(again.id).not.toBe(first.id);
    expect(again.status).toBe('Active');
  });

  it('bàn không hoạt động → TABLE_INACTIVE (thông báo thân thiện, không retry)', async () => {
    const err = await openDineInSession('QR-B1-T06').then(() => null, (e: unknown) => e);
    expect(isApiError(err) && err.code).toBe('TABLE_INACTIVE');
    expect(describeSessionError(err)).toMatchObject({ title: 'Bàn tạm ngưng phục vụ', retryable: false });
    expect(db.sessions).toHaveLength(0);
  });

  it('mã QR sai → 404 thân thiện; bàn đang Payment_Pending → 409 thân thiện, không crash', async () => {
    const notFound = await openDineInSession('QR-XXX').then(() => null, (e: unknown) => e);
    expect(describeSessionError(notFound)).toMatchObject({ title: 'Không nhận diện được mã bàn', retryable: false });

    await openDineInSession(TABLE_CODE);
    db.sessions[0]!.status = 'Payment_Pending';
    localStorage.clear(); // thiết bị khác quét cùng bàn
    resetGuestMemory();
    const conflict = await openDineInSession(TABLE_CODE).then(() => null, (e: unknown) => e);
    expect(isApiError(conflict) && conflict.status).toBe(409);
    expect(describeSessionError(conflict)).toMatchObject({ title: 'Bàn đang được sử dụng', retryable: false });
  });

  it('thiết bị đang giữ phiên Payment_Pending vẫn nối lại được (UI hiện màn chờ thanh toán)', async () => {
    await openDineInSession(TABLE_CODE);
    db.sessions[0]!.status = 'Payment_Pending';
    expect((await openDineInSession(TABLE_CODE)).status).toBe('Payment_Pending');
  });

  it('lỗi 5xx / mạng → cho phép thử lại', () => {
    expect(describeSessionError(new Error('x')).retryable).toBe(true);
  });

  it('Bearer tuỳ chọn: khách đăng nhập → phiên gắn customer_id; 401 ở call guest KHÔNG logout', async () => {
    loginAs('Customer', { id: 'u-1' });
    useAuthStore.setState({ accessToken: 'abc' });
    let auth: string | null = null;
    server.use(
      http.post(url('/qr/:qr/sessions'), ({ request }) => {
        auth = request.headers.get('Authorization');
        return envelopeError(401, 'UNAUTHORIZED', 'token hết hạn');
      }, { once: true }),
    );
    await expect(openDineInSession(TABLE_CODE)).rejects.toMatchObject({ status: 401 });
    expect(auth).toBe('Bearer abc');
    expect(useAuthStore.getState().status).toBe('authenticated');
  });
});

describe('P4 request-payment', () => {
  it('Active → Payment_Pending; gọi lần hai (sai state) → 409', async () => {
    const s = await openDineInSession(TABLE_CODE);
    const res = await storeApi.requestPayment(s.sessionCode);
    expect(res).toEqual({ id: s.id, status: 'Payment_Pending' });
    expect(db.sessions[0]!.status).toBe('Payment_Pending');
    await expect(storeApi.requestPayment(s.sessionCode)).rejects.toMatchObject({ status: 409, code: 'INVALID_STATE_TRANSITION' });
  });

  it('thiếu / sai mã phiên → 401 / 403', async () => {
    await openDineInSession(TABLE_CODE);
    await expect(storeApi.requestPayment('')).rejects.toMatchObject({ status: 401 });
    await expect(storeApi.requestPayment('sai')).rejects.toMatchObject({ status: 403 });
  });

  it('GET /branches và /branches/{id}: chuẩn hoá tiền về number; 404 khi sai id', async () => {
    const list = await storeApi.listBranches();
    expect(list[0]).toMatchObject({ id: 1, deliveryFee: 15_000 });
    expect((await storeApi.getBranch(1)).deliveryFee).toBe(15_000);
    await expect(storeApi.getBranch(99)).rejects.toMatchObject({ status: 404 });
    server.use(http.get(url('/branches/:id'), () => Response.json({ success: true, data: { id: 1, delivery_fee: '20000', delivery_radius_km: '5.50', name: 'B', code: 'B1', address: 'a', timezone: 'x', status: 'Active' } })));
    expect(await storeApi.getBranch(1)).toMatchObject({ deliveryFee: 20_000, deliveryRadiusKm: 5.5 });
  });
});
