import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureHttp, identityApi, isApiError } from '@/shared/api';
import { handlers } from '@/mocks/handlers';
import { MOCK_OTP, resetAuthFlowMock } from '@/mocks/handlers/auth-flow';
import { resetAuthMock } from '@/mocks/handlers/identity';
import { mockConfig } from '@/mocks/utils';
import { authFlowApi } from './api';
import { useAuthStore } from './store';
import { homeAfterLogin } from '@/app/routes';
import { url } from '@/mocks/utils';

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

const NEW = { fullName: 'Người Mới', email: 'moi@smartcafe.vn', phone: '0911222333', password: 'matkhau12' };

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
    await authFlowApi.resetPassword(resetToken, 'matkhaumoi1');
    const s = await identityApi.login({ identifier: 'customer@smartcafe.vn', password: 'matkhaumoi1' });
    expect(s.roleName).toBe('Customer');
  });

  it('OTP sai bị server từ chối ở bước đặt mật khẩu (không có bước verify riêng)', async () => {
    await authFlowApi.requestOtp('customer@smartcafe.vn');
    const { resetToken } = await authFlowApi.verifyOtp('customer@smartcafe.vn', '999999');
    expect(await authFlowApi.resetPassword(resetToken, 'matkhaumoi1').catch((x: unknown) => x)).toMatchObject({ code: 'OTP_INVALID' });
    // mật khẩu cũ vẫn dùng được
    expect((await identityApi.login({ identifier: 'customer@smartcafe.vn', password: '123456' })).roleName).toBe('Customer');
  });
});

describe('phiên: me, refresh xoay token, logout', () => {
  it('đăng nhập tài khoản Admin mock và điều hướng về trang quản trị hợp lệ', async () => {
    const session = await identityApi.login({ identifier: 'admin@smartcafe.vn', password: '123456' });
    useAuthStore.getState().applySession(session);
    expect(session.roleName).toBe('Admin');
    expect(homeAfterLogin(session.roleName, undefined)).toBe('/admin');
    expect(homeAfterLogin(session.roleName, '/staff')).toBe('/admin');
    expect(homeAfterLogin(session.roleName, '/admin/branches')).toBe('/admin/branches');
  });

  it('map role_name ở user theo response Identity API cho login và /users/me', async () => {
    const user = {
      id: 'admin-api', full_name: 'Admin API', email: 'admin@smartcafe.vn', phone: null,
      role_id: 4, role_name: 'Admin', status: 'Active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    };
    server.use(
      http.post(url('/auth/login'), () => HttpResponse.json({ success: true, data: { access_token: 'access', refresh_token: 'refresh', user } })),
      http.get(url('/users/me'), () => HttpResponse.json({ success: true, data: user })),
    );
    const session = await identityApi.login({ identifier: 'admin@smartcafe.vn', password: 'password123' });
    expect(session.roleName).toBe('Admin');
    expect(session.user.roleName).toBe('Admin');
    useAuthStore.getState().applySession(session);
    const me = await identityApi.getMe();
    expect(me.roleName).toBe('Admin');
  });

  it('unwrap ApiResponse<AuthResponse> đúng DTO Identity backend và map role ADMIN', async () => {
    server.use(http.post(url('/auth/login'), () => HttpResponse.json({
      success: true,
      data: {
        access_token: 'api-admin-token',
        refresh_token: 'api-admin-refresh',
        token_type: 'Bearer',
        expires_in: 3600,
        user: {
          id: 'api-admin', full_name: 'Quản trị viên', email: 'admin@smartcafe.vn', phone: null,
          role_id: 4, role_name: 'ADMIN', status: 'Active',
          email_verified_at: null, phone_verified_at: null, last_login_at: null,
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      },
      meta: null,
      trace_id: 'trace-admin-login',
    })));

    const session = await identityApi.login({ identifier: 'admin@smartcafe.vn', password: '123456' });
    expect(session.accessToken).toBe('api-admin-token');
    expect(session.roleName).toBe('Admin');
    expect(session.user.roleName).toBe('Admin');
  });

  it('map đúng tên role theo seed database: ROLE_ADMIN', async () => {
    server.use(http.post(url('/auth/login'), () => HttpResponse.json({
      success: true,
      data: {
        access_token: 'opaque-access-token', refresh_token: 'refresh',
        user: { id: 'usr_admin_001', full_name: 'Nguyễn Quản Trị', email: 'admin@smartcafe.vn', role_id: 1, role_name: 'ROLE_ADMIN', status: 'Active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      },
      meta: null,
      trace_id: 'trace-role-admin',
    })));
    const session = await identityApi.login({ identifier: 'admin@smartcafe.vn', password: '123456' });
    expect(session.roleName).toBe('Admin');
    expect(session.user.roleName).toBe('Admin');
  });

  it('lấy quyền Admin từ access token nếu UserResponse không có role_name', async () => {
    const payload = btoa(JSON.stringify({ sub: 'admin-api', role: 'Admin' })).replace(/=/g, '');
    server.use(http.post(url('/auth/login'), () => HttpResponse.json({
      success: true,
      data: {
        access_token: `header.${payload}.signature`, refresh_token: 'refresh',
        user: { id: 'admin-api', full_name: 'Admin', role_id: 4, status: 'Active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      },
    })));
    const session = await identityApi.login({ identifier: 'admin@smartcafe.vn', password: '123456' });
    expect(session.roleName).toBe('Admin');
    expect(session.user.roleName).toBe('Admin');
  });

  it('hydrate dùng role hiện tại từ /users/me thay role cũ đã persist', async () => {
    const session = await identityApi.login({ identifier: 'admin@smartcafe.vn', password: '123456' });
    useAuthStore.getState().applySession({ ...session, roleName: 'Customer' });
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().roleName).toBe('Admin');
    expect(useAuthStore.getState().user?.roleName).toBe('Admin');
  });


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
