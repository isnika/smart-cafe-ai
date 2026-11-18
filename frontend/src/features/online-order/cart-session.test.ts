// @vitest-environment jsdom
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { handlers } from '@/mocks/handlers';
import { orderApi } from '@/shared/api';
import { latte, loginAs, resetWorld } from '@/test/helpers';
import { loadOnlineCartSession } from './cart-session';
import { changeOnlineCartOwner, useOnlineCartStore } from './store';

const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => { resetWorld(); useOnlineCartStore.setState({ ownerId: null, syncStatus: 'ready' }); });

describe('account cart merge', () => {
  it('preserves the account cart, merges a guest line and can retry without duplicates', async () => {
    loginAs('Customer', { id: 'u-customer' });
    const ctx = { source: 'Online', fulfillmentType: 'Pickup' } as const;
    await orderApi.ensureCart(ctx, 1);
    await orderApi.addCartItem(ctx, { variantId: latte.variantId, quantity: 1, options: latte.options });
    useOnlineCartStore.getState().addLine(latte, 2);
    changeOnlineCartOwner('u-customer');
    await loadOnlineCartSession('u-customer');
    expect(useOnlineCartStore.getState().syncStatus).toBe('ready');
    expect(useOnlineCartStore.getState().lines).toHaveLength(1);
    expect(useOnlineCartStore.getState().lines[0]?.quantity).toBe(2);
    await loadOnlineCartSession('u-customer');
    expect((await orderApi.getCurrentCart(ctx)).items[0]?.quantity).toBe(2);
    useAuthStore.getState().clear();
    expect(useOnlineCartStore.getState().lines).toEqual([]);
  });

  it('resumes a partially synchronized guest cart without adding the first line twice', async () => {
    loginAs('Customer', { id: 'u-customer' });
    const ctx = { source: 'Online', fulfillmentType: 'Pickup' } as const;
    await orderApi.ensureCart(ctx, 1);
    await orderApi.addCartItem(ctx, { variantId: latte.variantId, quantity: 1, options: latte.options });
    useOnlineCartStore.getState().addLine({ ...latte, note: 'Ít đá' }, 1);
    useOnlineCartStore.getState().addLine(latte, 2);
    changeOnlineCartOwner('u-customer');
    server.use(http.put('*/carts/current/items/:itemId', () => HttpResponse.json({}, { status: 500 })));
    await loadOnlineCartSession('u-customer');
    expect(useOnlineCartStore.getState().syncStatus).toBe('error');
    expect((await orderApi.getCurrentCart(ctx)).items).toHaveLength(2);
    server.resetHandlers();
    await loadOnlineCartSession('u-customer');
    const cart = await orderApi.getCurrentCart(ctx);
    expect(useOnlineCartStore.getState().syncStatus).toBe('ready');
    expect(cart.items).toHaveLength(2);
    expect(cart.items.find(item => !item.note)?.quantity).toBe(2);
    expect(cart.items.find(item => item.note === 'Ít đá')?.quantity).toBe(1);
  });
});
