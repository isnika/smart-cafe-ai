import { ApiError } from './http';
import type { CashierShift, CashierShiftStatus, CloseCashierShiftResponse } from './cashier-shift.types';

type Loose = Record<string, unknown>;
const isRecord = (value: unknown): value is Loose => value !== null && typeof value === 'object' && !Array.isArray(value);
const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) ? parsed : null;
};
const stringOrNull = (value: unknown): string | null => typeof value === 'string' && value !== '' ? value : null;
const invalid = (): ApiError => new ApiError(502, { code: 'INVALID_RESPONSE', message: 'Phản hồi Cashier Shift không hợp lệ' });

/** Mapper nhận payload đã camelCase từ http.ts và không tự tính tiền dự kiến/chênh lệch. */
export function toCashierShift(raw: unknown): CashierShift {
  const value = isRecord(raw) && isRecord(raw.cashierShift) ? raw.cashierShift : raw;
  if (!isRecord(value)) throw invalid();
  const id = numberOrNull(value.id ?? value.cashierShiftId);
  const openingCash = numberOrNull(value.openingCash);
  const status = value.status;
  if (id === null || openingCash === null || (status !== 'Open' && status !== 'Closed')) throw invalid();

  const count = (key: string): number | null => numberOrNull(value[key]);
  return {
    id,
    branchId: count('branchId'),
    registerCode: stringOrNull(value.registerCode),
    staffUserId: stringOrNull(value.staffUserId),
    openingTime: stringOrNull(value.openingTime),
    closingTime: stringOrNull(value.closingTime),
    openingCash,
    totalOrders: count('totalOrders'),
    totalCashSales: count('totalCashSales'),
    totalOnlineSales: count('totalOnlineSales'),
    totalCashRefunds: count('totalCashRefunds'),
    totalCashIn: count('totalCashIn'),
    totalCashOut: count('totalCashOut'),
    expectedCash: count('expectedCash'),
    closingCash: count('closingCash'),
    discrepancy: count('discrepancy'),
    status: status as CashierShiftStatus,
  };
}

export function toCloseCashierShiftResponse(raw: unknown): CloseCashierShiftResponse {
  const shift = toCashierShift(raw);
  return { cashierShift: shift, expectedCash: shift.expectedCash, discrepancy: shift.discrepancy };
}
