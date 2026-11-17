import type { IsoDateTime } from '@/shared/types';

export type CashierShiftStatus = 'Open' | 'Closed';

/** Cashier Shift là ca thu ngân, độc lập với Work Shift/Schedule. Tiền VND là số nguyên. */
export interface CashierShift {
  id: number;
  branchId: number | null;
  registerCode: string | null;
  staffUserId: string | null;
  openingTime: IsoDateTime | null;
  closingTime: IsoDateTime | null;
  openingCash: number;
  totalOrders: number | null;
  totalCashSales: number | null;
  totalOnlineSales: number | null;
  totalCashRefunds: number | null;
  totalCashIn: number | null;
  totalCashOut: number | null;
  expectedCash: number | null;
  closingCash: number | null;
  discrepancy: number | null;
  status: CashierShiftStatus;
}

export interface OpenCashierShiftRequest {
  branchId: number;
  openingCash: number;
}

export interface CloseCashierShiftRequest {
  closingCash: number;
}

export interface CloseCashierShiftResponse {
  cashierShift: CashierShift;
  expectedCash: number | null;
  discrepancy: number | null;
}
