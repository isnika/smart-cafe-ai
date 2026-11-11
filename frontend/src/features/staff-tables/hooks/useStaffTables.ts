import { useRef, useState } from 'react';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, isApiError, staffTableApi } from '@/shared/api';
import type { StaffSessionPage, StaffSessionPatchStatus, StaffTableSession } from '@/shared/api/staff-table.types';
import { SESSION_PAGE_SIZE, TABLES_REFETCH_MS } from '../config';
import { CONFLICT_MESSAGE, SESSION_SUCCESS, type SessionFilter } from '../model';

export const STAFF_TABLES_KEY = ['staff', 'tables'] as const;
export const STAFF_SESSIONS_KEY = ['staff', 'table-sessions'] as const;

/** Bàn + status◇ Empty/Occupied do server trả. */
export const staffTablesQuery = (branchId: number) =>
  queryOptions({
    queryKey: [...STAFF_TABLES_KEY, branchId] as const,
    queryFn: ({ signal }) => staffTableApi.listStaffTables(branchId, {}, signal),
    refetchInterval: TABLES_REFETCH_MS,
  });

export const useStaffTables = (branchId: number | null) =>
  useQuery({ ...staffTablesQuery(branchId ?? 0), enabled: branchId !== null });

/** Gộp 2 lần gọi theo status; phiên cũ nhất (mở lâu nhất) lên đầu để xử lý trước. */
async function listOpenSessions(branchId: number, signal?: AbortSignal): Promise<StaffSessionPage> {
  const [active, pending] = await Promise.all([
    staffTableApi.listStaffTableSessions({ branchId, status: 'Active', size: 100 }, signal),
    staffTableApi.listStaffTableSessions({ branchId, status: 'Payment_Pending', size: 100 }, signal),
  ]);
  const items = [...active.items, ...pending.items].sort((a, b) => (a.openedAt ?? '').localeCompare(b.openedAt ?? '') || a.id - b.id);
  return { items, meta: { page: 1, size: items.length, total: items.length, totalPages: 1 } };
}

export const staffSessionsQuery = (branchId: number, filter: SessionFilter, page: number) =>
  queryOptions({
    queryKey: [...STAFF_SESSIONS_KEY, 'list', branchId, filter, filter === 'open' ? 1 : page] as const,
    queryFn: ({ signal }): Promise<StaffSessionPage> =>
      filter === 'open'
        ? listOpenSessions(branchId, signal)
        : staffTableApi.listStaffTableSessions({ branchId, status: filter, page, size: SESSION_PAGE_SIZE }, signal),
    refetchInterval: TABLES_REFETCH_MS,
  });

export const useStaffSessions = (branchId: number | null, filter: SessionFilter, page: number) =>
  useQuery({ ...staffSessionsQuery(branchId ?? 0, filter, page), enabled: branchId !== null });

/** Tra phiên theo id trong số phiên đang mở (dùng sau thanh toán). Luôn tải mới khi mount. */
export const openSessionLookupQuery = (branchId: number, sessionId: number) =>
  queryOptions({
    queryKey: [...STAFF_SESSIONS_KEY, 'lookup', branchId, sessionId] as const,
    queryFn: ({ signal }) => staffTableApi.findOpenStaffTableSession(branchId, sessionId, signal),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    retry: false,
  });

export const useOpenSessionLookup = (branchId: number, sessionId: number) => useQuery(openSessionLookupQuery(branchId, sessionId));

export interface SessionNotice {
  tone: 'success' | 'warning' | 'error';
  text: string;
}

const is409 = (e: unknown): boolean => isApiError(e) && e.status === 409;

function describeError(e: unknown): SessionNotice {
  if (is409(e)) return { tone: 'warning', text: CONFLICT_MESSAGE };
  if (e instanceof ApiError && e.status === 403) return { tone: 'error', text: 'Bạn không có quyền thao tác phiên bàn này.' };
  return { tone: 'error', text: e instanceof Error && e.message ? e.message : 'Không cập nhật được phiên bàn. Vui lòng thử lại.' };
}

/**
 * Đổi trạng thái phiên bàn (PATCH). Quy tắc:
 * - luôn refetch bàn + phiên (cả khi thành công lẫn thất bại) — trạng thái bàn lấy lại từ server, không tự sửa cache;
 * - 409 → refetch + thông báo "phiên vừa thay đổi", KHÔNG tự retry (mutation retry = 0, không có vòng lặp nào gọi lại);
 * - chặn double-click bằng ref (nhiều click trước lần render kế vẫn chỉ gửi một request).
 */
export function useSessionStatusAction() {
  const qc = useQueryClient();
  const inflight = useRef(false);
  const [notice, setNotice] = useState<SessionNotice | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const mutation = useMutation<StaffTableSession, Error, { id: number; status: StaffSessionPatchStatus }>({
    mutationFn: ({ id, status }) => staffTableApi.updateStaffTableSessionStatus(id, status),
    retry: false,
    onSettled: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: STAFF_TABLES_KEY }), qc.invalidateQueries({ queryKey: STAFF_SESSIONS_KEY })]);
    },
  });

  const run = (id: number, status: StaffSessionPatchStatus) => {
    if (inflight.current) return;
    inflight.current = true;
    setPendingId(id);
    setNotice(null);
    mutation.mutate(
      { id, status },
      {
        onSuccess: () => setNotice({ tone: 'success', text: SESSION_SUCCESS[status] }),
        onError: (e) => setNotice(describeError(e)),
        onSettled: () => {
          inflight.current = false;
          setPendingId(null);
        },
      },
    );
  };

  return { run, notice, clearNotice: () => setNotice(null), pendingId, isPending: mutation.isPending };
}
