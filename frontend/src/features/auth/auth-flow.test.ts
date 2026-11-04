import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureHttp, identityApi, isApiError } from '@/shared/api';
import { handlers } from '@/mocks/handlers';
import { MOCK_OTP, resetAuthFlowMock } from '@/mocks/handlers/auth-flow';
import { resetAuthMock } from '@/mocks/handlers/identity';
import { mockConfig } from '@/mocks/utils';
import { authFlowApi } from './api';
import { useAuthStore } from './store';

const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => {
  mockConfig.latencyMs = 0;
  resetAuthMock();
  resetAuthFlowMock();
  useAuthStore.getState().clear();
  configureHttp({
    getToken: () => useAuthStore.getState().accessToken,
    onUnauthorized: () => useAuthStore.getState().clear(),
    refresh: () => useAuthStore.getState().refresh(),
  });
});

const NEW = { fullName: 'Người Mới', email: 'moi@smartcafe.vn', phone: '0911222333', password: 'matkhau1' };

describe('đăng ký → xác minh OTP → login', () => {
  it('verify không trả token → FE tự gọi /auth/login và trả phiên', async () => {
    await authFlowApi.register(NEW);
    await expect(identityApi.login({ identifier: NEW.email, password: NEW.password })).rejects.toMatchObject({ code: 'ACCOUNT_UNVERIFIED' });

    const session = await authFlowApi.verifyRegistration(NEW.email, MOCK_OTP);
    expect(session.user.email).toBe(NEW.email);
    expect(session.roleName).toBe('Customer');
    expect(session.accessToken).toBeTruthy();

    useAuthStore.getState().applySession(session);
    expect((await identityApi.getMe()).fullName).toBe(NEW.fullName);
  });

  it('OTP sai → lỗi OTP_INVALID, chưa đăng nhập được', async () => {
    await authFlowApi.register(NEW);
    const e = await authFlowApi.verifyRegistration(NEW.email, '000000').catch((x: unknown) => x);
    expect(isApiError(e) && e.code).toBe('OTP_INVALID');
  });

  it('không còn thông tin đăng nhập tạm (vd: reload) → LOGIN_REQUIRED, nhưng tài khoản đã được xác minh', async () => {
    await authFlowApi.resendRegistrationOtp('unverified@smartcafe.vn');
    const e = await authFlowApi.verifyRegistration('unverified@smartcafe.vn', MOCK_OTP).catch((x: unknown) => x);
    expect(isApiError(e) && e.code).toBe('LOGIN_REQUIRED');
    const s = await identityApi.login({ identifier: 'unverified@smartcafe.vn', password: '123456' });
    expect(s.user.status).toBe('Active');
  });

  it('đăng nhập tài khoản chưa xác minh: holdCredentials + resend + verify → auto-login', async () => {
    authFlowApi.holdCredentials('unverified@smartcafe.vn', '123456');
    await authFlowApi.resendRegistrationOtp('unverified@smartcafe.vn');
    const s = await authFlowApi.verifyRegistration('unverified@smartcafe.vn', MOCK_OTP);
    expect(s.user.email).toBe('unverified@smartcafe.vn');
  });
});

describe('quên mật khẩu', () => {
  it('forgot → (giữ OTP) → reset-password {target, otp_code, new_password} → đăng nhập bằng mật khẩu mới', async () => {
    await authFlowApi.requestOtp('customer@smartcafe.vn');
    const { resetToken } = await authFlowApi.verifyOtp('customer@smartcafe.vn', MOCK_OTP);
    await authFlowApi.resetPassword(resetToken, 'matkhaumoi');
    const s = await identityApi.login({ identifier: 'customer@smartcafe.vn', password: 'matkhaumoi' });
    expect(s.roleName).toBe('Customer');
  });

  it('OTP sai bị server từ chối ở bước đặt mật khẩu (không có bước verify riêng)', async () => {
    await authFlowApi.requestOtp('customer@smartcafe.vn');
    const { resetToken } = await authFlowApi.verifyOtp('customer@smartcafe.vn', '999999');
    expect(await authFlowApi.resetPassword(resetToken, 'matkhaumoi').catch((x: unknown) => x)).toMatchObject({ code: 'OTP_INVALID' });
    // mật khẩu cũ vẫn dùng được
    expect((await identityApi.login({ identifier: 'customer@smartcafe.vn', password: '123456' })).roleName).toBe('Customer');
  });
});

describe('phiên: me, refresh xoay token, logout', () => {
  it('login → /users/me; 401 do token thu hồi → refresh thất bại → clear()', async () => {
    useAuthStore.getState().applySession(await identityApi.login({ identifier: 'customer@smartcafe.vn', password: '123456' }));
    expect((await identityApi.getMe()).email).toBe('customer@smartcafe.vn');

    const { revokeAllTokens } = await import('@/mocks/handlers/identity');
    revokeAllTokens(); // access + refresh cũ đều vô hiệu
    await identityApi.getMe().catch(() => undefined);
    expect(useAuthStore.getState().status).toBe('anonymous');
  });

  it('refresh xoay: dùng lại refresh token cũ bị từ chối; store giữ cặp mới', async () => {
    useAuthStore.getState().applySession(await identityApi.login({ identifier: 'customer@smartcafe.vn', password: '123456' }));
    const oldRt = useAuthStore.getState().refreshToken!;
    expect(await useAuthStore.getState().refresh()).toBe(true);
    const s = useAuthStore.getState();
    expect(s.refreshToken).not.toBe(oldRt);
    expect(await identityApi.refresh(oldRt).catch((x: unknown) => x)).toMatchObject({ status: 401 });
    expect((await identityApi.getMe()).email).toBe('customer@smartcafe.vn');
  });

  it('logout → 204', async () => {
    useAuthStore.getState().applySession(await identityApi.login({ identifier: 'staff@smartcafe.vn', password: '123456' }));
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().status).toBe('anonymous');
  });
});
