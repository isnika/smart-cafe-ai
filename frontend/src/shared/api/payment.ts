import type {
  CashMovement,
  CashMovementInput,
  CashierShift,
  CloseCashierShiftInput,
  CreateRefundInput,
  OpenCashierShiftInput,
  PayOrdersInput,
  PayResult,
  Refund,
} from '@/shared/types';
import { http } from './http';

const P = '/payment';

/** 1..N đơn; VNPay/Momo trả `redirectUrl`. */
export const payOrders = (input: PayOrdersInput) => http.post<PayResult>(`${P}/payments`, input);

// Cashier shift
export const getCurrentCashierShift = (branchId: number, registerCode?: string) =>
  http.get<CashierShift | null>(`${P}/cashier-shifts/current`, { query: { branchId, registerCode } });
export const openCashierShift = (input: OpenCashierShiftInput) => http.post<CashierShift>(`${P}/cashier-shifts`, input);
export const closeCashierShift = (id: number, input: CloseCashierShiftInput) =>
  http.post<CashierShift>(`${P}/cashier-shifts/${id}/close`, input);
export const listCashMovements = (shiftId: number) => http.get<CashMovement[]>(`${P}/cashier-shifts/${shiftId}/movements`);
export const addCashMovement = (shiftId: number, input: CashMovementInput) =>
  http.post<CashMovement>(`${P}/cashier-shifts/${shiftId}/movements`, input);

// Refund
export const createRefund = (input: CreateRefundInput) => http.post<Refund>(`${P}/refunds`, input);