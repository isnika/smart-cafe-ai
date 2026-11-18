// @vitest-environment jsdom
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { handlers } from '@/mocks/handlers';
import { orderApi } from '@/shared/api';
import { latte, loginAs, resetWorld } from '@/test/helpers';
import { bindOnlineCartToAuth } from './auth-session';
import { syncOnlineCart } from './cart-sync';
import { useOnlineCartStore } from './store';

const server = setupServer(...handlers);
let unbind: () => void;
beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(() => {
  resetWorld();
  useAuthStore.getState().clear();
  unbind = bindOnlineCartToAuth();
});
afterEach(() => {
  unbind();
  vi.restoreAllMocks();
  server.resetHandlers();
});
const signIn = (id: string) => loginAs('Customer', { id });

it('account B gets an empty cart and A retains its own products, voucher and delivery information', async () => {
  signIn('u-customer');
  const cart = useOnlineCartStore.getState();
  cart.setFulfillment('Pickup');
  cart.addLine(latte, 2);
  cart.setVoucher('ONLY-A');
  cart.setDelivery({ receiverName: 'Account A', phone: '0901234567', addressLine: 'Address of A' });
  await syncOnlineCart({ fulfillmentType: 'Pickup', branchId: 1, lines: useOnlineCartStore.getState().lines });

  await useAuthStore.getState().logout();
  expect(useOnlineCartStore.getState()).toMatchObject({ ownerId: null, lines: [], voucherCode: null, delivery: null });
  signIn('u-customer2');
  expect(useOnlineCartStore.getState()).toMatchObject({ ownerId: 'u-customer2', lines: [], voucherCode: null, delivery: null });
  useOnlineCartStore.getState().setFulfillment('Pickup');
  useOnlineCartStore.getState().addLine({ ...latte, note: 'Only B' });
  const cartB = await syncOnlineCart({ fulfillmentType: 'Pickup', branchId: 1, lines: useOnlineCartStore.getState().lines });
  expect(cartB.items).toHaveLength(1);
  expect(cartB.items[0]).toMatchObject({ quantity: 1, note: 'Only B' });

  signIn('u-customer');
  expect(useOnlineCartStore.getState().lines).toHaveLength(1);
  expect(useOnlineCartStore.getState().lines[0]?.quantity).toBe(2);
  expect(useOnlineCartStore.getState().voucherCode).toBe('ONLY-A');
  expect(useOnlineCartStore.getState().delivery?.receiverName).toBe('Account A');
  const cartA = await orderApi.getCurrentCart({ source: 'Online', fulfillmentType: 'Pickup' });
  expect(cartA.id).not.toBe(cartB.id);
  expect(cartA.items[0]).toMatchObject({ quantity: 2 });
});

it('does not upload in-flight or queued products from A under B credentials', async () => {
  signIn('u-customer');
  const cartA = await orderApi.ensureCart({ source: 'Online', fulfillmentType: 'Pickup' }, 1);
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const getCart = vi.spyOn(orderApi, 'getCurrentCart').mockImplementation(async () => {
    entered();
    await gate;
    return cartA;
  });
  const add = vi.spyOn(orderApi, 'addCartItem');
  useOnlineCartStore.getState().addLine(latte);
  const args = { fulfillmentType: 'Pickup' as const, branchId: 1, lines: useOnlineCartStore.getState().lines, userId: 'u-customer' };
  const active = syncOnlineCart(args).catch((error: unknown) => error);
  const queued = syncOnlineCart(args).catch((error: unknown) => error);
  await started;
  signIn('u-customer2');
  release();
  expect(await active).toMatchObject({ code: 'ACCOUNT_CHANGED' });
  expect(await queued).toMatchObject({ code: 'ACCOUNT_CHANGED' });
  expect(await syncOnlineCart(args).catch((error: unknown) => error)).toMatchObject({ code: 'ACCOUNT_CHANGED' });
  expect(getCart).toHaveBeenCalledOnce();
  expect(add).not.toHaveBeenCalled();
  expect(useOnlineCartStore.getState().lines).toEqual([]);
});

it('discards legacy unowned products instead of migrating them into a new Google account', async () => {
  useOnlineCartStore.getState().addLine(latte, 3);
  localStorage.setItem('smartcafe.online-cart.v1', JSON.stringify({ version: 0, state: {
    lines: useOnlineCartStore.getState().lines, fulfillmentType: 'Delivery', voucherCode: 'OLD',
    delivery: { receiverName: 'Previous user', phone: '0901234567', addressLine: 'Private address' },
  } }));
  useOnlineCartStore.setState({ ownerId: null, lines: [], fulfillmentType: null, branchId: null, voucherCode: null, delivery: null });
  await useOnlineCartStore.persist.rehydrate();
  signIn('u-customer2');
  expect(useOnlineCartStore.getState()).toMatchObject({ ownerId: 'u-customer2', lines: [], voucherCode: null, delivery: null });
});

it('does not persist account carts across browser storage rehydration', async () => {
  signIn('u-customer');
  useOnlineCartStore.getState().addLine(latte, 2);
  signIn('u-customer2');
  useOnlineCartStore.getState().addLine({ ...latte, note: 'Only B' });
  signIn('u-customer');
  const persisted = localStorage.getItem('smartcafe.online-cart.v2')!;
  useOnlineCartStore.setState({ ownerId: null, savedCarts: {}, lines: [] });
  localStorage.setItem('smartcafe.online-cart.v2', persisted);
  await useOnlineCartStore.persist.rehydrate();
  expect(useOnlineCartStore.getState().ownerId).toBeNull();
  expect(useOnlineCartStore.getState().lines).toEqual([]);
  signIn('u-customer2');
  expect(useOnlineCartStore.getState().lines).toEqual([]);
});

it('keeps genuinely anonymous shopping items when signing in for checkout', () => {
  useOnlineCartStore.getState().addLine(latte, 2);
  signIn('u-customer2');
  expect(useOnlineCartStore.getState().ownerId).toBe('u-customer2');
  expect(useOnlineCartStore.getState().lines[0]?.quantity).toBe(2);
  useAuthStore.getState().clear();
  expect(useOnlineCartStore.getState().lines).toEqual([]);
});
