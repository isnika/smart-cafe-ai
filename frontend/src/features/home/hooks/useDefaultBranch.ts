import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { useOnlineCartStore } from '@/features/online-order/store';
import { useAddressBook } from '@/features/online-order/hooks/useDefaultAddress';
import { pickDefaultAddress } from '@/features/online-order/address';
import { orderApi, storeApi } from '@/shared/api';
import type { Branch } from '@/shared/types';

const distanceSquared = (branch: Branch, latitude: number, longitude: number) =>
  (branch.latitude! - latitude) ** 2 + (branch.longitude! - longitude) ** 2;

export function useDefaultBranch() {
  const userId = useAuthStore((state) => state.user?.id);
  const roleName = useAuthStore((state) => state.roleName);
  const branchId = useOnlineCartStore((state) => state.branchId);
  const setBranch = useOnlineCartStore((state) => state.setBranch);
  const addressBook = useAddressBook(roleName === 'Customer');
  const branches = useQuery({ queryKey: ['store', 'branches', 'online'], queryFn: () => storeApi.listBranches({ status: 'Active' }), staleTime: 60_000 });
  const bestSelling = useQuery({ queryKey: ['store', 'best-selling-branch'], queryFn: orderApi.getBestSellingBranchId, staleTime: 5 * 60_000 });
  const address = addressBook.data ? pickDefaultAddress(addressBook.data) : undefined;

  useEffect(() => {
    if (branchId !== null || !branches.data?.length) return;
    const eligible = branches.data.filter((branch) => branch.status === 'Active' && branch.acceptsOnlineOrders);
    if (!eligible.length) return;

    if (userId && roleName === 'Customer' && !addressBook.isPending) {
      if (address && typeof address.latitude === 'number' && typeof address.longitude === 'number') {
        const nearest = [...eligible].filter((branch) => typeof branch.latitude === 'number' && typeof branch.longitude === 'number')
          .sort((a, b) => distanceSquared(a, address.latitude!, address.longitude!) - distanceSquared(b, address.latitude!, address.longitude!) || a.id - b.id)[0];
        if (nearest) { setBranch(nearest.id); return; }
      }
    } else if (userId && roleName === 'Customer' && addressBook.isError) {
      // Address lookup failure must not prevent public menu browsing.
    } else if (userId && roleName === 'Customer' && addressBook.isPending) return;

    if (bestSelling.data !== undefined) {
      const best = eligible.find((branch) => branch.id === bestSelling.data);
      setBranch((best ?? eligible[0]!).id);
    }
  }, [address, addressBook.isError, addressBook.isPending, bestSelling.data, branchId, branches.data, roleName, setBranch, userId]);

  return { branchId, branches, addressBook };
}
