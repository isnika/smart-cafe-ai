import type {
  LoyaltyCard,
  LoyaltyTransaction,
  Notification,
  Page,
  PageParams,
  ProductReviewPage,
  ValidateVoucherInput,
  VoucherValidation,
} from '@/shared/types';
import { http } from './http';

const P = '/engagement';

// Loyalty uses the gateway's /api/v1/loyalty routes. The response is the card itself.
export const getLoyaltySummary = () => http.get<LoyaltyCard>('/loyalty/me');
export const getLoyaltyTransactions = async (page = 1, size = 20): Promise<Page<LoyaltyTransaction>> => {
  const { data, meta } = await http.getWithMeta<LoyaltyTransaction[]>('/loyalty/me/transactions', { query: { page, size } });
  return { items: data, total: meta?.total ?? data.length, page: meta?.page ?? page, pageSize: meta?.size ?? size };
};

// Voucher
export const validateVoucher = (input: ValidateVoucherInput) => http.post<VoucherValidation>(`${P}/vouchers/validate`, input);

// Notification
export const listNotifications = async (params: PageParams & { type?: string; unreadOnly?: boolean } = {}): Promise<Page<Notification>> => {
  const page = params.page ?? 1;
  const size = params.pageSize ?? 20;
  const { data, meta } = await http.getWithMeta<Notification[]>('/notifications/me', {
    query: { page, size, type: params.type, is_read: params.unreadOnly ? false : undefined, sort: 'created_at,desc' },
  });
  return { items: data ?? [], total: meta?.total ?? data?.length ?? 0, page: meta?.page ?? page, pageSize: meta?.size ?? size };
};
export const markNotificationRead = (id: number) => http.patch<{ id: number; isRead: boolean }>(`/notifications/${id}/read`, { is_read: true });
export const markAllNotificationsRead = () => http.post<{ updatedCount: number }>('/notifications/read-all');

// Review (chỉ đọc – tạo review chưa có input type). Chỉ trả review Approved + điểm trung bình (xem ProductReviewPage).
export const listProductReviews = (productId: number, params: PageParams = {}) =>
  http.get<ProductReviewPage>(`${P}/products/${productId}/reviews`, { query: params, auth: false });
