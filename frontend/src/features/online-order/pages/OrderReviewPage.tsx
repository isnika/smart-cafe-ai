import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Coffee, Star } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { useAuthStore } from '@/features/auth/store';
import { PageHeader } from '@/features/dine-in/components/PageHeader';
import { engagementApi, isApiError, myOrderApi } from '@/shared/api';
import type { OrderItemDetail, ProductReview } from '@/shared/types';
import { Button, Skeleton } from '@/shared/ui';

const LABELS = ['', 'Rất không hài lòng', 'Chưa hài lòng', 'Bình thường', 'Hài lòng', 'Rất hài lòng'];
type Draft = { rating: number; comment: string };

function ReviewCard({ item, existing, draft, onChange, disabled }: {
  item: OrderItemDetail; existing?: ProductReview; draft: Draft; onChange: (draft: Draft) => void; disabled: boolean;
}) {
  const [hover, setHover] = useState(0);
  const current = existing?.rating ?? (hover || draft.rating);
  return <article aria-label={`Đánh giá ${item.productName}`} className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-card">
    <div className="flex items-center gap-3 border-b border-gray-100 p-4 sm:p-5">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-600"><Coffee className="size-7" aria-hidden /></div>
      <div className="min-w-0 flex-1"><h2 className="font-heading text-body-lg font-semibold text-gray-900">{item.productName}</h2><p className="mt-1 text-caption text-gray-500">{item.variantName !== 'Standard' ? `${item.variantName} · ` : ''}Số lượng: {item.quantity}</p></div>
      {existing && <span className="inline-flex items-center gap-1 rounded-full bg-secondary-50 px-2.5 py-1 text-caption text-secondary-800"><CheckCircle2 className="size-4" aria-hidden /> Đã gửi</span>}
    </div>
    <div className="space-y-5 p-4 sm:p-5">
      <fieldset disabled={disabled || !!existing}>
        <legend className="text-body font-semibold text-gray-800">Đánh giá sản phẩm</legend>
        <div className="mt-2 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => <label key={n} onMouseEnter={() => !existing && setHover(n)} className={`flex size-11 items-center justify-center rounded-md focus-within:outline focus-within:outline-2 focus-within:outline-primary-600 ${existing || disabled ? '' : 'cursor-pointer'}`}>
            <input type="radio" className="sr-only" aria-label={`${n} sao cho ${item.productName}`} name={`rating-${item.id}`} checked={(existing?.rating ?? draft.rating) === n} onChange={() => onChange({ ...draft, rating: n })} />
            <Star aria-hidden strokeWidth={1.7} className={`size-8 transition-colors ${n <= current ? 'fill-amber-400 text-amber-400' : 'fill-white text-gray-300'}`} />
          </label>)}
        </div>
        <p aria-live="polite" className="mt-1 min-h-5 text-body text-primary-700">{current ? LABELS[current] : 'Chạm vào sao để đánh giá'}</p>
      </fieldset>
      {existing ? <p className="text-body text-gray-600">{existing.status === 'Approved' ? 'Đánh giá của bạn đã được hiển thị.' : existing.status === 'Hidden' ? 'Đánh giá của bạn đã được ẩn.' : 'Đánh giá của bạn đang chờ xử lý.'}</p> : <div>
        <label htmlFor={`review-comment-${item.id}`} className="text-body font-semibold text-gray-800">Nhận xét <span className="font-normal text-gray-500">(không bắt buộc)</span></label>
        <textarea id={`review-comment-${item.id}`} value={draft.comment} onChange={(e) => onChange({ ...draft, comment: e.target.value })} maxLength={10000} disabled={disabled} rows={4} placeholder="Chia sẻ cảm nhận của bạn về món này..." className="mt-2 w-full resize-y rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-body text-gray-900 outline-none placeholder:text-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-200" />
      </div>}
    </div>
  </article>;
}

