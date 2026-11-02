import { CalendarDays } from 'lucide-react';
import { Badge } from '@/shared/ui';
import type { ScheduleView, Shift } from '@/shared/types';
import { formatClock, hhmm, workedDuration, type CheckinPhase } from '../model';

const BADGE: Record<CheckinPhase, { tone: 'neutral' | 'success' | 'info'; text: string }> = {
  none: { tone: 'neutral', text: 'Chưa có lịch' },
  ready: { tone: 'neutral', text: 'Chưa vào ca' },
  in: { tone: 'success', text: 'ĐÃ VÀO CA' },
  done: { tone: 'info', text: 'Đã check-out' },
};

export function ShiftSummary({ schedule, shift, phase }: { schedule: ScheduleView; shift: Shift; phase: CheckinPhase }) {
  const tk = schedule.timekeeping;
  const badge = BADGE[phase];
  const total = phase === 'done' ? workedDuration(tk?.checkIn, tk?.checkOut) : null;
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-caption text-gray-500">
            <CalendarDays className="size-4" aria-hidden />
            Hôm nay
          </p>
          <h2 className="text-h3">{shift.name}</h2>
          <p className="text-body text-gray-600">
            {hhmm(shift.startTime)} – {hhmm(shift.endTime)}
          </p>
        </div>
        <Badge tone={badge.tone}>{badge.text}</Badge>
      </div>
      {tk?.checkIn && (
        <dl className="space-y-1 rounded-md bg-gray-50 p-3 text-body">
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">Giờ vào</dt>
            <dd className="font-semibold text-gray-900">{formatClock(tk.checkIn)}</dd>
          </div>
          {tk.checkOut && (
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Giờ ra</dt>
              <dd className="font-semibold text-gray-900">{formatClock(tk.checkOut)}</dd>
            </div>
          )}
          {total && (
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Tổng thời gian làm</dt>
              <dd className="font-semibold text-gray-900">{total}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
