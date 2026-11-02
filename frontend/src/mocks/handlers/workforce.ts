import { http, HttpResponse } from 'msw';
import type { Schedule, ScheduleView, Shift, StaffProfile, Timekeeping, TimekeepingScanInput } from '@/shared/types';
import { db, nowNaive } from '../db';
import { BRANCH_TZ, todayIn } from '../workforce-seed';
import { fail, guarded, readJson, requireAuth, url } from '../utils';
import { MOCK_ACCOUNTS, accountFromRequest } from './identity';

/** Chỉnh lúc runtime qua `__mock.workforce` (xem browser.ts). */
export const workforceConfig = {
  /** true → chỉ cho check-in/out trong khung [giờ bắt đầu − 30', giờ kết thúc + 30'] (theo bản thiết kế: "trong ±30 phút"). Mặc định tắt để demo ngoài giờ ca. */
  enforceWindow: false,
};
const WINDOW_MS = 30 * 60_000;
const QR_TOKEN = /^shift-qr:(\d+)$/;

/** Hồ sơ nhân viên của người gọi (token → account → StaffProfile). */
function staffOf(request: Request): StaffProfile {
  requireAuth(request);
  const account = accountFromRequest(request);
  if (!account) fail(401, 'UNAUTHORIZED', 'Chưa đăng nhập hoặc token không hợp lệ');
  const staff = db.staffProfiles.find((s) => s.userId === account.id);
  if (!staff) fail(403, 'NOT_STAFF', 'Tài khoản này không phải nhân viên của chi nhánh nào');
  return staff;
}

/** Mốc thời gian (ms UTC) của "HH:mm:ss" trong ngày workDate theo múi giờ chi nhánh (UTC+7, không DST). */
const at = (workDate: string, time: string, extraDays = 0) =>
  Date.parse(`${workDate}T${time}+07:00`) + extraDays * 86_400_000;

function assertInWindow(shift: Shift, workDate: string): void {
  if (!workforceConfig.enforceWindow) return;
  const start = at(workDate, shift.startTime);
  const end = at(workDate, shift.endTime, shift.isOvernight ? 1 : 0);
  const now = Date.now();
  if (now < start - WINDOW_MS || now > end + WINDOW_MS) {
    fail(422, 'OUT_OF_SHIFT_WINDOW', 'Ngoài khung giờ cho phép của ca (±30 phút so với lịch làm việc)');
  }
}

/** Xác định (nhân viên, ca, lịch hôm nay) từ qrToken; ném lỗi đúng nghiệp vụ. */
function resolveScan(request: Request, input: Partial<TimekeepingScanInput>) {
  const staff = staffOf(request);
  const match = QR_TOKEN.exec(input.qrToken?.trim() ?? '');
  if (!match) fail(400, 'INVALID_QR', 'Mã QR không hợp lệ');
  const shift = db.shifts.find((s) => s.id === Number(match[1]));
  if (!shift || !shift.isActive) fail(404, 'SHIFT_NOT_FOUND', 'Mã QR không hợp lệ');
  if (shift.branchId !== staff.branchId) fail(403, 'WRONG_BRANCH', 'Mã QR không thuộc chi nhánh của bạn');
  const workDate = todayIn(BRANCH_TZ);
  const schedule = db.schedules.find((s) => s.staffId === staff.id && s.shiftId === shift.id && s.workDate === workDate);
  if (!schedule) fail(403, 'NO_SCHEDULE', `Bạn không có lịch làm ${shift.name} hôm nay`);
  assertInWindow(shift, workDate);
  return { schedule, shift, record: db.timekeepings.find((t) => t.scheduleId === schedule.id) };
}

function toView(s: Schedule): ScheduleView {
  const shift = db.shifts.find((x) => x.id === s.shiftId)!;
  const staff = db.staffProfiles.find((x) => x.id === s.staffId)!;
  return {
    ...s, shift, staffName: MOCK_ACCOUNTS.find((a) => a.id === staff.userId)?.fullName ?? staff.employeeCode, employeeCode: staff.employeeCode, jobTitle: staff.jobTitle,
    timekeeping: db.timekeepings.find((t) => t.scheduleId === s.id) ?? null,
  };
}

export const workforceHandlers = [
  // GET /store/branches/:id/shifts → ca đang dùng của chi nhánh
  http.get(
    url('/store/branches/:id/shifts'),
    guarded(({ request, params }) => {
      requireAuth(request);
      const branchId = Number(params.id);
      return HttpResponse.json(db.shifts.filter((s) => s.branchId === branchId && s.isActive));
    }),
  ),

  // GET /store/schedules?branchId&staffId&from&to → lịch + chấm công. Thiếu staffId thì mặc định là chính người gọi.
  http.get(
    url('/store/schedules'),
    guarded(({ request }) => {
      const staff = staffOf(request);
      const q = new URL(request.url).searchParams;
      const staffId = q.has('staffId') ? Number(q.get('staffId')) : staff.id;
      const branchId = q.has('branchId') ? Number(q.get('branchId')) : staff.branchId;
      const from = q.get('from');
      const to = q.get('to');
      const rows = db.schedules.filter(
        (s) => s.staffId === staffId && s.branchId === branchId && (!from || s.workDate >= from) && (!to || s.workDate <= to),
      );
      return HttpResponse.json(rows.map(toView));
    }),
  ),

  // POST /store/timekeeping/check-in  { qrToken: "shift-qr:<shiftId>" }
  http.post(
    url('/store/timekeeping/check-in'),
    guarded(async ({ request }) => {
      const { schedule, record } = resolveScan(request, await readJson<Partial<TimekeepingScanInput>>(request));
      if (record?.checkIn) fail(409, 'ALREADY_CHECKED_IN', 'Bạn đã check-in ca này rồi');
      const created: Timekeeping = {
        id: ++db.seq.timekeeping, scheduleId: schedule.id, checkIn: nowNaive(), checkOut: null,
        source: 'QR', isAdjusted: false, adjustedByStaffId: null, adjustmentReason: null,
      };
      db.timekeepings.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
  ),

  // POST /store/timekeeping/check-out  { qrToken }
  http.post(
    url('/store/timekeeping/check-out'),
    guarded(async ({ request }) => {
      const { record } = resolveScan(request, await readJson<Partial<TimekeepingScanInput>>(request));
      if (!record?.checkIn) fail(409, 'NOT_CHECKED_IN', 'Bạn chưa check-in ca này');
      if (record.checkOut) fail(409, 'ALREADY_CHECKED_OUT', 'Bạn đã check-out ca này rồi');
      record.checkOut = nowNaive();
      return HttpResponse.json(record);
    }),
  ),
];
