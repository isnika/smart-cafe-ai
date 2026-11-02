import type { AIRecommendation, RecommendationType } from '@/shared/types';
import { BRANCH_ID } from './fixtures';

/** Id tài khoản khách seed trong handlers/identity.ts (khách thứ hai để kiểm tra cô lập dữ liệu giữa hai người). */
export const RECO_CUSTOMER_ID = 'u-customer';
export const RECO_CUSTOMER2_ID = 'u-customer2';
export const RECO_MODEL_VERSION = 'mock-reco-v1';

const DAY = 24 * 60 * 60 * 1000;
/** Backend lưu datetime không kèm timezone (UTC) → trả đúng dạng đó để normalizeTimestamps chạy thật. */
const naive = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString().slice(0, 19);

type Row = [id: number, userId: string, productId: number, type: RecommendationType, score: number, reason: string | null, expiresInMs: number];

/**
 * Gợi ý AI theo từng người dùng. `productId` trỏ tới sản phẩm của catalog fixtures (fixtures.ts), KHÔNG nhân bản dữ liệu món:
 * handler ghép `product` từ cùng nguồn với GET /catalog/products nên giá/hết hàng luôn khớp menu.
 * Có chủ ý vài dòng để handler phải lọc: món hết hàng (4), món không còn bán (8), gợi ý đã hết hạn (id 7).
 * Người dùng không có dòng nào (tài khoản mới, nhân viên…) → API trả [] = "AI đang học dữ liệu".
 */
const ROWS: Row[] = [
  [1, RECO_CUSTOMER_ID, 5, 'Personalized', 0.92, 'Hợp khẩu vị thích đồ uống trái cây thanh mát', 7 * DAY],
  [2, RECO_CUSTOMER_ID, 7, 'Cross_Sell', 0.88, 'Gọi kèm với cà phê rất hợp vị', 7 * DAY],
  [3, RECO_CUSTOMER_ID, 2, 'Personalized', 0.81, 'Vị béo ngọt dễ uống, cùng gu với món bạn hay chọn', 7 * DAY],
  [4, RECO_CUSTOMER_ID, 6, 'Trending', 0.74, 'Đang được nhiều khách chọn trong tuần này', 7 * DAY],
  [5, RECO_CUSTOMER_ID, 3, 'Up_Sell', 0.66, null, 7 * DAY], // không có lý do: UI không được tự bịa
  [6, RECO_CUSTOMER_ID, 4, 'Personalized', 0.95, 'Món mới hợp khẩu vị của bạn', 7 * DAY], // Matcha hết hàng → bị lọc
  [7, RECO_CUSTOMER_ID, 1, 'Personalized', 0.9, 'Gợi ý đã hết hạn', -DAY], // hết hạn → bị lọc
  [8, RECO_CUSTOMER_ID, 8, 'Trending', 0.7, 'Combo không còn bán', 7 * DAY], // không còn variant Active → bị lọc
  [9, RECO_CUSTOMER2_ID, 1, 'Personalized', 0.9, 'Bạn có vẻ thích vị cà phê đậm và béo', 7 * DAY],
  [10, RECO_CUSTOMER2_ID, 7, 'Cross_Sell', 0.8, 'Món ăn nhẹ đi cùng đồ uống', 7 * DAY],
  [11, RECO_CUSTOMER2_ID, 5, 'Trending', 0.7, 'Đang được nhiều khách chọn trong tuần này', 7 * DAY],
];

export const buildRecommendationSeed = (): AIRecommendation[] =>
  ROWS.map(([id, userId, productId, recommendationType, confidenceScore, reason, expiresInMs]) => ({
    id, userId, branchId: BRANCH_ID, productId, recommendationType, confidenceScore, reason,
    modelVersion: RECO_MODEL_VERSION,
    expiresAt: naive(expiresInMs),
    clickedAt: null, purchasedAt: null, orderId: null,
    createdAt: naive(-DAY),
  }));
