import { http, HttpResponse } from 'msw';
import type { LeaveRequest, LeaveRequestStatus, LeaveType, Schedule, ScheduleView, Shift, StaffProfile, TimekeepingCheckInInput, TimekeepingCheckOutInput } from '@/shared/types';
import { db, nowNaive } from '../db';
import { fail, guarded, readJson, requireAuth, url } from '../utils';
import { MOCK_ACCOUNTS, accountFromRequest } from './identity';
import { BRANCH_ID } from '../fixtures';

export const workforceConfig = { enforceWindow: false };
const WINDOW_MS = 30 * 60_000;

function staffOf(request: Request): StaffProfile {
  requireAuth(request);
  const account = accountFromRequest(request);
  if (!account) fail(401, 'UNAUTHORIZED', 'Chưa đăng nhập hoặc token không hợp lệ');
  const staff = db.staffProfiles.find((s) => s.userId === account.id);
  if (!staff) fail(403, 'FORBIDDEN', 'Tài khoản này không phải nhân viên');
  return staff;
}

function currentStaff(request: Request): { account: NonNullable<ReturnType<typeof accountFromRequest>>; staff: StaffProfile } {
  requireAuth(request);
  const account = accountFromRequest(request);
  if (!account) fail(401, 'UNAUTHORIZED', 'Chưa đăng nhập hoặc token không hợp lệ');
  const staff = db.staffProfiles.find((s) => s.userId === account.id);
  if (!staff) fail(403, 'FORBIDDEN', 'Tài khoản này không phải nhân viên');
  return { account, staff };
}

function leaveView(request: LeaveRequest): LeaveRequest {
  const staff = db.staffProfiles.find((s) => s.id === request.staffId);
  const account = staff ? MOCK_ACCOUNTS.find((a) => a.id === staff.userId) : undefined;
  return { ...request, employeeCode: staff?.employeeCode ?? null, staff: { userInfo: { fullName: account?.fullName ?? null } } };
}

function nextLeaveId(): number {
  return Math.max(0, ...db.leaveRequests.map((r) => r.id)) + 1;
}

function leaveRequestById(id: number): LeaveRequest {
  const request = db.leaveRequests.find((r) => r.id === id);
  if (!request) fail(404, 'NOT_FOUND', 'Không tìm thấy yêu cầu nghỉ phép');
  return request;
}

function toView(s: Schedule): ScheduleView {
  const shift = db.shifts.find((x) => x.id === s.shiftId)!;
  const staff = db.staffProfiles.find((x) => x.id === s.staffId)!;
  return {
    ...s, shift, staff: { ...staff },
    staffName: MOCK_ACCOUNTS.find((a) => a.id === staff.userId)?.fullName ?? staff.employeeCode,
    employeeCode: staff.employeeCode, jobTitle: staff.jobTitle,
    timekeeping: db.timekeepings.find((t) => t.scheduleId === s.id) ?? null,
  };
}

function findSchedule(request: Request, scheduleId: number) {
  const staff = staffOf(request);
  const schedule = db.schedules.find((row) => row.id === scheduleId && row.staffId === staff.id);
  if (!schedule) fail(403, 'FORBIDDEN_SCHEDULE', 'Bạn không thể cập nhật lịch làm việc này');
  return { staff, schedule, shift: db.shifts.find((row) => row.id === schedule.shiftId)! };
}

function assertInWindow(shift: Shift, workDate: string): void {
  if (!workforceConfig.enforceWindow) return;
  const start = Date.parse(`${workDate}T${shift.startTime}+07:00`);
  const end = Date.parse(`${workDate}T${shift.endTime}+07:00`) + (shift.isOvernight ? 86_400_000 : 0);
  if (Date.now() < start - WINDOW_MS || Date.now() > end + WINDOW_MS) fail(409, 'OUT_OF_SHIFT_WINDOW', 'Ngoài khung giờ cho phép của ca');
}

