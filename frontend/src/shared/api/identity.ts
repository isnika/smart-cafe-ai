import type { Address, AuthSession, LoginInput, Role, RoleName, User } from '@/shared/types';
import { http } from './http';

export type AddressInput = Omit<Address, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;

// ── Spec v1 (qua gateway): /auth/*, /users/me ─────────────────────────
/** Phản hồi login/refresh sau khi http.ts đổi key sang camelCase. Vai trò/chi nhánh có thể nằm ở gốc hoặc trong user. */
interface WireUser extends Omit<User, 'roleName'> {
  roleName?: string;
  role_name?: string;
  role?: string | { id?: number; name?: string } | null;
  branchId?: number | null;
}

interface WireSession {
  accessToken: string;
  refreshToken?: string | null;
  user: WireUser;
  roleName?: string;
  role_name?: string;
  role?: string | { id?: number; name?: string } | null;
  branchId?: number | null;
}

const roleOf = (r: unknown): RoleName | undefined => {
  const name = typeof r === 'string'
    ? r
    : (r as { name?: string; roleName?: string; role_name?: string } | null | undefined)?.name
      ?? (r as { roleName?: string; role_name?: string } | null | undefined)?.roleName
      ?? (r as { role_name?: string } | null | undefined)?.role_name;
  if (!name) return undefined;
  const key = name.trim().replace(/[\s_-]+/g, '').toLowerCase().replace(/^role/, '');
  const aliases: Record<string, RoleName> = {
    customer: 'Customer', guest: 'Customer',
    staff: 'Staff', employee: 'Staff', cashier: 'Staff', barista: 'Staff',
    manager: 'Manager', branchmanager: 'Manager',
    admin: 'Admin', administrator: 'Admin', superadmin: 'Admin',
  };
  return aliases[key];
};

export const roleFromUser = (user: User | WireUser): RoleName | undefined => {
  const wire = user as WireUser;
  return roleOf(wire.roleName) ?? roleOf(wire.role_name) ?? roleOf(wire.role);
};

function roleFromAccessToken(token: string): RoleName | undefined {
  try {
    const part = token.split('.')[1];
    if (!part) return undefined;
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    return roleOf(payload.role) ?? roleOf(payload.roleName) ?? roleOf(payload.role_name)
      ?? roleOf(payload.authorities) ?? roleOf(payload.roles);
  } catch {
    return undefined;
  }
}

/** Chuẩn hoá UserResponse của backend để mọi consumer dùng cùng roleName camelCase. */
export function toUser(wire: WireUser): User {
  const roleName = roleFromUser(wire);
  const user = { ...wire } as User;
  delete (user as User & { role_name?: string }).role_name;
  delete (user as User & { role?: string | { id?: number; name?: string } | null }).role;
  if (roleName) user.roleName = roleName;
  else delete user.roleName;
  return user;
}

/** Một chỗ duy nhất đổi phản hồi auth của server → AuthSession của FE. */
export function toAuthSession(w: WireSession): AuthSession {
  const user = toUser(w.user);
  const roleName = roleFromUser(user) ?? roleOf(w.roleName) ?? roleOf(w.role_name) ?? roleOf(w.role) ?? roleFromAccessToken(w.accessToken);
  if (!roleName) throw new Error('API đăng nhập không trả về vai trò hợp lệ trong user.role_name');
  user.roleName = roleName;
  return {
    accessToken: w.accessToken,
    refreshToken: w.refreshToken ?? null,
    user,
    roleName,
    branchId: w.branchId ?? w.user.branchId ?? null,
  };
}

/** Một số gateway deployments trả envelope, số khác đã unwrap ApiResponse ở edge. */
function unwrapAuthResponse(value: unknown): WireSession {
  if (!value || typeof value !== 'object') throw new Error('API đăng nhập trả response không hợp lệ');
  const outer = value as { success?: unknown; data?: unknown; error?: { message?: string } };
  if (outer.success === false) throw new Error(outer.error?.message ?? 'Đăng nhập thất bại');
  const payload = outer.success === true ? outer.data : value;
  if (!payload || typeof payload !== 'object') throw new Error('API đăng nhập không trả dữ liệu phiên');
  const p = payload as Record<string, unknown>;
  // Hỗ trợ cả DTO AuthResponse trực tiếp và payload legacy có session bọc thêm.
  const session = (p.session && typeof p.session === 'object' ? p.session : p) as WireSession;
  if (!session.accessToken || !session.user) throw new Error('API đăng nhập thiếu access_token hoặc user');
  return session;
}

export const login = async (input: LoginInput) =>
  toAuthSession(unwrapAuthResponse(await http.post<unknown>('/auth/login', input, { auth: false })));

/** Xác minh Google ID token ở Identity service rồi đổi thành phiên Smart Cafe. */
export const loginWithGoogle = async (idToken: string) =>
  toAuthSession(await http.post<WireSession>('/auth/google', { idToken }, { auth: false, snake: true }));

export const logout = (refreshToken?: string | null) => http.post<void>('/auth/logout', { refreshToken: refreshToken ?? null }, { snake: true });

export interface RefreshedTokens {
  accessToken: string;
  /** Refresh token bị xoay: refresh token cũ không dùng lại được. */
  refreshToken: string | null;
}

export const refresh = async (refreshToken: string): Promise<RefreshedTokens> => {
  const r = await http.post<{ accessToken: string; refreshToken?: string | null }>(
    '/auth/refresh',
    { refreshToken },
    { auth: false, snake: true },
  );
  return { accessToken: r.accessToken, refreshToken: r.refreshToken ?? null };
};

export const getMe = async () => toUser(await http.get<WireUser>('/users/me'));
export const listRoles = () => http.get<Role[]>('/admin/roles');

// ── Địa chỉ giao hàng (spec "1. Identity / Địa chỉ giao hàng", Customer, Bearer) ──
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Mapper: latitude/longitude DECIMAL(10,7) có thể về dạng chuỗi → number. */
export const toAddress = (a: Address): Address => ({
  ...a,
  latitude: numOrNull(a.latitude),
  longitude: numOrNull(a.longitude),
  isDefault: Boolean(a.isDefault),
});

const ADDRESSES = '/users/me/addresses';
/** GET /users/me/addresses */
export const listAddresses = async () => (await http.get<Address[]>(ADDRESSES)).map(toAddress);
/** POST /users/me/addresses → 201. Bắt buộc receiver_name, phone, province, ward, address_line. */
export const createAddress = async (input: AddressInput) => toAddress(await http.post<Address>(ADDRESSES, input, { snake: true }));
/** PUT /users/me/addresses/{id} (thay toàn bộ). */
export const updateAddress = async (id: number, input: AddressInput) =>
  toAddress(await http.put<Address>(`${ADDRESSES}/${id}`, input, { snake: true }));
/** DELETE /users/me/addresses/{id} → 204. */
export const deleteAddress = (id: number) => http.delete(`${ADDRESSES}/${id}`);
/** PATCH /users/me/addresses/{id}/default (spec dùng PATCH, không phải POST). */
export const setDefaultAddress = async (id: number) => toAddress(await http.patch<Address>(`${ADDRESSES}/${id}/default`));