export default function OrderReviewPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const id = Number(orderId);
  const valid = Number.isSafeInteger(id) && id > 0;
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const client = useQueryClient();
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [failedItem, setFailedItem] = useState<string | null>(null);
  const order = useQuery({ queryKey: ['order', 'me', id], enabled: valid && !!userId, queryFn: ({ signal }) => myOrderApi.getMyOrder(id, signal), retry: false });
  const reviews = useQuery({ queryKey: ['reviews', 'mine', userId], enabled: !!userId && order.data?.status === 'Completed', queryFn: ({ signal }) => engagementApi.listMyReviews(signal), retry: false });
  const items = order.data?.items ?? [];
  const selected = items.filter((item) => drafts[item.id]?.rating && !reviews.data?.some((review) => review.orderItemId === item.id));
  const submit = useMutation({
    mutationFn: async () => {
      for (const item of selected) {
        const draft = drafts[item.id];
        setFailedItem(item.productName);
        const review = await engagementApi.createReview({ orderItemId: item.id, productId: item.productId, rating: draft.rating, comment: draft.comment.trim() || null });
        client.setQueryData<ProductReview[]>(['reviews', 'mine', userId], (old) => [...(old ?? []), review]);
        void client.invalidateQueries({ queryKey: ['reviews', 'product', item.productId] });
      }
      setFailedItem(null);
    },
    onError: (error) => { if (isApiError(error) && error.status === 409) void client.invalidateQueries({ queryKey: ['reviews', 'mine', userId] }); },
  });
  return <div className="mx-auto min-h-screen max-w-2xl bg-gray-100 pb-32">
    <PageHeader title="Đánh giá sản phẩm" back={PATHS.orders} />
    <div className="space-y-3 p-4">
      {valid && order.isPending && <div aria-label="Đang tải đơn hàng"><Skeleton className="h-48" /></div>}
      {(!valid || order.isError) && <div role="alert" className="rounded-lg bg-white p-5 text-body text-gray-700">Không tải được đơn hàng. Vui lòng kiểm tra lại hoặc thử lại. {valid && <button className="text-primary-600 underline" onClick={() => void order.refetch()}>Thử lại</button>}</div>}
      {order.data && order.data.status !== 'Completed' && <p role="status" className="rounded-lg bg-white p-5 text-body text-gray-700">Bạn có thể đánh giá khi đơn hàng đã hoàn tất.</p>}
      {order.data?.status === 'Completed' && <>
        <div className="px-1 py-2"><p className="text-caption text-gray-500">ĐƠN HÀNG #{order.data.orderCode}</p><p className="mt-1 text-body text-gray-600">Chọn sao cho các món bạn muốn đánh giá. Mỗi món chỉ được đánh giá một lần.</p></div>
        {reviews.isPending && <p role="status" className="p-4 text-body text-gray-600">Đang tải đánh giá của bạn…</p>}
        {reviews.isError && <div role="alert" className="rounded-lg bg-white p-4 text-body">Không tải được đánh giá. <button className="text-primary-600 underline" onClick={() => void reviews.refetch()}>Thử lại</button></div>}
        {reviews.data && items.length === 0 && <p className="rounded-lg bg-white p-4 text-body">Đơn hàng không có món để đánh giá.</p>}
        {reviews.data && items.map((item) => <ReviewCard key={item.id} item={item} existing={reviews.data.find((review) => review.orderItemId === item.id)} draft={drafts[item.id] ?? { rating: 0, comment: '' }} disabled={submit.isPending} onChange={(draft) => setDrafts((old) => ({ ...old, [item.id]: draft }))} />)}
        {submit.isError && <p role="alert" className="rounded-md bg-error-soft p-3 text-body text-error-strong">{failedItem && `Không gửi được đánh giá ${failedItem}. `}{isApiError(submit.error) && submit.error.status === 403 ? 'Chưa xác thực được lượt mua, vui lòng thử lại sau.' : isApiError(submit.error) ? submit.error.message : 'Vui lòng thử lại.'}</p>}
        {submit.isSuccess && selected.length === 0 && <p role="status" className="rounded-md bg-success-soft p-3 text-body text-success-strong">Đã gửi đánh giá. Cảm ơn bạn đã chia sẻ!</p>}
      </>}
    </div>
    {order.data?.status === 'Completed' && reviews.data && items.length > 0 && <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl border-t border-gray-200 bg-white px-4 pb-[calc(1rem+var(--safe-bottom,0px))] pt-3">
      <Button fullWidth size="lg" disabled={selected.length === 0} loading={submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? 'Đang gửi…' : selected.length ? `Gửi đánh giá (${selected.length})` : 'Chọn sao để gửi đánh giá'}</Button>
    </div>}
  </div>;
}
