import { ApiError, http } from './http';
import { toCashierShift, toCloseCashierShiftResponse } from './cashier-shift.mapper';
import type { CashierShift, CloseCashierShiftRequest, CloseCashierShiftResponse, OpenCashierShiftRequest } from './cashier-shift.types';

/** Phân biệt duy nhất 404 di GET current với mọi lỗi API khác. */
export class NoOpenCashierShiftError extends Error {
  readonly status = 404;
  readonly apiError: ApiError;

  constructor(apiError: ApiError) {
    super('Chưa có ca thu ngân đang mở');
    this.name = 'NoOpenCashierShiftError';
    this.apiError = apiError;
  }
}

export async function getCurrentCashierShift(): Promise<CashierShift> {
  try {
    return toCashierShift(await http.get<unknown>('/cashier-shifts/current'));
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 404) throw new NoOpenCashierShiftError(error);
    throw error;
  }
}

export async function openCashierShift(input: OpenCashierShiftRequest): Promise<CashierShift> {
  return toCashierShift(await http.post<unknown>('/cashier-shifts/open', {
    branchId: input.branchId,
    registerCode: 'MAIN',
    openingCash: input.openingCash,
  }, { snake: true }));
}

export async function closeCashierShift(id: number, input: CloseCashierShiftRequest): Promise<CloseCashierShiftResponse> {
  return toCloseCashierShiftResponse(await http.post<unknown>(`/cashier-shifts/${id}/close`, input, { snake: true }));
}
