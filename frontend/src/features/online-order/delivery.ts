import { isPhone, normalizePhone } from '@/features/auth/validators';
import type { DeliveryDetails } from './store';

export type DeliveryErrors = Partial<Record<keyof DeliveryDetails, string>>;

/** Trả {} khi hợp lệ. Quy tắc SĐT dùng chung với form đăng ký/đăng nhập. */
export function validateDelivery(d: DeliveryDetails): DeliveryErrors {
  const errors: DeliveryErrors = {};
  if (d.receiverName.trim().length < 2) errors.receiverName = 'Vui lòng nhập tên người nhận';
  if (!d.phone.trim()) errors.phone = 'Vui lòng nhập số điện thoại';
  else if (!isPhone(d.phone)) errors.phone = 'Số điện thoại không hợp lệ (vd: 0901234567)';
  if (d.addressLine.trim().length < 8) errors.addressLine = 'Vui lòng nhập địa chỉ đầy đủ (số nhà, đường, phường)';
  return errors;
}

export const normalizeDelivery = (d: DeliveryDetails): DeliveryDetails => ({
  receiverName: d.receiverName.trim(),
  phone: normalizePhone(d.phone),
  addressLine: d.addressLine.trim(),
});

export interface InvoiceDraft {
  enabled: boolean;
  /** "Mã số thuế & Thông tin công ty" – một ô theo thiết kế. */
  companyInfo: string;
}

export function validateInvoice(i: InvoiceDraft): string | undefined {
  if (i.enabled && i.companyInfo.trim().length < 5) return 'Vui lòng nhập mã số thuế và thông tin công ty';
}