export const workforceHandlers = [
  http.get(url('/leave-requests/me'), guarded(({ request }) => {
    const { staff } = currentStaff(request);
    const status = new URL(request.url).searchParams.get('status');
    return HttpResponse.json(db.leaveRequests.filter((r) => r.staffId === staff.id && (!status || r.status === status)).map(leaveView));
  })),

  http.post(url('/leave-requests'), guarded(async ({ request }) => {
    const { staff } = currentStaff(request);
    const input = await readJson<{ leave_type?: LeaveType; start_date?: string; end_date?: string; reason?: string }>(request);
    if (!['Annual', 'Sick', 'Unpaid', 'Other'].includes(input.leave_type ?? '') || !input.start_date || !input.end_date || input.start_date > input.end_date || !input.reason?.trim()) {
      fail(422, 'VALIDATION_ERROR', 'Loại nghỉ, khoảng ngày và lý do hợp lệ là bắt buộc');
    }
    const now = nowNaive();
    const created: LeaveRequest = {
      id: nextLeaveId(), staffId: staff.id, leaveType: input.leave_type!, startDate: input.start_date,
      endDate: input.end_date, reason: input.reason.trim(), status: 'Pending', approverStaffId: null,
      reviewedAt: null, createdAt: now, updatedAt: now,
    };
    db.leaveRequests.push(created);
    return HttpResponse.json(leaveView(created), { status: 201 });
  })),

  http.post(url('/leave-requests/:id/cancel'), guarded(({ request, params }) => {
    const { staff } = currentStaff(request);
    const row = leaveRequestById(Number(params.id));
    if (row.staffId !== staff.id) fail(403, 'FORBIDDEN', 'Không thể rút yêu cầu của nhân viên khác');
    if (row.status !== 'Pending') fail(409, 'INVALID_STATE_TRANSITION', 'Chỉ có thể rút yêu cầu đang chờ duyệt');
    row.status = 'Cancelled';
    row.updatedAt = nowNaive();
    return HttpResponse.json(leaveView(row));
  })),

  http.get(url('/leave-requests'), guarded(({ request }) => {
    requireAuth(request);
    const account = accountFromRequest(request);
    if (!account) fail(401, 'UNAUTHORIZED', 'Chưa đăng nhập hoặc token không hợp lệ');
    if (account.roleName !== 'Manager' && account.roleName !== 'Admin') fail(403, 'FORBIDDEN', 'Chỉ quản lý mới xem được yêu cầu nghỉ phép');
    const q = new URL(request.url).searchParams;
    const branchId = Number(q.get('branch_id') ?? BRANCH_ID);
    const status = q.get('status');
    if (status && !['Pending', 'Approved', 'Rejected', 'Cancelled'].includes(status)) fail(400, 'VALIDATION_ERROR', 'Trạng thái nghỉ phép không hợp lệ');
    const staffIds = new Set(db.staffProfiles.filter((s) => s.branchId === branchId).map((s) => s.id));
    return HttpResponse.json(db.leaveRequests.filter((r) => staffIds.has(r.staffId) && (!status || r.status === status)).map(leaveView));
  })),

  http.patch(url('/leave-requests/:id/decision'), guarded(async ({ request, params }) => {
    requireAuth(request);
    const account = accountFromRequest(request);
    if (!account) fail(401, 'UNAUTHORIZED', 'Chưa đăng nhập hoặc token không hợp lệ');
    if (account.roleName !== 'Manager' && account.roleName !== 'Admin') fail(403, 'FORBIDDEN', 'Chỉ quản lý mới xử lý yêu cầu nghỉ phép');
    const input = await readJson<{ status?: LeaveRequestStatus }>(request);
    if (input.status !== 'Approved' && input.status !== 'Rejected') fail(422, 'VALIDATION_ERROR', 'Quyết định phải là Approved hoặc Rejected');
    const row = leaveRequestById(Number(params.id));
    if (row.status !== 'Pending') fail(409, 'INVALID_STATE_TRANSITION', 'Yêu cầu nghỉ phép đã được xử lý');
    const manager = db.staffProfiles.find((s) => s.userId === account.id);
    row.status = input.status;
    row.approverStaffId = manager?.id ?? null;
    row.reviewedAt = nowNaive();
    row.updatedAt = row.reviewedAt;
    return HttpResponse.json(leaveView(row));
  })),

  http.get(url('/schedules/me'), guarded(({ request }) => {
    const staff = staffOf(request);
    const q = new URL(request.url).searchParams;
    const from = q.get('from'); const to = q.get('to');
    const rows = db.schedules.filter((s) => s.staffId === staff.id && (!from || s.workDate >= from) && (!to || s.workDate <= to));
    return HttpResponse.json(rows.map(toView));
  })),

  http.get(url('/timekeeping/me'), guarded(({ request }) => {
    const staff = staffOf(request);
    const q = new URL(request.url).searchParams;
    const from = q.get('from'); const to = q.get('to');
    const rows = db.timekeepings.filter((t) => {
      const schedule = db.schedules.find((s) => s.id === t.scheduleId);
      return schedule?.staffId === staff.id && (!from || schedule.workDate >= from) && (!to || schedule.workDate <= to);
    }).map((item) => {
      const schedule = db.schedules.find((s) => s.id === item.scheduleId)!;
      return { ...item, workDate: schedule.workDate, status: schedule.status };
    });
    return HttpResponse.json(rows);
  })),

  http.post(url('/timekeeping/check-in'), guarded(async ({ request }) => {
    const input = await readJson<{ schedule_id?: number; source?: TimekeepingCheckInInput['source'] }>(request);
    if (!Number.isInteger(input.schedule_id) || !['QR', 'Manual'].includes(input.source ?? '')) fail(422, 'VALIDATION_ERROR', 'schedule_id và source QR/Manual là bắt buộc');
    const { schedule, shift } = findSchedule(request, input.schedule_id!);
    assertInWindow(shift, schedule.workDate);
    let record = db.timekeepings.find((item) => item.scheduleId === schedule.id);
    if (record?.checkIn) fail(409, 'ALREADY_CHECKED_IN', 'Bạn đã check-in ca này rồi');
    if (!record) {
      record = { id: ++db.seq.timekeeping, scheduleId: schedule.id, checkIn: nowNaive(), checkOut: null, source: input.source!, isAdjusted: false, adjustedByStaffId: null, adjustmentReason: null };
      db.timekeepings.push(record);
    } else { record.checkIn = nowNaive(); record.source = input.source!; }
    return HttpResponse.json(record, { status: 200 });
  })),

  http.post(url('/timekeeping/check-out'), guarded(async ({ request }) => {
    const input = await readJson<{ schedule_id?: number } & Partial<TimekeepingCheckOutInput>>(request);
    if (!Number.isInteger(input.schedule_id)) fail(422, 'VALIDATION_ERROR', 'schedule_id là bắt buộc');
    const { schedule, shift } = findSchedule(request, input.schedule_id!);
    assertInWindow(shift, schedule.workDate);
    const record = db.timekeepings.find((item) => item.scheduleId === schedule.id);
    if (!record?.checkIn) fail(409, 'NOT_CHECKED_IN', 'Bạn chưa check-in ca này');
    if (record.checkOut) fail(409, 'ALREADY_CHECKED_OUT', 'Bạn đã check-out ca này rồi');
    record.checkOut = nowNaive();
    return HttpResponse.json(record);
  })),
];
