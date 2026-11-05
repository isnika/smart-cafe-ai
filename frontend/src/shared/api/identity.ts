import type { Address, AuthSession, LoginInput, Role, RoleName, User } from '@/shared/types';
import { http } from './http';

/** Endpoint NGOÀI lát này (roles) vẫn dùng tiền tố cũ cho tới khi được chuyển sang spec. */
const P = '/identity';

export type AddressInput = Omit<Address, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;

// ── Spec v1 (qua gateway): /auth/*, /users/me ─────────────────────────
/** Phản hồi login/refresh sau khi http.ts đổi key sang camelCase. Vai trò/chi nhánh có thể nằm ở gốc hoặc trong user. */
interface WireSession {
  accessToken: string;
  refreshToken?: string | null;
  user: User & { role?: string | { name?: string } | null; roleName?: RoleName; branchId?: number | null };
  roleName?: RoleName;
  role?: string | { name?: string } | null;
  branchId?: number | null;
}

const roleOf = (r: unknown): RoleName | undefined => {
  const name = typeof r === 'string' ? r : (r as { name?: string } | null | undefined)?.name;
  return name ? ((name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()) as RoleName) : undefined;
};

/** Một chỗ duy nhất đổi phản hồi auth của server → AuthSession của FE. */
export function toAuthSession(w: WireSession): AuthSession {
  const roleName = w.roleName ?? roleOf(w.role) ?? w.user.roleName ?? roleOf(w.user.role) ?? 'Customer';
  return {
    accessToken: w.accessToken,
    refreshToken: w.refreshToken ?? null,
    user: w.user,
    roleName,
    branchId: w.branchId ?? w.user.branchId ?? null,
  };
}

export const login = async (input: LoginInput) =>
  toAuthSession(await http.post<WireSession>('/auth/login', input, { auth: false, snake: true }));

export const logout = () => http.post<void>('/auth/logout');

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

export const getMe = () => http.get<User>('/users/me');
export const listRoles = () => http.get<Role[]>(`${P}/roles`);

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
