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

export const listIngredients = () => http.get<Ingredient[]>(`${P}/ingredients`);
export const listSuppliers = () => http.get<Supplier[]>(`${P}/suppliers`);

export const listInventory = (params: ListInventoryParams) => http.get<InventoryItemView[]>(`${P}/stock`, { query: params });
export const listInventoryLogs = (params: ListInventoryLogsParams) =>
  http.get<Page<InventoryLog>>(`${P}/logs`, { query: params });
/** Waste / Adjustment / Stocktake – bắt buộc `reason`. */
export const adjustInventory = (input: AdjustInventoryInput) => http.post<InventoryLog>(`${P}/adjustments`, input);

export const listPurchaseOrders = (branchId: number, status?: PurchaseOrderStatus) =>
  http.get<PurchaseOrder[]>(`${P}/purchase-orders`, { query: { branchId, status } });
export const getPurchaseOrder = (id: number) => http.get<PurchaseOrderDetail>(`${P}/purchase-orders/${id}`);