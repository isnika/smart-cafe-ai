import type { ProductReviewView, ReviewStatus } from '@/shared/types';

/**
 * Review mẫu cho trang chi tiết món. Chỉ vài món có review; các món còn lại để trống để thử trạng thái "Chưa có đánh giá".
 *   - Món 1 (Cà phê sữa đá): 7 review Approved (2 trang khi pageSize = 5) + 1 review Hidden (không bao giờ được trả ra).
 *   - Món 2 (Bạc xỉu): 3 review, trong đó 1 review chỉ có điểm, không có nội dung.
 *   - Món 5 (Trà đào cam sả): 2 review.
 * Timestamp để dạng naive (UTC, không timezone) giống backend → http client phải chuẩn hoá.
 */
type Row = [productId: number, rating: number, authorName: string, comment: string | null, createdAt: string, status?: ReviewStatus];

const rows: Row[] = [
  [1, 5, 'Minh Anh', 'Đậm vị, ngọt vừa, uống rất đã.', '2026-10-28T09:15:00'],
  [1, 5, 'Quốc Bảo', 'Cà phê Robusta đúng chất Việt Nam, thêm trân châu rất hợp.', '2026-10-26T14:02:10'],
  [1, 4, 'Thuỳ Linh', 'Ngon nhưng hơi nhiều đá, lần sau mình sẽ chọn ít đá.', '2026-10-22T19:40:00'],
  [1, 5, 'Hoàng Nam', 'Pha nhanh, ly còn lạnh khi nhận.', '2026-10-18T08:05:00'],
  [1, 3, 'Phương Thảo', 'Ổn, hơi đắng so với khẩu vị của mình.', '2026-10-12T16:30:00'],
  [1, 4, 'Gia Huy', 'Size L uống đã, đáng tiền.', '2026-10-05T11:20:00'],
  [1, 5, 'Ngọc Hân', 'Kem cheese béo ngậy, mê luôn.', '2026-09-30T20:10:00'],
  [1, 1, 'Tài khoản ẩn', 'Nội dung này đã bị ẩn bởi quản lý.', '2026-10-29T10:00:00', 'Hidden'],
  [2, 5, 'Khánh Vy', 'Ngọt béo dễ uống, hợp người không quen cà phê đậm.', '2026-10-27T15:45:00'],
  [2, 4, 'Đức Minh', 'Sữa nhiều, thơm, hơi ngọt với mình.', '2026-10-20T09:00:00'],
  [2, 4, 'Bảo Châu', null, '2026-10-11T13:30:00'],
  [5, 5, 'Thanh Trúc', 'Trà thơm sả, đào giòn, rất mát.', '2026-10-25T17:20:00'],
  [5, 4, 'Anh Khoa', 'Ngon, nhưng topping đào hơi ít.', '2026-10-14T12:10:00'],
];

export const seedReviews = (): ProductReviewView[] =>
  rows.map(([productId, rating, authorName, comment, createdAt, status = 'Approved'], i) => ({
    id: i + 1,
    productId,
    userId: `review-user-${i + 1}`,
    orderItemId: 9000 + i + 1,
    rating,
    comment,
    status,
    moderatedBy: null,
    moderatedAt: null,
    createdAt,
    authorName,
  }));
