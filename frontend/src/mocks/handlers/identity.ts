import { http, HttpResponse } from 'msw';
import type { AuthSession, RoleName, User, UserStatus } from '@/shared/types';
import { fail, guarded, readJson, url } from '../utils';

/**
 * Mock Identity service — khớp với shared/types.ts:
 *   LoginInput  = { identifier, password }            (identifier = email | số điện thoại)
 *   AuthSession = { accessToken, refreshToken, user, roleName, branchId }
 *   RoleName    = Customer | Staff | Manager | Admin
 *
 * Tài khoản nằm trong RAM và có thể thay đổi: đăng ký tạo tài khoản mới,
 * đặt lại mật khẩu đổi mật khẩu thật → đăng nhập lại bằng mật khẩu mới được.
 * Reload trang = trở về dữ liệu seed.
 */
export interface MockAccount {
  id: string;
  email: string;
  phone: string | null;
  password: string;
  fullName: string;
  roleName: RoleName;
  status: UserStatus;
  branchId: number | null;
  createdAt: string;
  lastLoginAt: string | null;
}

const ROLE_IDS: Record<RoleName, number> = { Customer: 1, Staff: 2, Manager: 3, Admin: 4 };
export const MOCK_PASSWORD = '123456';

function seedAccounts(): MockAccount[] {
  const at = '2026-01-01T00:00:00.000Z';
  const make = (
    id: string,
    email: string,
    phone: string,
    fullName: string,
    roleName: RoleName,
    branchId: number | null,
    status: UserStatus = 'Active',
  ): MockAccount => ({
    id, email, phone, fullName, roleName, branchId, status,
    password: MOCK_PASSWORD, createdAt: at, lastLoginAt: null,
  });

  return [
    make('u-customer', 'customer@smartcafe.vn', '0901234567', 'Khách Hàng', 'Customer', null),
    make('u-staff', 'staff@smartcafe.vn', '0902345678', 'Nhân Viên', 'Staff', 1),
    make('u-manager', 'manager@smartcafe.vn', '0903456789', 'Quản Lý', 'Manager', 1),
    make('u-admin', 'admin@smartcafe.vn', '0904567890', 'Quản Trị', 'Admin', null),
    // Tài khoản để test nhánh lỗi của form đăng nhập
    make('u-banned', 'banned@smartcafe.vn', '0905678901', 'Bị Khoá', 'Customer', null, 'Banned'),
    make('u-unverified', 'unverified@smartcafe.vn', '0906789012', 'Chưa Xác Minh', 'Customer', null, 'Unverified'),
  ];
}

/** Mảng dùng chung (mutable) — handler khác / auth-flow import để đọc & sửa. */
export const MOCK_ACCOUNTS: MockAccount[] = seedAccounts();

export function resetAuthMock(): void {
  MOCK_ACCOUNTS.splice(0, MOCK_ACCOUNTS.length, ...seedAccounts());
  tokenEpoch = 0;
}

// ── Định danh ─────────────────────────────────────────────────────────
/** Khoá so khớp: email → lowercase; SĐT → bỏ ký tự phân tách, +84xxxxxxxxx → 0xxxxxxxxx. */
export function identifierKey(v: string): string {
  const s = v.trim();
  if (s.includes('@')) return s.toLowerCase();
  const p = s.replace(/[\s.\-()]/g, '');
  return p.startsWith('+84') ? `0${p.slice(3)}` : p;
}

export function findAccount(identifier: string): MockAccount | undefined {
  const key = identifierKey(identifier);
  return MOCK_ACCOUNTS.find(
    (a) => a.email.toLowerCase() === key || (a.phone !== null && identifierKey(a.phone) === key),
  );
}

export function createCustomer(input: {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  status?: UserStatus;
}): MockAccount {
  const account: MockAccount = {
    id: `u-${crypto.randomUUID()}`,
    email: input.email.trim(),
    phone: input.phone,
    password: input.password,
    fullName: input.fullName.trim(),
    roleName: 'Customer',
    status: input.status ?? 'Active',
    branchId: null,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };
  MOCK_ACCOUNTS.push(account);
  return account;
}

