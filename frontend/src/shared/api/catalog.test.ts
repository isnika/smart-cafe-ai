import { setupServer } from 'msw/node';
import { http as mswHttp, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { catalogApi } from '@/shared/api';
import { toVnd } from './catalog';

const U = (p: string) => `http://localhost/api${p}`;
const server = setupServer();
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

const row = (id: number, price: unknown) => ({
  id, category_id: 2, name: `M${id}`, caffeine_level: 'Low', flavor_tags: ['creamy'], status: 'Active',
  sort_order: id, price, max_price: price, is_available: true,
});
const page = (items: unknown[], p: number, totalPages: number) =>
  HttpResponse.json({ success: true, data: items, meta: { page: p, size: 2, total: 3, total_pages: totalPages }, trace_id: 't' });

describe('catalog mapper', () => {
  it('toVnd: số / chuỗi DECIMAL / null', () => {
    expect(toVnd('35000')).toBe(35000);
    expect(toVnd(35000)).toBe(35000);
    expect(toVnd(null)).toBeNull();
    expect(toVnd('abc')).toBeNull();
  });

  it('listProducts: gửi query snake_case, đổi giá chuỗi → number, duyệt hết các trang', async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      mswHttp.get(U('/catalog/products'), ({ request }) => {
        const sp = new URL(request.url).searchParams;
        seen.push(sp);
        return sp.get('page') === '1' ? page([row(1, '35000'), row(2, '40000')], 1, 2) : page([row(3, '45000')], 2, 2);
      }),
    );
    const menu = await catalogApi.listProducts({ branchId: 1, categoryId: 2, q: 'ca' });
    expect(menu.map((p) => [p.id, p.price, p.categoryId, p.caffeineLevel, p.flavorTags])).toEqual([
      [1, 35000, 2, 'Low', ['creamy']],
      [2, 40000, 2, 'Low', ['creamy']],
      [3, 45000, 2, 'Low', ['creamy']],
    ]);
    expect(seen).toHaveLength(2);
    expect(Object.fromEntries(seen[0]!)).toMatchObject({ branch_id: '1', category_id: '2', q: 'ca', page: '1' });
  });

  it('listProductsPage giữ meta; getProduct chuẩn hoá giá variant/option', async () => {
    server.use(mswHttp.get(U('/catalog/products'), () => page([row(1, 1000)], 1, 3)));
    const r = await catalogApi.listProductsPage({ branchId: 1, page: 1, size: 2 });
    expect(r.meta).toMatchObject({ page: 1, total: 3, totalPages: 3 });

    server.use(
      mswHttp.get(U('/catalog/products/:id'), ({ request }) => {
        expect(new URL(request.url).searchParams.get('branch_id')).toBe('1');
        return HttpResponse.json({
          success: true, trace_id: 't', meta: null,
          data: { ...row(1, null), variants: [{ id: 5, product_id: 1, variant_name: 'M', price: '39000', is_available: true }],
            option_groups: [{ id: 1, options: [{ id: 9, option_name: 'Trân châu', extra_price: '5000' }] }] },
        });
      }),
    );
    const d = await catalogApi.getProduct(1, 1);
    expect(d.variants[0]).toMatchObject({ variantName: 'M', price: 39000 });
    expect(d.optionGroups[0]?.options[0]).toMatchObject({ optionName: 'Trân châu', extraPrice: 5000 });
  });
});
