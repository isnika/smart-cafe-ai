import type { Role, User } from '@/shared/types';
import { http } from './http';
import { useAuthStore } from '@/features/auth/store';
export type { Role } from '@/shared/types';

export interface AdminBranch {
  id: number; code: string; name: string; address: string; phone?: string | null;
  timezone?: string | null; openingTime?: string | null; closingTime?: string | null;
  acceptsOnlineOrders?: boolean; deliveryRadiusKm?: number | null; deliveryFee?: number | null; status: 'Active' | 'Inactive' | string;
}
export interface AdminTable { id: number; branchId: number; branchName?: string | null; tableNumber: string; qrCode?: string | null; isActive: boolean }
export type AdminUser = User;
export interface PageMeta { page: number; size: number; totalItems: number; totalPages: number }
export interface AdminPage<T> { items: T[]; meta: PageMeta }
export interface BranchInput {
  code: string; name: string; address: string; phone?: string; timezone?: string;
  openingTime?: string; closingTime?: string; acceptsOnlineOrders?: boolean;
  deliveryRadiusKm?: number | null; deliveryFee?: number | null;
}
export interface AdminUserInput { fullName: string; email: string; phone?: string; password: string; roleId: number; status: string }
export interface StaffProfileInput { userId: string; branchId: number; employeeCode: string; jobTitle: string; employmentType: 'Full_Time' | 'Part_Time' | 'Probation' | 'Intern'; hireDate: string }

const unwrapList = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const o = value as { content?: unknown; items?: unknown };
    if (Array.isArray(o.items)) return o.items as T[];
    if (Array.isArray(o.content)) return o.content as T[];
  }
  return [];
};
const unwrapData = <T>(value: unknown): T => {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'data' in value) return (value as { data: T }).data;
  return value as T;
};

export async function listAdminBranches(signal?: AbortSignal): Promise<AdminBranch[]> {
  return unwrapList(await http.get<unknown>('/branches', { signal }));
}
export const createAdminBranch = async (input: BranchInput) => unwrapData<AdminBranch>(await http.post<unknown>('/branches', input, { snake: true }));
export const updateAdminBranch = async (id: number, input: BranchInput) => unwrapData<AdminBranch>(await http.put<unknown>(`/branches/${id}`, input, { snake: true }));
export const updateAdminBranchStatus = async (id: number, status: 'Active' | 'Inactive') => unwrapData<AdminBranch>(await http.patch<unknown>(`/branches/${id}/status`, { status }, { snake: true }));

export async function listAdminTables(branchId: number, signal?: AbortSignal): Promise<AdminTable[]> {
  return unwrapList(await http.get<unknown>(`/branches/${branchId}/tables`, { signal }));
}
export const createAdminTable = async (branchId: number, tableNumber: string) => unwrapData<AdminTable>(await http.post<unknown>(`/branches/${branchId}/tables`, { tableNumber }, { snake: true }));
export const setAdminTableActive = async (id: number, isActive: boolean) => unwrapData<AdminTable>(await http.patch<unknown>(`/tables/${id}/active`, { isActive }, { snake: true }));
export const regenerateAdminTableQr = async (id: number) => unwrapData<AdminTable>(await http.post<unknown>(`/tables/${id}/qr/regenerate`));

export async function downloadAdminTableQr(id: number, signal?: AbortSignal): Promise<Blob> {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
  const accessToken = useAuthStore.getState().accessToken;
  const response = await fetch(`${base}/tables/${id}/qr?format=png`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined, signal,
  });
  if (!response.ok) throw new Error(`Không thể tải QR (${response.status})`);
  return response.blob();
}
export async function downloadAdminBranchQrPdf(branchId: number, signal?: AbortSignal): Promise<Blob> {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
  const accessToken = useAuthStore.getState().accessToken;
  const response = await fetch(`${base}/branches/${branchId}/tables/qr-export`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined, signal,
  });
  if (!response.ok) throw new Error(`Không thể xuất QR (${response.status})`);
  return response.blob();
}

export async function listAdminUsers(params: { page: number; size: number; q?: string; status?: string; roleId?: number }, signal?: AbortSignal): Promise<AdminPage<AdminUser>> {
  const result = await http.getWithMeta<unknown>('/admin/users', {
    query: { ...params, role_id: params.roleId, roleId: undefined }, signal,
  });
  const items = unwrapList<AdminUser>(result.data);
  const meta = result.meta;
  return { items, meta: { page: meta?.page ?? params.page, size: meta?.size ?? params.size, totalItems: Number(meta?.totalItems ?? items.length), totalPages: meta?.totalPages ?? 1 } };
}
export const listAdminRoles = async () => unwrapList<Role>(await http.get<unknown>('/admin/roles'));
export const createAdminUser = async (input: AdminUserInput) => unwrapData<AdminUser>(await http.post<unknown>('/admin/users', input, { snake: true }));
export const createStaffProfile = async (input: StaffProfileInput) => unwrapData<unknown>(await http.post<unknown>('/staff-profiles', input, { snake: true }));
export const updateAdminUserRole = async (id: string, roleId: number) => unwrapData<AdminUser>(await http.patch<unknown>(`/admin/users/${id}/role`, { roleId }, { snake: true }));
export const updateAdminUserStatus = async (id: string, status: string) => unwrapData<AdminUser>(await http.patch<unknown>(`/admin/users/${id}/status`, { status }, { snake: true }));
