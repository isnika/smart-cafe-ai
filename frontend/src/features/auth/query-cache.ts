import type { QueryClient } from '@tanstack/react-query';
import { useAuthStore } from './store';

/** Discard the previous account's data on logout and on direct account changes. */
export function bindAuthQueryCache(client: QueryClient): () => void {
  return useAuthStore.subscribe((state, previous) => {
    const changedAccount = previous.user != null && previous.user.id !== state.user?.id;
    const signedOut = previous.status !== 'anonymous' && state.status === 'anonymous';
    if (changedAccount || signedOut) {
      void client.cancelQueries();
      client.clear();
    }
  });
}
