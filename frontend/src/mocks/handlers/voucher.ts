import { http, HttpResponse } from 'msw';
import type { ValidateVoucherInput, VoucherValidation } from '@/shared/types';
import { fail, guarded, readJson, url } from '../utils';

/**
 * Quy tắc voucher duy nhất của mock: GIAM10 = -10%, tối đa 30k, đơn tối thiểu 50k.
 * Dùng chung cho POST /engagement/vouchers/validate (xem trước ở giỏ hàng) và POST /orders-svc/orders
 * (server tính lại khi tạo đơn) để hai nơi không bao giờ lệch nhau.
 */
export function evaluateVoucher(code: string, net: number): VoucherValidation {
  if (code.trim().toUpperCase() !== 'GIAM10') {
    return { valid: false, discountAmount: 0, reason: 'NOT_FOUND', message: 'Mã giảm giá không tồn tại' };
  }
  if (net < 50_000) {
    return { valid: false, discountAmount: 0, reason: 'MIN_ORDER', message: 'Đơn tối thiểu 50.000đ để dùng mã GIAM10' };
  }
  return { valid: true, discountAmount: Math.min(Math.round(net * 0.1), 30_000) };
}

export const voucherHandlers = [
  // POST /engagement/vouchers/validate  { code, branchId, fulfillmentType, subTotal }
  http.post(
    url('/engagement/vouchers/validate'),
    guarded(async ({ request }) => {
      const input = await readJson<Partial<ValidateVoucherInput>>(request);
      if (!input.code?.trim()) fail(400, 'VALIDATION_ERROR', 'Thiếu mã giảm giá');
      if (!Number.isFinite(input.subTotal) || (input.subTotal ?? 0) < 0) fail(400, 'VALIDATION_ERROR', 'subTotal không hợp lệ');
      return HttpResponse.json(evaluateVoucher(input.code, input.subTotal!));
    }),
  ),
];
