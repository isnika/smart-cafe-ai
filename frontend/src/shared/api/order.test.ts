// @vitest-environment jsdom
import { http as mswHttp, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { orderApi, configureHttp } from '@/shared/api';
import { url } from '@/mocks/utils';

const server = setupServer();
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => configureHttp({ getToken: () => 'manager-token' }));

describe('Order service public route', () => {
  it('uses the gateway /orders route instead of the obsolete /orders-svc alias', async () => {
    let path = '';
    server.use(mswHttp.get(url('/orders'), ({ request }) => {
      path = new URL(request.url).pathname;
      return HttpResponse.json({
        success: true,
        data: [],
        meta: { page: 1, size: 20, total: 0 },
      });
    }));

    const result = await orderApi.listOrders();

    expect(path).toBe('/api/orders');
    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });
});
