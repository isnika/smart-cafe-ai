import type {
  LoyaltySummary,
  Notification,
  Page,
  PageParams,
  ProductReview,
  ValidateVoucherInput,
  VoucherValidation,
} from '@/shared/types';
import { http } from './http';

const P = '/engagement';

// Loyalty
export const getLoyaltySummary = () => http.get<LoyaltySummary>(`${P}/loyalty/me`);

// Voucher
export const validateVoucher = (input: ValidateVoucherInput) => http.post<VoucherValidation>(`${P}/vouchers/validate`, input);

// Notification
export const listNotifications = (params: PageParams & { type?: string; unreadOnly?: boolean } = {}) =>
  http.get<Page<Notification>>(`${P}/notifications`, { query: params });
export const markNotificationRead = (id: number) => http.post<Notification>(`${P}/notifications/${id}/read`);
export const markAllNotificationsRead = () => http.post<void>(`${P}/notifications/read-all`);

// Review (chỉ đọc – tạo review chưa có input type)
export const listProductReviews = (productId: number, params: PageParams = {}) =>
  http.get<Page<ProductReview>>(`${P}/products/${productId}/reviews`, { query: params, auth: false });