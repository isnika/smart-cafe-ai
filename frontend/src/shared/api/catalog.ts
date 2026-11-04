import type {
  BranchProductAvailability,
  Category,
  ListProductsParams,
  MenuProduct,
  ProductDetail,
} from '@/shared/types';
import { http, type ApiMeta } from './http';

const P = '/catalog';

// ── Mapper (một chỗ duy nhất chuẩn hoá phản hồi server → type FE) ─────
/** DECIMAL(15,0) có thể về dạng chuỗi "35000" → number. null/rỗng/không hợp lệ → null. */
export function toVnd(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const MONEY_KEYS = new Set(['price', 'maxPrice', 'minPrice', 'extraPrice']);

/** Đệ quy: mọi field tiền trong payload catalog → number (giữ null nếu server trả null). */
function normalizeMoney<T>(value: T): T {
  if (Array.isArray(value)) return value.map(normalizeMoney) as T;
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = MONEY_KEYS.has(k) ? toVnd(v) : normalizeMoney(v);
  return out as T;
}

/** Server có thể trả minPrice thay cho price (MIN variant); FE luôn dùng price/maxPrice. */
function toMenuProduct(raw: MenuProduct & { minPrice?: number | null }): MenuProduct {
  const { minPrice, ...rest } = normalizeMoney(raw);
  return { ...rest, price: rest.price ?? minPrice ?? null, maxPrice: rest.maxPrice ?? null };
}

// ── Query: FE camelCase → spec snake_case ─────────────────────────────
const toQuery = (p: ListProductsParams & { page?: number; size?: number; sort?: string }) => ({
  q: p.q,
  category_id: p.categoryId,
  branch_id: p.branchId,
  page: p.page,
  size: p.size,
  sort: p.sort,
  // Ngoài spec (lọc phía FE cũ): vẫn gửi, server không hỗ trợ thì bỏ qua
  flavor: p.flavor,
  temperature: p.temperature,
  caffeine_level: p.caffeineLevel,
  include_unavailable: p.includeUnavailable,
});

export const listCategories = async () => normalizeMoney(await http.get<Category[]>(`${P}/categories`, { auth: false }));

export interface ProductPage {
  items: MenuProduct[];
  meta: ApiMeta | null;
}

export type ListProductsPageParams = ListProductsParams & { page?: number; size?: number; sort?: string };

/** Một trang menu + meta phân trang (page, size, total, totalPages). */
export const listProductsPage = async (params: ListProductsPageParams, signal?: AbortSignal): Promise<ProductPage> => {
  const { data, meta } = await http.getWithMeta<MenuProduct[]>(`${P}/products`, {
    query: toQuery(params),
    signal,
    auth: false,
  });
  return { items: (data ?? []).map(toMenuProduct), meta };
};

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

/**
 * Menu theo chi nhánh (v_products_full + khả dụng). UI cần toàn bộ menu nên tự duyệt hết các trang
 * (server mặc định có thể chỉ trả 20 dòng). Không có meta (payload cũ) → coi như 1 trang.
 */
export const listProducts = async (params: ListProductsParams, signal?: AbortSignal): Promise<MenuProduct[]> => {
  const all: MenuProduct[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { items, meta } = await listProductsPage({ ...params, page, size: PAGE_SIZE }, signal);
    all.push(...items);
    const last = meta?.totalPages ?? 1;
    if (page >= last || items.length === 0) break;
  }
  return all;
};

export const getProduct = async (id: number, branchId: number) =>
  normalizeMoney(
    await http.get<ProductDetail>(`${P}/products/${id}`, { query: { branch_id: branchId }, auth: false }),
  );

/** Staff bật/tắt "hết hàng" theo chi nhánh. Không có row = còn hàng. */
export interface SetAvailabilityInput {
  isAvailable: boolean;
  unavailableReason?: string;
}

export const setVariantAvailability = (branchId: number, variantId: number, input: SetAvailabilityInput) =>
  http.put<BranchProductAvailability>(`${P}/branches/${branchId}/variants/${variantId}/availability`, input);

export const setOptionAvailability = (branchId: number, optionId: number, input: SetAvailabilityInput) =>
  http.put<BranchProductAvailability>(`${P}/branches/${branchId}/options/${optionId}/availability`, input);