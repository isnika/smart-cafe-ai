import { useQuery } from '@tanstack/react-query';
import { isValidTableCode } from '../validators';
import { openDineInSession } from '../session';

/**
 * Mở (hoặc nối lại) phiên bàn đúng 1 lần cho mỗi tableCode (getQr → getCurrentSession | createSession).
 * Key chỉ gồm tableCode; staleTime vô hạn + không refetch → render lại / focus lại không tạo request mới.
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
    queryFn: () => openDineInSession(tableCode!),
  });
}
