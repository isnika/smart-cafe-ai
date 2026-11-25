import type {
  LoyaltyCard,
  LoyaltyTransaction,
  Notification,
  Page,
  PageParams,
  ProductReview,
  ReviewStatus,
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

export async function listProductReviews(productId: number, page = 1, signal?: AbortSignal): Promise<Page<ProductReview>> {
  const size = 5;
  const { data, meta } = await http.getWithMeta<ProductReview[]>('/reviews', { query: { product_id: productId, page, size }, auth: false, signal });
  return { items: data ?? [], total: meta?.total ?? 0, page: meta?.page ?? page, pageSize: meta?.size ?? size };
}

export async function listMyReviews(signal?: AbortSignal): Promise<ProductReview[]> {
  const all: ProductReview[] = [];
  let page = 1;
  for (;;) {
    const { data, meta } = await http.getWithMeta<ProductReview[]>('/reviews/me', { query: { page, size: 100 }, signal });
    const items = data ?? [];
    all.push(...items);
    if (items.length === 0 || all.length >= (meta?.total ?? all.length)) return all;
    page++;
  }
}

export const createReview = (input: { orderItemId: number; productId: number; rating: number; comment: string | null }) =>
  http.post<ProductReview>('/reviews', input, { snake: true });

export async function listAdminReviews(page: number, status?: ReviewStatus, signal?: AbortSignal): Promise<Page<ProductReview>> {
  const size = 20;
  const { data, meta } = await http.getWithMeta<ProductReview[]>('/reviews/admin', { query: { page, size, status }, signal });
  return { items: data ?? [], total: meta?.total ?? 0, page: meta?.page ?? page, pageSize: meta?.size ?? size };
}
export const moderateReview = (id: number, status: 'Approved' | 'Hidden') => http.patch<ProductReview>(`/reviews/${id}/status`, { status });
