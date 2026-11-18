import { buildLineKey, cartToLines, type LineDisplayMeta } from '@/features/dine-in/cart';
import { useAuthStore } from '@/features/auth/store';
import { isApiError, orderApi } from '@/shared/api';
import { ONLINE_BRANCH_ID } from './config';
import { clearPendingGuestCart, useOnlineCartStore } from './store';
import { runOnlineCartExclusive } from './cart-sync';

/** Load the account cart and merge guest selections before any destructive sync. */
export async function loadOnlineCartSession(userId: string): Promise<void> {
  const current = () => useAuthStore.getState().user?.id === userId && useOnlineCartStore.getState().ownerId === userId;
  if (!current()) return;
  useOnlineCartStore.setState({ syncStatus: 'loading' });
  return runOnlineCartExclusive(async () => {
  try {
    while (current()) {
      const state = useOnlineCartStore.getState();
      const lines = state.lines;
      const snapshot = JSON.stringify(lines);
      const fulfillment = state.fulfillmentType ?? 'Pickup';
      const ctx = { source: 'Online' as const, fulfillmentType: fulfillment };
      let cart;
      try { cart = await orderApi.getCurrentCart(ctx); }
      catch (e) { if (!isApiError(e) || e.status !== 404) throw e; }
      if (!current()) return;
      if (!cart && lines.length) {
        await orderApi.ensureCart(ctx, ONLINE_BRANCH_ID);
        if (!current()) return;
        cart = await orderApi.getCurrentCart(ctx);
      }
      if (cart && lines.length) {
        for (const line of lines) {
          if (!current()) return;
          const matches = cart.items.filter(item => buildLineKey({
            variantId: item.variantId, note: item.note ?? undefined,
            options: item.options.map(o => ({ ...o, optionName: '', extraPrice: 0 })),
          }) === buildLineKey(line));
          if (matches.length > 1) throw new Error('Giỏ tài khoản có các dòng trùng nhau.');
          const item = matches[0];
          const input = { variantId: line.variantId, quantity: line.quantity, note: line.note,
            options: line.options.map(o => ({ optionId: o.optionId, quantity: o.quantity })) };
          if (!item) cart = await orderApi.addCartItem(ctx, input);
          else if (item.quantity < line.quantity) cart = await orderApi.updateCartItem(ctx, item.id, input);
        }
      }
      if (!current()) return;
      if (JSON.stringify(useOnlineCartStore.getState().lines) !== snapshot) continue;
      if (!cart) { clearPendingGuestCart(userId); useOnlineCartStore.setState({ syncStatus: 'ready' }); return; }
      const meta = new Map<number, LineDisplayMeta>();
      for (const line of lines) meta.set(line.variantId, {
        productId: line.productId, productName: line.productName, image: line.image,
        variantName: line.variantName, unitPrice: line.unitPrice,
        options: Object.fromEntries(line.options.map(o => [o.optionId, { optionName: o.optionName, extraPrice: o.extraPrice }])),
      });
      const result = cartToLines(cart, meta).map(line => ({ ...line, key: buildLineKey(line) }));
      if (new Set(result.map(line => line.key)).size !== result.length) {
        throw new Error('Giỏ tài khoản có các dòng trùng nhau và cần được xử lý trước khi đồng bộ.');
      }
      clearPendingGuestCart(userId);
      useOnlineCartStore.setState({ lines: result, fulfillmentType: cart.fulfillmentType === 'Delivery' ? 'Delivery' : 'Pickup', syncStatus: 'ready' });
      return;
    }
  } catch {
    if (current()) useOnlineCartStore.setState({ syncStatus: 'error' });
  }
  }).catch(() => {
    if (current()) useOnlineCartStore.setState({ syncStatus: 'error' });
  });
}
import { buildLineKey, cartToLines, type LineDisplayMeta } from '@/features/dine-in/cart';
import { useAuthStore } from '@/features/auth/store';
import { isApiError, orderApi } from '@/shared/api';
import { ONLINE_BRANCH_ID } from './config';
import { clearPendingGuestCart, useOnlineCartStore } from './store';
import { runOnlineCartExclusive } from './cart-sync';

/** Load the account cart and merge guest selections before any destructive sync. */
export async function loadOnlineCartSession(userId: string): Promise<void> {
  const current = () => useAuthStore.getState().user?.id === userId && useOnlineCartStore.getState().ownerId === userId;
  if (!current()) return;
  useOnlineCartStore.setState({ syncStatus: 'loading' });
  return runOnlineCartExclusive(async () => {
  try {
    while (current()) {
      const state = useOnlineCartStore.getState();
      const lines = state.lines;
      const snapshot = JSON.stringify(lines);
      const fulfillment = state.fulfillmentType ?? 'Pickup';
      const ctx = { source: 'Online' as const, fulfillmentType: fulfillment };
      let cart;
      try { cart = await orderApi.getCurrentCart(ctx); }
      catch (e) { if (!isApiError(e) || e.status !== 404) throw e; }
      if (!current()) return;
      if (!cart && lines.length) {
        await orderApi.ensureCart(ctx, ONLINE_BRANCH_ID);
        if (!current()) return;
        cart = await orderApi.getCurrentCart(ctx);
      }
      if (cart && lines.length) {
        for (const line of lines) {
          if (!current()) return;
          const matches = cart.items.filter(item => buildLineKey({
            variantId: item.variantId, note: item.note ?? undefined,
            options: item.options.map(o => ({ ...o, optionName: '', extraPrice: 0 })),
          }) === buildLineKey(line));
          if (matches.length > 1) throw new Error('Giỏ tài khoản có các dòng trùng nhau.');
          const item = matches[0];
          const input = { variantId: line.variantId, quantity: line.quantity, note: line.note,
            options: line.options.map(o => ({ optionId: o.optionId, quantity: o.quantity })) };
          if (!item) cart = await orderApi.addCartItem(ctx, input);
          else if (item.quantity < line.quantity) cart = await orderApi.updateCartItem(ctx, item.id, input);
        }
      }
      if (!current()) return;
      if (JSON.stringify(useOnlineCartStore.getState().lines) !== snapshot) continue;
      if (!cart) { clearPendingGuestCart(userId); useOnlineCartStore.setState({ syncStatus: 'ready' }); return; }
      const meta = new Map<number, LineDisplayMeta>();
      for (const line of lines) meta.set(line.variantId, {
        productId: line.productId, productName: line.productName, image: line.image,
        variantName: line.variantName, unitPrice: line.unitPrice,
        options: Object.fromEntries(line.options.map(o => [o.optionId, { optionName: o.optionName, extraPrice: o.extraPrice }])),
      });
      const result = cartToLines(cart, meta).map(line => ({ ...line, key: buildLineKey(line) }));
      if (new Set(result.map(line => line.key)).size !== result.length) {
        throw new Error('Giỏ tài khoản có các dòng trùng nhau và cần được xử lý trước khi đồng bộ.');
      }
      clearPendingGuestCart(userId);
      useOnlineCartStore.setState({ lines: result, fulfillmentType: cart.fulfillmentType === 'Delivery' ? 'Delivery' : 'Pickup', syncStatus: 'ready' });
      return;
    }
  } catch {
    if (current()) useOnlineCartStore.setState({ syncStatus: 'error' });
  }
  });
}
