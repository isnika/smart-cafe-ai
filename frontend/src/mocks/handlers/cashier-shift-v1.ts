import { http } from 'msw';
import type { MockCashierShift } from '../db';
import { db, nowNaive } from '../db';
import { envelopeError, guardedV1, ok, readJson, requireAuth, url } from '../utils';
import { accountFromRequest } from './identity';

function currentStaff(request: Request) {
  requireAuth(request);
  const account = accountFromRequest(request);
  if (!account) return envelopeError(401, 'UNAUTHORIZED', 'Chưa đăng nhập hoặc token không hợp lệ');
  if (account.roleName !== 'Staff') return envelopeError(403, 'FORBIDDEN', 'Chỉ nhân viên thu ngân được thao tác ca');
  return account;
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const validMoney = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const publicShift = (shift: MockCashierShift) => ({
  id: shift.id,
  branchId: shift.branchId,
  registerCode: shift.registerCode,
  staffUserId: shift.staffUserId,
  openingTime: shift.openingTime,
  closingTime: shift.closingTime,
  openingCash: shift.openingCash,
  totalOrders: shift.totalOrders,
  totalCashSales: shift.totalCashSales,
  totalOnlineSales: shift.totalOnlineSales,
  totalCashRefunds: shift.totalCashRefunds,
  totalCashIn: shift.totalCashIn,
  totalCashOut: shift.totalCashOut,
  expectedCash: shift.expectedCash,
  closingCash: shift.closingCash,
  discrepancy: shift.discrepancy,
  status: shift.status,
});

export const cashierShiftV1Handlers = [
  http.post(url('/cashier-shifts/open'), guardedV1(async ({ request }) => {
    const staff = currentStaff(request);
    if (staff instanceof Response) return staff;
    const body: unknown = await readJson(request);
    if (!isRecord(body) || !Number.isSafeInteger(body.branch_id) || (body.branch_id as number) <= 0 ||
      body.register_code !== 'MAIN' || !validMoney(body.opening_cash)) {
      return envelopeError(400, 'VALIDATION_ERROR', 'branch_id, register_code=MAIN và opening_cash là bắt buộc');
    }
    const open = db.cashierShifts.find((shift) => shift.staffUserId === staff.id && shift.registerCode === 'MAIN' && shift.status === 'Open');
    if (open) return envelopeError(409, 'CONFLICT', 'Đã có ca thu ngân đang mở');

    const shift: MockCashierShift = {
      id: ++db.seq.cashierShift,
      branchId: body.branch_id as number,
      registerCode: 'MAIN',
      staffUserId: staff.id,
      openingTime: nowNaive(),
      closingTime: null,
      openingCash: body.opening_cash,
      totalOrders: 0,
      totalCashSales: 0,
      totalOnlineSales: 0,
      totalCashRefunds: 0,
      totalCashIn: 0,
      totalCashOut: 0,
      expectedCash: null,
      closingCash: null,
      discrepancy: null,
      status: 'Open',
    };
    db.cashierShifts.push(shift);
    return ok(publicShift(shift), null, { status: 201 });
  })),

  http.get(url('/cashier-shifts/current'), guardedV1(({ request }) => {
    const staff = currentStaff(request);
    if (staff instanceof Response) return staff;
    const shift = db.cashierShifts.find((entry) => entry.staffUserId === staff.id && entry.status === 'Open');
    if (!shift) return envelopeError(404, 'NOT_FOUND', 'Chưa có ca thu ngân đang mở');
    return ok(publicShift(shift));
  })),

  http.post(url('/cashier-shifts/:id/close'), guardedV1(async ({ request, params }) => {
    const staff = currentStaff(request);
    if (staff instanceof Response) return staff;
    const id = Number(params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return envelopeError(400, 'VALIDATION_ERROR', 'id không hợp lệ');
    const body: unknown = await readJson(request);
    if (!isRecord(body) || !validMoney(body.closing_cash)) {
      return envelopeError(400, 'VALIDATION_ERROR', 'closing_cash là số nguyên không âm');
    }
    const shift = db.cashierShifts.find((entry) => entry.id === id && entry.staffUserId === staff.id);
    if (!shift) return envelopeError(404, 'NOT_FOUND', 'Không tìm thấy ca thu ngân');
    if (shift.status !== 'Open') return envelopeError(409, 'CONFLICT', 'Ca thu ngân đã đóng');

    // Mock accounting data currently starts at zero; amounts are returned by mock server to the FE.
    shift.expectedCash = shift.openingCash + shift.totalCashSales - shift.totalCashRefunds + shift.totalCashIn - shift.totalCashOut;
    shift.closingCash = body.closing_cash;
    shift.discrepancy = shift.closingCash - shift.expectedCash;
    shift.closingTime = nowNaive();
    shift.status = 'Closed';
    return ok(publicShift(shift));
  })),
];
