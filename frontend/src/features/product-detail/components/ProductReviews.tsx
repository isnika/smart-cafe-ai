import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { engagementApi } from '@/shared/api';

export function ProductReviews({ productId }: { productId: number }) {
  const [page, setPage] = useState(1);
  const reviews = useQuery({
    queryKey: ['reviews', 'product', productId, page],
    queryFn: ({ signal }) => engagementApi.listProductReviews(productId, page, signal),
  });
  return (
    <section aria-labelledby="reviews-title" className="rounded-lg border border-primary-100 bg-white p-4">
      <h2 id="reviews-title" className="text-body-lg font-semibold">Đánh giá</h2>
      <p className="mt-1 text-caption text-gray-500">Bạn có thể đánh giá món trong chi tiết đơn hàng đã hoàn tất.</p>
      {reviews.isPending && <p role="status">Đang tải đánh giá…</p>}
      {reviews.isError && <div role="alert"><p>Không tải được đánh giá.</p><button type="button" className="text-primary-600 underline" onClick={() => void reviews.refetch()}>Thử lại</button></div>}
      {reviews.data && reviews.data.total === 0 && <p className="mt-3 text-body text-gray-500">Chưa có đánh giá.</p>}
      {reviews.data && reviews.data.items.length > 0 && <>
        <p className="mt-2 text-caption text-gray-500">{reviews.data.total} đánh giá</p>
        <ul aria-label="Danh sách đánh giá" className="divide-y divide-gray-100">
          {reviews.data.items.map((review) => <li key={review.id} className="py-3">
            <p className="font-semibold text-primary-700" aria-label={`${review.rating} trên 5 sao`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p>
            <p className="text-caption text-gray-500">Khách hàng · {new Date(review.createdAt).toLocaleDateString('vi-VN')}</p>
            {review.comment && <p className="mt-1 whitespace-pre-wrap break-words text-body">{review.comment}</p>}
          </li>)}
        </ul>
        <div className="flex items-center justify-between text-body">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="text-primary-600 disabled:text-gray-400">Trang trước</button>
          <span>Trang {page}</span>
          <button type="button" disabled={page * reviews.data.pageSize >= reviews.data.total} onClick={() => setPage(page + 1)} className="text-primary-600 disabled:text-gray-400">Trang sau</button>
        </div>
      </>}
    </section>
  );
}
