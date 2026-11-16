import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { storeApi } from '@/shared/api';
import type { ScheduleView, Timekeeping } from '@/shared/types';
import { phaseOf, pickActiveSchedule, todayInTz, toFailure, type CheckinFailure, type CheckinPhase } from '../model';

export const CHECKIN_KEY = ['staff', 'timekeeping'] as const;
const SHIFT_QR = /^shift-qr:(\d+)$/;

export interface UseStaffCheckin {
  schedules: ScheduleView[];
  history: Timekeeping[];
  active: ScheduleView | null;
  phase: CheckinPhase;
  isLoading: boolean;
  loadError: CheckinFailure | null;
  reload: () => void;
  submitting: boolean;
  actionError: CheckinFailure | null;
  clearActionError: () => void;
  submitCode: (qrToken: string) => Promise<boolean>;
}

export function useStaffCheckin(): UseStaffCheckin {
  const qc = useQueryClient();
  const today = todayInTz();
  const [actionError, setActionError] = useState<CheckinFailure | null>(null);
  const inFlight = useRef(false);
  const schedulesQ = useQuery({
    queryKey: [...CHECKIN_KEY, 'schedules', today],
    queryFn: () => storeApi.getMySchedules({ from: today, to: today }),
  });
  const historyQ = useQuery({ queryKey: [...CHECKIN_KEY, 'history'], queryFn: () => storeApi.getMyTimekeeping() });
  const mutation = useMutation<Timekeeping, unknown, { scheduleId: number; out: boolean }>({
    mutationFn: ({ scheduleId, out }) => out
      ? storeApi.checkOut({ scheduleId })
      : storeApi.checkIn({ scheduleId, source: 'QR' }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: [...CHECKIN_KEY, 'schedules'] }),
        qc.invalidateQueries({ queryKey: [...CHECKIN_KEY, 'history'] }),
      ]);
    },
  });
  const schedules = schedulesQ.data ?? [];
  const historyBySchedule = new Map((historyQ.data ?? []).map((item) => [item.scheduleId, item]));
  const withServerHistory = schedules.map((item) => ({ ...item, timekeeping: historyBySchedule.get(item.id) ?? item.timekeeping ?? null }));
  const active = pickActiveSchedule(withServerHistory);
  const phase = phaseOf(active);
  const submitCode = useCallback(async (raw: string) => {
    if (inFlight.current) return false;
    const match = SHIFT_QR.exec(raw.trim());
    if (!match) {
      setActionError({ message: 'Mã QR không hợp lệ. Hãy quét mã ca làm việc.', retryable: false });
      return false;
    }
    inFlight.current = true;
    setActionError(null);
    try {
      // QR chỉ cung cấp shift_id. Chỉ chấp nhận lịch được trả bởi API lịch cá nhân.
      const [rows, history] = await Promise.all([
        storeApi.getMySchedules({ from: today, to: today }),
        storeApi.getMyTimekeeping({ from: today, to: today }),
      ]);
      qc.setQueryData([...CHECKIN_KEY, 'schedules', today], rows);
      qc.setQueryData([...CHECKIN_KEY, 'history'], history);
      const matched = rows.find((row) => row.shiftId === Number(match[1]));
      if (!matched) {
        setActionError({ message: 'Không tìm thấy lịch làm việc phù hợp.', retryable: false });
        return false;
      }
      const serverRecord = history.find((item) => item.scheduleId === matched.id) ?? matched.timekeeping;
      await mutation.mutateAsync({ scheduleId: matched.id, out: Boolean(serverRecord?.checkIn && !serverRecord.checkOut) });
      return true;
    } catch (error) {
      setActionError(toFailure(error));
      return false;
    } finally {
      inFlight.current = false;
    }
  }, [mutation.mutateAsync, qc, today]);

  const failure = schedulesQ.error ?? historyQ.error;
  return {
    schedules: withServerHistory,
    history: historyQ.data ?? [],
    active,
    phase,
    isLoading: schedulesQ.isLoading || historyQ.isLoading,
    loadError: failure ? toFailure(failure) : null,
    reload: () => { void schedulesQ.refetch(); void historyQ.refetch(); },
    submitting: mutation.isPending,
    actionError,
    clearActionError: () => setActionError(null),
    submitCode,
  };
}
