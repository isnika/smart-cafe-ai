import type { Schedule, Shift, StaffProfile } from '@/shared/types';
import { BRANCH_ID } from './fixtures';

/** Múi giờ của chi nhánh seed (Branch.timezone mặc định). */
export const BRANCH_TZ = 'Asia/Ho_Chi_Minh';

/** Ngày hôm nay (YYYY-MM-DD) theo múi giờ chi nhánh. */
export const todayIn = (tz: string = BRANCH_TZ, at: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

/**
 * Seed Workforce: 2 ca của chi nhánh 1 + hồ sơ của tài khoản u-staff.
 * u-staff chỉ có lịch Ca sáng hôm nay → quét QR Ca chiều sẽ bị từ chối (không có lịch).
 */
export function buildWorkforceSeed(): { shifts: Shift[]; staffProfiles: StaffProfile[]; schedules: Schedule[] } {
  const shifts: Shift[] = [
    { id: 1, branchId: BRANCH_ID, name: 'Ca sáng', startTime: '06:00:00', endTime: '14:00:00', isOvernight: false, isActive: true },
    { id: 2, branchId: BRANCH_ID, name: 'Ca chiều', startTime: '14:00:00', endTime: '22:00:00', isOvernight: false, isActive: true },
  ];
  const at = '2026-01-01T00:00:00';
  const staffProfiles: StaffProfile[] = [
    {
      id: 1, userId: 'u-staff', branchId: BRANCH_ID, employeeCode: 'NV001', jobTitle: 'Barista',
      employmentType: 'Full_Time', hireDate: '2026-01-01', terminationDate: null, status: 'Active', createdAt: at, updatedAt: at,
    },
  ];
  const schedules: Schedule[] = [
    { id: 1, branchId: BRANCH_ID, staffId: 1, shiftId: 1, workDate: todayIn(), status: 'Scheduled' },
  ];
  return { shifts, staffProfiles, schedules };
}
