import { http, HttpResponse } from 'msw';
import { fail, guarded, readJson, url } from '../utils';

/**
 * GIẢ ĐỊNH (chưa thấy auth store / types): 4 role Customer | Cashier | Barista | Manager,
 * body login { email, password }, response { accessToken, tokenType, expiresIn, user }.
 * Mọi thứ liên quan hình dạng dữ liệu nằm trong file này → khi có AuthSession thật chỉ sửa ở đây.
 */
interface MockAccount {
  id: string;
  email: string;
  password: string;
  fullName: string;
  role: 'Customer' | 'Cashier' | 'Barista' | 'Manager';
  branchId: number | null;
}

export const MOCK_ACCOUNTS: readonly MockAccount[] = [
  { id: 'u-customer', email: 'customer@smartcafe.vn', password: '123456', fullName: 'Khách Hàng', role: 'Customer', branchId: null },
  { id: 'u-cashier', email: 'cashier@smartcafe.vn', password: '123456', fullName: 'Thu Ngân', role: 'Cashier', branchId: 1 },
  { id: 'u-barista', email: 'barista@smartcafe.vn', password: '123456', fullName: 'Pha Chế', role: 'Barista', branchId: 1 },
  { id: 'u-manager', email: 'manager@smartcafe.vn', password: '123456', fullName: 'Quản Lý', role: 'Manager', branchId: 1 },
];

const TOKEN_PREFIX = 'mock-access-token:';

const publicUser = ({ id, email, fullName, role, branchId }: MockAccount) => ({ id, email, fullName, role, branchId });

/** Tìm tài khoản từ header Authorization; dùng lại được ở handler khác (vd lọc đơn theo user). */
export function accountFromRequest(request: Request): MockAccount | undefined {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token?.startsWith(TOKEN_PREFIX)) return undefined;
  const id = token.slice(TOKEN_PREFIX.length);
  return MOCK_ACCOUNTS.find((a) => a.id === id);
}

export const identityHandlers = [
  // POST /identity/auth/login
  http.post(
    url('/identity/auth/login'),
    guarded(async ({ request }) => {
      const body = await readJson<{ email?: string; username?: string; password?: string }>(request);
      const identifier = (body.email ?? body.username)?.trim().toLowerCase();
      if (!identifier || !body.password) fail(400, 'VALIDATION_ERROR', 'Thiếu email hoặc password');

      const account = MOCK_ACCOUNTS.find((a) => a.email === identifier && a.password === body.password);
      if (!account) fail(401, 'INVALID_CREDENTIALS', 'Sai email hoặc mật khẩu');

      return HttpResponse.json({
        accessToken: `${TOKEN_PREFIX}${account.id}`,
        tokenType: 'Bearer',
        expiresIn: 3600,
        user: publicUser(account),
      });
    }),
  ),

  // GET /identity/users/me  (luôn cần token hợp lệ, không phụ thuộc mockConfig.enforceAuth)
  http.get(
    url('/identity/users/me'),
    guarded(({ request }) => {
      const account = accountFromRequest(request);
      if (!account) fail(401, 'UNAUTHORIZED', 'Chưa đăng nhập hoặc token không hợp lệ');
      return HttpResponse.json(publicUser(account));
    }),
  ),
];