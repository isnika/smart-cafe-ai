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
        const guestLines = new Map(lines.map((line) => [buildLineKey(line), line]));
        const groups = new Map<string, typeof cart.items>();
        for (const item of cart.items) {
          const key = buildLineKey({
            variantId: item.variantId, note: item.note ?? undefined,
            options: item.options.map((o) => ({ ...o, optionName: '', extraPrice: 0 })),
          });
          groups.set(key, [...(groups.get(key) ?? []), item]);
        }

        const matchedGuestKeys = new Set<string>();
        let cartChanged = false;
        for (const [key, serverItems] of groups) {
          if (!current()) return;
          const line = guestLines.get(key);
          if (!line) continue;
          matchedGuestKeys.add(key);
          const serverQuantity = serverItems.reduce((sum, item) => sum + item.quantity, 0);
          const targetQuantity = Math.max(serverQuantity, line.quantity);
          if (targetQuantity === serverQuantity) continue;

          if (serverItems.length === 1) {
            const item = serverItems[0]!;
            await orderApi.updateCartItem(ctx, item.id, {
              variantId: line.variantId, quantity: targetQuantity, note: line.note ?? null,
              options: line.options.map((o) => ({ optionId: o.optionId, quantity: o.quantity })),
            });
          } else {
            // Keep old duplicate rows untouched; add only the missing delta. Retrying after a lost response
            // sees the new aggregate quantity and won't apply the delta twice.
            await orderApi.addCartItem(ctx, {
              variantId: line.variantId, quantity: targetQuantity - serverQuantity, note: line.note ?? null,
              options: line.options.map((o) => ({ optionId: o.optionId, quantity: o.quantity })),
            });
          }
          cartChanged = true;
        }

        for (const [key, line] of guestLines) {
          if (!current()) return;
          if (matchedGuestKeys.has(key)) continue;
          await orderApi.addCartItem(ctx, {
            variantId: line.variantId, quantity: line.quantity, note: line.note ?? null,
            options: line.options.map((o) => ({ optionId: o.optionId, quantity: o.quantity })),
          });
          cartChanged = true;
        }
        if (cartChanged) cart = await orderApi.getCurrentCart(ctx);
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
      const seen = new Map<string, number>();
      const result = cartToLines(cart, meta).map((line, index) => {
        const signature = buildLineKey(line);
        const occurrence = (seen.get(signature) ?? 0) + 1;
        seen.set(signature, occurrence);
        return { ...line, key: occurrence === 1 ? signature : `${signature}#${cart!.items[index]!.id}` };
      });
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
