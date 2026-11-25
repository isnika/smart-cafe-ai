import type {
  AdjustInventoryInput,
  Ingredient,
  InventoryItemView,
  InventoryLog,
  ListInventoryLogsParams,
  ListInventoryParams,
  Page,
  PurchaseOrder,
  PurchaseOrderDetail,
  PurchaseOrderStatus,
  Supplier,
} from '@/shared/types';
import { http } from './http';

const P = '/inventory';

export interface ListIngredientsParams {
  q?: string;
  isActive?: boolean;
  page?: number;
  size?: number;
}

export interface IngredientInput {
  name: string;
  unit: string;
  averageCost?: number;
  isActive?: boolean;
}

export interface IngredientPage {
  items: Ingredient[];
  meta: {
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
  };
}

export const listIngredients = () => http.get<Ingredient[]>(`${P}/ingredients`);

export const listIngredientsPaged = async (
  params: ListIngredientsParams = {},
  signal?: AbortSignal,
): Promise<IngredientPage> => {
  const page = params.page ? Math.max(0, params.page - 1) : 0;
  const size = params.size ?? 10;
  const { data, meta } = await http.getWithMeta<Ingredient[]>(`${P}/ingredients`, {
    query: {
      q: params.q?.trim() || undefined,
      is_active: params.isActive,
      page,
      size,
    },
    signal,
  });
  const items = Array.isArray(data) ? data : [];
  const totalElements = Number(meta?.totalElements ?? meta?.total ?? items.length);
  const totalPages = Number(meta?.totalPages ?? Math.max(1, Math.ceil(totalElements / size)));
  const currentPage = Number(meta?.page != null ? meta.page + 1 : (params.page ?? 1));
  return {
    items,
    meta: {
      page: currentPage,
      size,
      totalElements,
      totalPages,
    },
  };
};

export const createIngredient = (input: IngredientInput) =>
  http.post<Ingredient>(`${P}/ingredients`, input);

export const updateIngredient = (id: number, input: IngredientInput) =>
  http.put<Ingredient>(`${P}/ingredients/${id}`, input);

export const updateIngredientStatus = (id: number, isActive: boolean) =>
  http.patch<Ingredient>(`${P}/ingredients/${id}/active`, { is_active: isActive });

export const deleteIngredient = (id: number) =>
  http.delete(`${P}/ingredients/${id}`);
export const listSuppliers = () => http.get<Supplier[]>(`${P}/suppliers`);

export const listInventory = (params: ListInventoryParams) => http.get<InventoryItemView[]>(`${P}/stock`, { query: params });
export const listInventoryLogs = (params: ListInventoryLogsParams) =>
  http.get<Page<InventoryLog>>(`${P}/logs`, { query: params });
/** Waste / Adjustment / Stocktake – bắt buộc `reason`. */
export const adjustInventory = (input: AdjustInventoryInput) => http.post<InventoryLog>(`${P}/adjustments`, input);

export const listPurchaseOrders = (branchId: number, status?: PurchaseOrderStatus) =>
  http.get<PurchaseOrder[]>(`${P}/purchase-orders`, { query: { branchId, status } });
export const getPurchaseOrder = (id: number) => http.get<PurchaseOrderDetail>(`${P}/purchase-orders/${id}`);