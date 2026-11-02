import { isApiError, API_ERROR_CODES } from '@/shared/api';
import { parseUtc } from '@/shared/lib';
import type { IsoDate, ScheduleView, TimeOfDay } from '@/shared/types';

/** Ngày hôm nay (YYYY-MM-DD) theo múi giờ của chi nhánh. */
export const todayInTz = (tz = 'Asia/Ho_Chi_Minh', at: Date = new Date()): IsoDate =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

export type CheckinPhase = 'none' | 'ready' | 'in' | 'done';

/** Lịch cần hiển thị: ca đang làm dở > ca chưa vào > ca đã xong gần nhất. */
export function pickActiveSchedule(rows: ScheduleView[]): ScheduleView | null {
  const inProgress = rows.find((r) => r.timekeeping?.checkIn && !r.timekeeping.checkOut);
  if (inProgress) return inProgress;
  const pending = rows.find((r) => !r.timekeeping?.checkIn);
  if (pending) return pending;
  return rows.at(-1) ?? null;
}

export function phaseOf(schedule: ScheduleView | null): CheckinPhase {
  if (!schedule) return 'none';
  const tk = schedule.timekeeping;
  if (!tk?.checkIn) return 'ready';
  return tk.checkOut ? 'done' : 'in';
}

/** "06:00:00" → "06:00" */
export const hhmm = (t: TimeOfDay): string => t.slice(0, 5);

const timeFmt = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
const dateFmt = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Giờ theo múi giờ của người dùng (parseUtc coi timestamp thiếu timezone là UTC). */
export function formatClock(value: string | null | undefined): string {
  const d = parseUtc(value);
  return d ? `${timeFmt.format(d)} • ${dateFmt.format(d)}` : '—';
}

/** "7 giờ 44 phút" */
export function workedDuration(checkIn: string | null | undefined, checkOut: string | null | undefined): string | null {
  const a = parseUtc(checkIn);
  const b = parseUtc(checkOut);
  if (!a || !b) return null;
  const minutes = Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} giờ ${m} phút` : `${m} phút`;
}

export interface CheckinFailure {
  message: string;
  /** true → lỗi mạng/máy chủ: hiện nút thử lại. */
  retryable: boolean;
}

const MESSAGES: Record<string, string> = {
  INVALID_QR: 'Mã QR không hợp lệ. Kiểm tra lại mã in tại quầy.',
  SHIFT_NOT_FOUND: 'Mã QR không hợp lệ. Kiểm tra lại mã in tại quầy.',
  WRONG_BRANCH: 'Mã QR này không thuộc chi nhánh của bạn.',
  NO_SCHEDULE: 'Bạn không có lịch làm ca này hôm nay.',
  OUT_OF_SHIFT_WINDOW: 'Ngoài khung giờ cho phép của ca (±30 phút so với lịch làm việc).',
  ALREADY_CHECKED_IN: 'Bạn đã check-in ca này rồi.',
  ALREADY_CHECKED_OUT: 'Bạn đã check-out ca này rồi.',
  NOT_CHECKED_IN: 'Bạn chưa check-in ca này nên chưa thể check-out.',
};

export function toFailure(e: unknown): CheckinFailure {
  if (isApiError(e)) {
    if (e.status === 0 || e.code === API_ERROR_CODES.NETWORK_ERROR) {
      return { message: 'Không thể kết nối tới máy chủ. Kiểm tra mạng rồi thử lại.', retryable: true };
    }
    const known = e.code ? MESSAGES[e.code] : undefined;
    return { message: known ?? e.message, retryable: e.status >= 500 };
  }
  return { message: 'Có lỗi xảy ra, vui lòng thử lại.', retryable: true };
}
