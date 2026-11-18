import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import type { AuthSession } from '@/shared/types';
import { bindAuthQueryCache } from './query-cache';
import { useAuthStore } from './store';

const session = (id: string): AuthSession => ({
  accessToken: `access-${id}`, refreshToken: `refresh-${id}`, roleName: 'Customer', branchId: null,
  user: { id, roleId: 1, status: 'Active', fullName: id, createdAt: '', updatedAt: '' },
});

afterEach(() => useAuthStore.getState().clear());

it('discards account A cached data when account B signs in without an intervening logout', () => {
  const client = new QueryClient();
  const unbind = bindAuthQueryCache(client);
  try {
    useAuthStore.getState().applySession(session('account-A'));
    client.setQueryData(['online-cart', 'account-A'], { items: [{ id: 1 }] });
    client.setQueryData(['profile'], { email: 'account-A@gmail.com' });
    useAuthStore.getState().applySession(session('account-B'));
    expect(client.getQueryData(['online-cart', 'account-A'])).toBeUndefined();
    expect(client.getQueryData(['profile'])).toBeUndefined();
    expect(useAuthStore.getState().user?.id).toBe('account-B');
  } finally {
    unbind();
    client.clear();
  }
});