// ── Token ─────────────────────────────────────────────────────────────
/**
 * Token = prefix + id + epoch. Gọi revokeAllTokens() (hoặc window.__mock.auth.revokeAllTokens())
 * để mọi token hiện có trả 401 → test luồng onUnauthorized → clear() → về /login.
 */
const ACCESS_PREFIX = 'mock-access-token:';
const REFRESH_PREFIX = 'mock-refresh-token:';
let tokenEpoch = 0;

export const revokeAllTokens = (): void => {
  tokenEpoch += 1;
};

/** Tìm tài khoản từ header Authorization; dùng lại được ở handler khác. */
export function accountFromRequest(request: Request): MockAccount | undefined {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token?.startsWith(ACCESS_PREFIX)) return undefined;
  const [id, epoch] = token.slice(ACCESS_PREFIX.length).split(':');
  if (Number(epoch) !== tokenEpoch) return undefined; // token cũ / đã bị thu hồi / sai định dạng
  return MOCK_ACCOUNTS.find((a) => a.id === id);
}

// ── Mapper ────────────────────────────────────────────────────────────
function toUser(a: MockAccount): User {
  return {
    id: a.id,
    email: a.email,
    phone: a.phone,
    fullName: a.fullName,
    avatar: null,
    roleId: ROLE_IDS[a.roleName],
    status: a.status,
    emailVerifiedAt: a.status === 'Unverified' ? null : a.createdAt,
    phoneVerifiedAt: null,
    lastLoginAt: a.lastLoginAt,
    createdAt: a.createdAt,
    updatedAt: a.createdAt,
  };
}

export function toSession(a: MockAccount): AuthSession {
  return {
    accessToken: `${ACCESS_PREFIX}${a.id}:${tokenEpoch}`,
    refreshToken: `${REFRESH_PREFIX}${a.id}:${tokenEpoch}`,
    user: toUser(a),
    roleName: a.roleName,
    branchId: a.branchId,
  };
}

// ── Handlers ──────────────────────────────────────────────────────────
export const identityHandlers = [
  // POST /identity/auth/login
  http.post(
    url('/identity/auth/login'),
    guarded(async ({ request }) => {
      const body = await readJson<{ identifier?: string; password?: string }>(request);
      const identifier = body.identifier?.trim();
      if (!identifier || !body.password) fail(400, 'VALIDATION_ERROR', 'Thiếu email/số điện thoại hoặc mật khẩu');

      const account = findAccount(identifier);
      // Cùng 1 thông báo cho "không tồn tại" và "sai mật khẩu" (không lộ tài khoản nào có thật)
      if (!account || account.password !== body.password) {
        fail(401, 'INVALID_CREDENTIALS', 'Sai email/số điện thoại hoặc mật khẩu');
      }
      if (account.status === 'Banned') fail(403, 'ACCOUNT_BANNED', 'Tài khoản đã bị khoá. Vui lòng liên hệ quán.');
      if (account.status === 'Deactivated') fail(403, 'ACCOUNT_DEACTIVATED', 'Tài khoản đã ngừng hoạt động.');
      if (account.status === 'Unverified') fail(403, 'ACCOUNT_UNVERIFIED', 'Tài khoản chưa được xác minh.');

      account.lastLoginAt = new Date().toISOString();
      return HttpResponse.json(toSession(account));
    }),
  ),

  // POST /identity/auth/logout  (store.logout gọi best-effort, luôn 204)
  http.post(url('/identity/auth/logout'), guarded(() => new HttpResponse(null, { status: 204 }))),

  // GET /identity/users/me  (luôn cần token hợp lệ, không phụ thuộc mockConfig.enforceAuth)
  http.get(
    url('/identity/users/me'),
    guarded(({ request }) => {
      const account = accountFromRequest(request);
      if (!account) fail(401, 'UNAUTHORIZED', 'Chưa đăng nhập hoặc token không hợp lệ');
      return HttpResponse.json(toUser(account));
    }),
  ),
];