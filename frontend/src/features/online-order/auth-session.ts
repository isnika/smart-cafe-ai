import { useAuthStore } from '@/features/auth/store';
import { resetOnlineCartSync } from './cart-sync';
import { useOnlineCartStore } from './store';
import { resetOnlineSubmitState } from './submit';

/** Resolve the persisted cart owner before rendering or starting cart requests. */
export function bindOnlineCartToAuth(): () => void {
  let lastOwner: string | null | undefined;
  const bind = (auth: ReturnType<typeof useAuthStore.getState>) => {
    if (auth.status === 'booting') return;
    const ownerId = auth.status === 'authenticated' ? auth.user?.id ?? null : null;
    const cart = useOnlineCartStore.getState();
    if (lastOwner !== ownerId) {
      resetOnlineCartSync();
      resetOnlineSubmitState();
      lastOwner = ownerId;
    }
    if (cart.ownerId !== ownerId) cart.bindOwner(ownerId);
  };
  bind(useAuthStore.getState());
  return useAuthStore.subscribe(bind);
}
