import { useQuery } from '@tanstack/react-query';
import { storeApi } from '@/shared/api';
import { useAuthStore } from '@/features/auth/store';
import { isValidTableCode } from '../validators';

/**
 * Mở (hoặc nối lại) phiên bàn đúng 1 lần cho mỗi tableCode.
 * - Key chỉ gồm tableCode; staleTime vô hạn + không refetch → render lại / focus lại không tạo request mới.
 * - customerId đọc lúc gọi (không nằm trong key) để đăng nhập xong không bị mở lại session.
 */
export function useTableSession(tableCode: string | undefined) {
  const valid = isValidTableCode(tableCode);
  return useQuery({
    queryKey: ['dine-in', 'session', tableCode],
    enabled: valid,
    staleTime: Infinity,
    gcTime: 4 * 60 * 60 * 1000,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    queryFn: () => {
      const customerId = useAuthStore.getState().user?.id;
      return storeApi.openTableSession({ qrCode: tableCode!, ...(customerId ? { customerId } : {}) });
    },
  });
}
