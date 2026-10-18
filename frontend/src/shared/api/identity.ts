import type { Address, AuthSession, LoginInput, Role, User } from '@/shared/types';
import { http } from './http';

const P = '/identity';

export type AddressInput = Omit<Address, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;

export const login = (input: LoginInput) => http.post<AuthSession>(`${P}/auth/login`, input, { auth: false });
export const logout = () => http.post<void>(`${P}/auth/logout`);
export const getMe = () => http.get<User>(`${P}/users/me`);
export const listRoles = () => http.get<Role[]>(`${P}/roles`);

export const listAddresses = () => http.get<Address[]>(`${P}/users/me/addresses`);
export const createAddress = (input: AddressInput) => http.post<Address>(`${P}/users/me/addresses`, input);
export const updateAddress = (id: number, input: Partial<AddressInput>) =>
  http.patch<Address>(`${P}/users/me/addresses/${id}`, input);
export const deleteAddress = (id: number) => http.delete(`${P}/users/me/addresses/${id}`);
export const setDefaultAddress = (id: number) => http.post<Address>(`${P}/users/me/addresses/${id}/default`);