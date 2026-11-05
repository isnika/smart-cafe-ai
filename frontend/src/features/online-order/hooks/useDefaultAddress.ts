import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { identityApi } from '@/shared/api';
import { pickDefaultAddress } from '../address';

/** Sổ địa chỉ của khách (GET /users/me/addresses, Bearer). Chỉ gọi khi đã đăng nhập bằng tài khoản Customer. */
export function useAddressBook(enabled = true) {
  const userId = useAuthStore((s) => s.user?.id);
  const roleName = useAuthStore((s) => s.roleName);
  return useQuery({
    queryKey: ['identity', 'addresses', userId],
    enabled: enabled && !!userId && roleName === 'Customer',
    queryFn: () => identityApi.listAddresses(),
    staleTime: 60_000,
  });
}

export function useDefaultAddress(enabled = true) {
  const q = useAddressBook(enabled);
  return { ...q, address: q.data ? pickDefaultAddress(q.data) : undefined };
}
