import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { storeApi } from '@/shared/api';
import type { ScheduleView, Shift, Timekeeping } from '@/shared/types';
import { phaseOf, pickActiveSchedule, todayInTz, toFailure, type CheckinFailure, type CheckinPhase } from '../model';

export const CHECKIN_KEY = ['staff', 'checkin'] as const;

export interface UseStaffCheckin {
  branchId: number | null;
  shifts: Shift[];
  schedules: ScheduleView[];
  /** Lịch đang hiển thị (đang làm dở / chưa vào / đã xong). */
  active: ScheduleView | null;
  activeShift: Shift | null;
  phase: CheckinPhase;
  isLoading: boolean;
  /** Lỗi tải ca/lịch. */
  loadError: CheckinFailure | null;
  reload: () => void;
  /** true khi đang gửi check-in/out. */
  submitting: boolean;
  /** Lỗi của lần check-in/out gần nhất. */
  actionError: CheckinFailure | null;
  clearActionError: () => void;
  /** Check-in nếu chưa vào ca, check-out nếu đang trong ca. Bỏ qua khi đang gửi. Trả về true nếu thành công. */
  submitCode: (qrToken: string) => Promise<boolean>;
}

export function useStaffCheckin(): UseStaffCheckin {
  const branchId = useAuthStore((s) => s.branchId);
  const qc = useQueryClient();
  const today = todayInTz();
  const [actionError, setActionError] = useState<CheckinFailure | null>(null);
  const inFlight = useRef(false); // chặn bấm đúp / quét lặp ngay cả trước khi React render lại

  const shiftsQ = useQuery({
    queryKey: [...CHECKIN_KEY, 'shifts', branchId],
    queryFn: () => storeApi.listShifts(branchId as number),
    enabled: branchId !== null,
  });
  const schedulesQ = useQuery({
    queryKey: [...CHECKIN_KEY, 'schedules', branchId, today],
    queryFn: () => storeApi.listSchedules({ branchId: branchId as number, from: today, to: today }),
    enabled: branchId !== null,
  });

  const mutation = useMutation<Timekeeping, unknown, { qrToken: string; out: boolean }>({
    mutationFn: ({ qrToken, out }) => (out ? storeApi.checkOut({ qrToken }) : storeApi.checkIn({ qrToken })),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...CHECKIN_KEY, 'schedules'] }),
  });
  const { mutateAsync } = mutation;

  const schedules = schedulesQ.data ?? [];
  const shifts = shiftsQ.data ?? [];
  const active = pickActiveSchedule(schedules);
  const phase = phaseOf(active);
  const failure = shiftsQ.error ?? schedulesQ.error;

  const submitCode = useCallback(
    async (qrToken: string) => {
      if (inFlight.current) return false;
      const token = qrToken.trim();
      if (!token) {
        setActionError({ message: 'Vui lòng nhập mã ca.', retryable: false });
        return false;
      }
      inFlight.current = true;
      setActionError(null);
      try {
        await mutateAsync({ qrToken: token, out: phase === 'in' });
        return true;
      } catch (e) {
        setActionError(toFailure(e));
        return false;
      } finally {
        inFlight.current = false;
      }
    },
    [mutateAsync, phase],
  );

  return {
    branchId,
    shifts,
    schedules,
    active,
    activeShift: active ? (shifts.find((s) => s.id === active.shiftId) ?? active.shift) : null,
    phase,
    isLoading: branchId !== null && (shiftsQ.isLoading || schedulesQ.isLoading),
    loadError: failure ? toFailure(failure) : null,
    reload: () => {
      void shiftsQ.refetch();
      void schedulesQ.refetch();
    },
    submitting: mutation.isPending,
    actionError,
    clearActionError: () => setActionError(null),
    submitCode,
  };
}
