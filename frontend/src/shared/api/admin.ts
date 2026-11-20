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
export interface AdminStaffProfile {
  id: number; userId: string; branchId: number; branchName?: string | null; employeeCode: string;
  jobTitle: string; employmentType: string; hireDate: string; terminationDate?: string | null; status: string;
  userInfo?: { fullName?: string | null; email?: string | null; phone?: string | null } | null;
}
export interface StaffBranchHistory { id: number; staff?: { id: number } | null; staffId?: number; fromBranch?: { id: number; name?: string | null } | null; fromBranchId?: number | null; toBranch: { id: number; name?: string | null }; toBranchId?: number; effectiveDate: string; changedBy?: string | null; note?: string | null; createdAt: string }
export interface AdminProduct {
  id: number; categoryId: number; categoryName: string; name: string; image?: string | null;
  description?: string | null; temperature?: string | null; caffeineLevel: string; flavorTags: string[];
  sortOrder: number; status: 'Active' | 'Inactive'; price?: number | null; maxPrice?: number | null;
  variantCount: number; activeVariantCount: number;
}
export interface AdminCategory {
  id: number; name: string; status: string; image?: string | null; sortOrder?: number;
  totalProductCount?: number; activeProductCount?: number; productCount?: number;
}
export interface AdminCategoryInput {
  name: string; image?: string | null; sortOrder: number; status: 'Active' | 'Inactive';
}
export interface AdminProductInput {
  categoryId: number; name: string; image?: string; description?: string; temperature?: string | null;
  caffeineLevel: string; flavorTags: string[]; sortOrder: number; status: 'Active' | 'Inactive';
}
export interface AdminProductCreateInput extends AdminProductInput {
  variants: { variantName: string; price: number; sortOrder: number; status: 'Active' }[];
}

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
export const listAdminStaffProfiles = async (signal?: AbortSignal): Promise<AdminStaffProfile[]> =>
  unwrapList(await http.get<unknown>('/staff-profiles', { signal }));
export const transferStaffBranch = async (id: number, input: { toBranchId: number; effectiveDate: string; note?: string }) =>
  unwrapData<AdminStaffProfile>(await http.post<unknown>(`/staff-profiles/${id}/transfer`, input, { snake: true }));
export const listStaffBranchHistory = async (id: number, signal?: AbortSignal): Promise<StaffBranchHistory[]> =>
  unwrapList(await http.get<unknown>(`/staff-profiles/${id}/branch-history`, { signal }));
export const updateAdminUserRole = async (id: string, roleId: number) => unwrapData<AdminUser>(await http.patch<unknown>(`/admin/users/${id}/role`, { roleId }, { snake: true }));
export const updateAdminUserStatus = async (id: string, status: string) => unwrapData<AdminUser>(await http.patch<unknown>(`/admin/users/${id}/status`, { status }, { snake: true }));

export async function listAdminProducts(params: { page?: number; size?: number; q?: string; categoryId?: number; status?: string }, signal?: AbortSignal): Promise<AdminPage<AdminProduct>> {
  const result = await http.getWithMeta<unknown>('/catalog/admin/products', {
    query: { ...params, category_id: params.categoryId, categoryId: undefined }, signal,
  });
  const items = unwrapList<AdminProduct>(result.data);
  const meta = result.meta;
  return { items, meta: { page: meta?.page ?? params.page ?? 1, size: meta?.size ?? params.size ?? 20, totalItems: Number(meta?.totalItems ?? items.length), totalPages: meta?.totalPages ?? 1 } };
}
export async function listAdminCategories(signal?: AbortSignal): Promise<AdminCategory[]> {
  return unwrapList(await http.get<unknown>('/catalog/admin/categories', { query: { page: 1, size: 100 }, signal }));
}
export const createAdminCategory = async (input: AdminCategoryInput) =>
  unwrapData<AdminCategory>(await http.post<unknown>('/catalog/categories', input, { snake: true }));
export const updateAdminCategory = async (id: number, input: AdminCategoryInput) =>
  unwrapData<AdminCategory>(await http.put<unknown>(`/catalog/categories/${id}`, input, { snake: true }));
export const deleteAdminCategory = async (id: number) =>
  unwrapData<{ id: number }>(await http.delete<unknown>(`/catalog/categories/${id}`));
export const createAdminProduct = async (input: AdminProductCreateInput) => unwrapData<AdminProduct>(await http.post<unknown>('/catalog/products', input, { snake: true }));
export const updateAdminProduct = async (id: number, input: AdminProductInput) => unwrapData<AdminProduct>(await http.put<unknown>(`/catalog/products/${id}`, input, { snake: true }));
export const updateAdminProductStatus = async (id: number, status: 'Active' | 'Inactive') => unwrapData<AdminProduct>(await http.patch<unknown>(`/catalog/products/${id}/status`, { status }, { snake: true }));
