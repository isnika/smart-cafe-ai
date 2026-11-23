import { useAuthStore } from './store';
import { USE_MOCK } from '@/shared/api/http';

const getRuntimeConfig = () => (typeof window !== 'undefined' ? window.__SMART_CAFE_CONFIG__ : undefined);

/** Mock branch context for Staff/Manager while Identity has not returned branch_id. */
const configuredBranchId = getRuntimeConfig()?.mockAuthBranchId ?? import.meta.env.VITE_MOCK_AUTH_BRANCH_ID;
const parsedBranchId = configuredBranchId === '' ? null : Number(configuredBranchId ?? 1);
export const MOCK_AUTH_BRANCH_ID = parsedBranchId !== null && Number.isSafeInteger(parsedBranchId) && parsedBranchId > 0 ? parsedBranchId : 1;
const mockAuthEnabled = () => USE_MOCK || getRuntimeConfig()?.useMock === true;

export function useAuthBranchId(): number | null {
  const branchId = useAuthStore((state) => state.branchId);
  const roleName = useAuthStore((state) => state.roleName);
  return branchId ?? (mockAuthEnabled() && (roleName === 'Staff' || roleName === 'Manager') ? MOCK_AUTH_BRANCH_ID : null);
}

export function getAuthBranchId(): number | null {
  const { branchId, roleName } = useAuthStore.getState();
  return branchId ?? (mockAuthEnabled() && (roleName === 'Staff' || roleName === 'Manager') ? MOCK_AUTH_BRANCH_ID : null);
}
