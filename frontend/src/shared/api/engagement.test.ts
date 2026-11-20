import { http as mswHttp, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getLoyaltySummary, getLoyaltyTransactions } from './engagement';
import { configureHttp } from './http';

const server = setupServer();
const url = (path: string) => `http://localhost/api${path}`;
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => configureHttp({ getToken: () => 'customer-token', onUnauthorized: undefined, refresh: undefined }));

describe('Loyalty backend contract', () => {
  it('uses /loyalty/me with Bearer auth and reads the card directly from data', async () => {
    server.use(mswHttp.get(url('/loyalty/me'), ({ request }) => {
      expect(request.headers.get('Authorization')).toBe('Bearer customer-token');
      return HttpResponse.json({ success: true, data: {
        id: 1, user_id: 'customer-1', current_stamps: 12, lifetime_stamps_earned: 22,
        total_redeemed_cups: 1, available_rewards: 1, version: 2, updated_at: '2026-11-17T10:00:00Z',
      } });
    }));

    expect(await getLoyaltySummary()).toMatchObject({
      userId: 'customer-1', currentStamps: 12, lifetimeStampsEarned: 22, totalRedeemedCups: 1,
    });
  });

  it('reads history from the data array and keeps pagination from meta', async () => {
    server.use(mswHttp.get(url('/loyalty/me/transactions'), ({ request }) => {
      const query = new URL(request.url).searchParams;
      expect(Object.fromEntries(query)).toEqual({ page: '2', size: '5' });
      expect(request.headers.get('Authorization')).toBe('Bearer customer-token');
      return HttpResponse.json({ success: true, data: [{
        id: 10, user_id: 'customer-1', order_id: 3, transaction_type: 'Redeem', stamps: -10,
        balance_after: 2, created_at: '2026-11-17T10:00:00Z',
      }], meta: { page: 2, size: 5, total: 6 } });
    }));

    const result = await getLoyaltyTransactions(2, 5);
    expect(result).toMatchObject({ total: 6, page: 2, pageSize: 5 });
    expect(result.items).toEqual([expect.objectContaining({
      transactionType: 'Redeem', stamps: -10, balanceAfter: 2, orderId: 3,
    })]);
  });

  it('accepts an empty transaction list for a new member', async () => {
    server.use(mswHttp.get(url('/loyalty/me/transactions'), () => HttpResponse.json({
      success: true, data: [], meta: { page: 1, size: 20, total: 0 },
    })));
    expect(await getLoyaltyTransactions()).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
  });

  it('preserves authentication errors instead of treating them as an empty card', async () => {
    server.use(mswHttp.get(url('/loyalty/me'), () => HttpResponse.json({
      success: false, error: { code: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập.' },
    }, { status: 401 })));
    await expect(getLoyaltySummary()).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
  });
});
