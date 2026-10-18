import type {
  BranchProductAvailability,
  Category,
  ListProductsParams,
  MenuProduct,
  ProductDetail,
} from '@/shared/types';
import { http } from './http';

const P = '/catalog';

export const listCategories = () => http.get<Category[]>(`${P}/categories`, { auth: false });

/** Menu theo chi nhánh (v_products_full + khả dụng). */
export const listProducts = (params: ListProductsParams, signal?: AbortSignal) =>
  http.get<MenuProduct[]>(`${P}/products`, { query: params, signal, auth: false });

export const getProduct = (id: number, branchId: number) =>
  http.get<ProductDetail>(`${P}/products/${id}`, { query: { branchId }, auth: false });

/** Staff bật/tắt "hết hàng" theo chi nhánh. Không có row = còn hàng. */
export interface SetAvailabilityInput {
  isAvailable: boolean;
  unavailableReason?: string;
}

export const setVariantAvailability = (branchId: number, variantId: number, input: SetAvailabilityInput) =>
  http.put<BranchProductAvailability>(`${P}/branches/${branchId}/variants/${variantId}/availability`, input);

export const setOptionAvailability = (branchId: number, optionId: number, input: SetAvailabilityInput) =>
  http.put<BranchProductAvailability>(`${P}/branches/${branchId}/options/${optionId}/availability`, input);