import { http, HttpResponse } from 'msw';
import type { CaffeineLevel, MenuProduct, ProductDetail, Temperature } from '@/shared/types';
import { BRANCH_ID, db, isSellable, toMenuProduct } from '../db';
import { seedCategories } from '../fixtures';
import { fail, guarded, url } from '../utils';

/** "Cà phê" → "ca phe": tìm tên không dấu như người dùng gõ thật. */
const fold = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export const catalogHandlers = [
  // GET /catalog/categories
  http.get(
    url('/catalog/categories'),
    guarded(() => HttpResponse.json(seedCategories().sort((a, b) => a.sortOrder - b.sortOrder))),
  ),

  // GET /catalog/products/:id?branchId=  → ProductDetail (variant + option group kèm khả dụng)
  http.get(
    url('/catalog/products/:id'),
    guarded(({ request, params }) => {
      const branchId = Number(new URL(request.url).searchParams.get('branchId'));
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
      return HttpResponse.json(detail);
    }),
  ),

  // GET /catalog/products?branchId=&categoryId=&q=&flavor=&temperature=&caffeineLevel=&includeUnavailable=
  http.get(
    url('/catalog/products'),
    guarded(({ request }) => {
      const sp = new URL(request.url).searchParams;

      const branchId = Number(sp.get('branchId'));
      if (!Number.isInteger(branchId) || branchId <= 0) fail(400, 'VALIDATION_ERROR', 'Thiếu hoặc sai branchId');
      if (branchId !== BRANCH_ID) fail(404, 'BRANCH_NOT_FOUND', `Không có chi nhánh ${branchId}`);

      const categoryId = sp.get('categoryId');
      const q = sp.get('q')?.trim();
      const flavor = sp.get('flavor')?.toLowerCase();
      const temperature = sp.get('temperature') as Temperature | null;
      const caffeine = sp.get('caffeineLevel') as CaffeineLevel | null;
      const includeUnavailable = sp.get('includeUnavailable') === 'true';

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

      return HttpResponse.json(items);
    }),
  ),
];