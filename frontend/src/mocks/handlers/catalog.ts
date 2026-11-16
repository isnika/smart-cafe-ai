import { http } from 'msw';
import type { CaffeineLevel, MenuProduct, ProductDetail, Temperature } from '@/shared/types';
import { BRANCH_ID, db, isSellable, toMenuProduct } from '../db';
import { seedCategories } from '../fixtures';
import { fail, guardedV1, ok, url } from '../utils';

/** "Cà phê" → "ca phe": tìm tên không dấu như người dùng gõ thật. */
const fold = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** Spec dùng branch_id; chấp nhận cả branchId (client cũ). Thiếu → NaN → 400. */
const branchParam = (sp: URLSearchParams) => sp.get('branch_id') ?? sp.get('branchId');

export const catalogHandlers = [
  // GET /catalog/categories
  http.get(
    url('/catalog/categories'),
    guardedV1(() => ok(seedCategories().sort((a, b) => a.sortOrder - b.sortOrder))),
  ),

  // GET /catalog/products/:id?branch_id=  → ProductDetail (variant + option group kèm khả dụng)
  http.get(
    url('/catalog/products/:id'),
    guardedV1(({ request, params }) => {
      const branchId = Number(branchParam(new URL(request.url).searchParams));
      if (!Number.isInteger(branchId) || branchId <= 0) fail(400, 'VALIDATION_ERROR', 'Thiếu hoặc sai branchId');
      if (branchId !== BRANCH_ID) fail(404, 'BRANCH_NOT_FOUND', `Không có chi nhánh ${branchId}`);

      const seed = db.products.find((s) => s.product.id === Number(params.id));
      if (!seed || seed.product.status !== 'Active') fail(404, 'PRODUCT_NOT_FOUND', `Không tìm thấy món ${String(params.id)}`);

      const detail: ProductDetail = {
        ...seed.product,
        variants: seed.variants
          .filter((v) => v.status === 'Active')
          .map((v) => ({ ...v, isAvailable: isSellable(branchId, seed, v), unavailableReason: null })),
        optionGroups: seed.groups.map(({ options, ...group }) => ({
          ...group,
          options: options
            .filter((o) => o.status === 'Active')
            .map((o) => ({ ...o, isAvailable: true, unavailableReason: null })),
        })),
      };
      return ok(detail);
    }),
  ),

  // GET /catalog/products?branch_id=&category_id=&q=&page=&size=&sort=  (+ flavor, temperature, caffeine_level, include_unavailable)
  http.get(
    url('/catalog/products'),
    guardedV1(({ request }) => {
      const sp = new URL(request.url).searchParams;

      const branchId = Number(branchParam(sp));
      if (!Number.isInteger(branchId) || branchId <= 0) fail(400, 'VALIDATION_ERROR', 'Thiếu hoặc sai branchId');
      if (branchId !== BRANCH_ID) fail(404, 'BRANCH_NOT_FOUND', `Không có chi nhánh ${branchId}`);

      const categoryId = sp.get('category_id') ?? sp.get('categoryId');
      const q = sp.get('q')?.trim();
      const flavor = sp.get('flavor')?.toLowerCase();
      const temperature = sp.get('temperature') as Temperature | null;
      const caffeine = (sp.get('caffeine_level') ?? sp.get('caffeineLevel')) as CaffeineLevel | null;
      const includeUnavailable = (sp.get('include_unavailable') ?? sp.get('includeUnavailable')) === 'true';

      const items: MenuProduct[] = db.products
        .filter(({ product: p }) => p.status === 'Active')
        .filter(({ product: p }) => !categoryId || p.categoryId === Number(categoryId))
        .filter(({ product: p }) => !q || fold(p.name).includes(fold(q)))
        .filter(({ product: p }) => !flavor || p.flavorTags?.includes(flavor))
        .filter(({ product: p }) => !temperature || p.temperature === temperature)
        .filter(({ product: p }) => !caffeine || p.caffeineLevel === caffeine)
        .map((seed) => toMenuProduct(seed, branchId))
        .filter((p) => includeUnavailable || p.isAvailable)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      // Phân trang như spec: page (từ 1) + size. Không gửi size → trả hết trong 1 trang.
      const size = Math.min(Math.max(Number(sp.get('size')) || items.length || 1, 1), 100);
      const page = Math.max(Number(sp.get('page')) || 1, 1);
      const pageItems = items.slice((page - 1) * size, page * size);
      return ok(pageItems, { page, size, total: items.length, totalPages: Math.max(Math.ceil(items.length / size), 1) });
    }),
  ),
];