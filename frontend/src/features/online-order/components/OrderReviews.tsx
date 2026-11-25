import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MessageSquareText, Star } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { engagementApi, isApiError } from '@/shared/api';
import type { OrderItemDetail, ProductReview } from '@/shared/types';
import { Button } from '@/shared/ui';

const RATING_LABELS = ['', 'Rất không hài lòng', 'Chưa hài lòng', 'Bình thường', 'Hài lòng', 'Rất hài lòng'];

function ReviewItem({ item, existing, userId }: { item: OrderItemDetail; existing?: ProductReview; userId: string }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const client = useQueryClient();
  const create = useMutation({
    mutationFn: () => engagementApi.createReview({ orderItemId: item.id, productId: item.productId, rating, comment: comment.trim() || null }),
    onSuccess: (review) => {
      client.setQueryData<ProductReview[]>(['reviews', 'mine', userId], (old) => [...(old ?? []), review]);
      void client.invalidateQueries({ queryKey: ['reviews', 'product', item.productId] });
      setOpen(false);
    },
    onError: (error) => { if (isApiError(error) && error.status === 409) void client.invalidateQueries({ queryKey: ['reviews', 'mine', userId] }); },
  });
  const status = existing?.status === 'Approved' ? 'Đã hiển thị' : existing?.status === 'Hidden' ? 'Đã ẩn' : 'Chờ duyệt';
  const previewRating = hoverRating || rating;
  return <li className="border-t border-primary-100 py-4 first:border-t-0 first:pt-0 last:pb-0">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-heading text-body-lg font-semibold text-gray-900">{item.productName}</p>
        {item.variantName !== 'Standard' && <p className="mt-0.5 text-caption text-gray-500">{item.variantName}</p>}
      </div>
      {existing && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary-50 px-2.5 py-1 text-caption text-secondary-800"><CheckCircle2 className="size-3.5" aria-hidden /> Đã gửi</span>}
    </div>
    {existing ? <div className="mt-3">
      <div className="flex gap-0.5" aria-hidden>{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={n <= existing.rating ? 'size-4 fill-amber-400 text-amber-400' : 'size-4 text-gray-300'} />)}</div>
      <p className="mt-1 text-caption text-gray-600">Đã đánh giá {existing.rating}/5 sao · {status}</p>
    </div> : <>
      {!open && <Button variant="outline" size="sm" className="mt-3 border-primary-200 text-primary-700" leftIcon={<Star className="size-4" aria-hidden />} onClick={() => setOpen(true)}>Đánh giá {item.productName}</Button>}
      {open && <form className="mt-4 rounded-lg border border-primary-100 bg-primary-50/60 p-4 sm:p-5" onSubmit={(e) => { e.preventDefault(); if (rating && !create.isPending) create.mutate(); }}>
        <fieldset disabled={create.isPending}>
          <legend className="text-body font-semibold text-gray-900">Bạn thấy món này thế nào?</legend>
          <div className="mt-2 flex items-center gap-1" onMouseLeave={() => setHoverRating(0)}>
            {[1, 2, 3, 4, 5].map((n) => <label key={n} onMouseEnter={() => setHoverRating(n)} className="flex size-11 cursor-pointer items-center justify-center rounded-md transition-transform hover:scale-110 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary-600">
              <input type="radio" className="sr-only" aria-label={`${n} sao`} name={`rating-${item.id}`} value={n} checked={rating === n} onChange={() => setRating(n)} />
              <Star aria-hidden className={`size-8 transition-colors ${n <= previewRating ? 'fill-amber-400 text-amber-400' : 'fill-white text-gray-300'}`} strokeWidth={1.7} />
            </label>)}
          </div>
          <p className="mt-1 min-h-5 text-body font-medium text-primary-700" aria-live="polite">{previewRating ? RATING_LABELS[previewRating] : 'Chạm vào sao để đánh giá'}</p>
        </fieldset>
        <div className="mt-4">
          <label className="flex items-center gap-1.5 text-body font-semibold text-gray-900" htmlFor={`comment-${item.id}`}><MessageSquareText className="size-4 text-primary-600" aria-hidden /> Nhận xét <span className="font-normal text-gray-500">(không bắt buộc)</span></label>
          <textarea id={`comment-${item.id}`} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={10000} disabled={create.isPending} placeholder="Chia sẻ cảm nhận của bạn về món này..." className="mt-2 w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-2.5 text-body text-gray-900 outline-none placeholder:text-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 disabled:opacity-60" rows={3} />
        </div>
        {create.isError && <p role="alert" className="mt-2 rounded-md bg-error-soft px-3 py-2 text-body text-error-strong">{isApiError(create.error) && create.error.status === 403 ? 'Chưa xác thực được lượt mua. Vui lòng thử lại sau hoặc liên hệ quán.' : isApiError(create.error) ? create.error.message : 'Không gửi được đánh giá. Vui lòng thử lại.'}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2"><Button type="submit" disabled={!rating} loading={create.isPending}>{create.isPending ? 'Đang gửi…' : 'Gửi đánh giá'}</Button><Button variant="ghost" disabled={create.isPending} onClick={() => { setOpen(false); setHoverRating(0); }}>Đóng</Button></div>
      </form>}
    </>}
  </li>;
}

export function OrderReviews({ items }: { items: OrderItemDetail[] }) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const reviews = useQuery({ queryKey: ['reviews', 'mine', userId], enabled: userId !== null, queryFn: ({ signal }) => engagementApi.listMyReviews(signal) });
  if (!userId || items.length === 0) return null;
  return <section aria-labelledby="order-reviews-title" className="rounded-lg border border-primary-100 bg-white p-4 shadow-card sm:p-5">
    <div className="mb-4 flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-600"><Star className="size-5" aria-hidden /></span>
      <div><h2 id="order-reviews-title" className="font-heading text-body-lg font-semibold text-gray-900">Đánh giá món</h2>
        <p className="mt-1 text-caption leading-relaxed text-gray-600">Chia sẻ cảm nhận của bạn. Mỗi món trong đơn được đánh giá một lần và hiển thị ngay.</p></div>
    </div>
    {reviews.isPending && <p role="status">Đang tải đánh giá của bạn…</p>}
    {reviews.isError && <div role="alert">Không tải được đánh giá của bạn. <button type="button" className="text-primary-600 underline" onClick={() => void reviews.refetch()}>Thử lại</button></div>}
    {reviews.data && <ul>{items.map((item) => <ReviewItem key={item.id} item={item} userId={userId} existing={reviews.data.find((r) => r.orderItemId === item.id)} />)}</ul>}
  </section>;
}
