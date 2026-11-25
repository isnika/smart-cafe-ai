import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { engagementApi, isApiError } from '@/shared/api';
import type { ReviewStatus } from '@/shared/types';

export default function ReviewModerationPage() {
  const [status, setStatus] = useState<ReviewStatus>('Approved');
  const [page, setPage] = useState(1);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const client = useQueryClient();
  const reviews = useQuery({ queryKey: ['reviews', 'admin', userId, status, page], enabled: userId !== null, queryFn: ({ signal }) => engagementApi.listAdminReviews(page, status, signal) });
  const moderate = useMutation({
    mutationFn: ({ id, next }: { id: number; next: 'Approved' | 'Hidden' }) => engagementApi.moderateReview(id, next),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['reviews'] }); },
  });
  return <div className="space-y-4">
    <h1 className="text-h2">Quản lý đánh giá</h1>
    <label className="block">Trạng thái <select className="ml-2 rounded border p-2" value={status} onChange={(e) => { setStatus(e.target.value as ReviewStatus); setPage(1); moderate.reset(); }}><option value="Approved">Đang hiển thị</option><option value="Hidden">Đã ẩn</option><option value="Pending">Chờ duyệt trước đây</option></select></label>
    {reviews.isPending && <p role="status">Đang tải đánh giá…</p>}
    {reviews.isError && <div role="alert">Không tải được đánh giá. <button className="text-primary-600 underline" onClick={() => void reviews.refetch()}>Thử lại</button></div>}
    {moderate.isError && <p role="alert">{isApiError(moderate.error) ? moderate.error.message : 'Không cập nhật được đánh giá.'}</p>}
    {reviews.data && reviews.data.items.length === 0 && <p>Không có đánh giá trong trang này.</p>}
    <ul className="space-y-3">{reviews.data?.items.map((review) => <li key={review.id} className="rounded-lg border bg-white p-4">
      <p className="font-semibold">Sản phẩm #{review.productId} · {review.rating}/5 sao</p>
      <p className="text-caption text-gray-500">Mục đơn #{review.orderItemId} · {new Date(review.createdAt).toLocaleDateString('vi-VN')}</p>
      {review.comment && <p className="mt-2 whitespace-pre-wrap break-words">{review.comment}</p>}
      {review.status !== 'Hidden' && <div className="mt-3 flex gap-3">
        {review.status === 'Pending' && <button disabled={moderate.isPending} onClick={() => moderate.mutate({ id: review.id, next: 'Approved' })} className="rounded bg-primary-600 px-3 py-2 text-white disabled:opacity-50">Duyệt</button>}
        <button disabled={moderate.isPending} onClick={() => moderate.mutate({ id: review.id, next: 'Hidden' })} className="rounded border px-3 py-2 disabled:opacity-50">Ẩn</button>
      </div>}
    </li>)}</ul>
    {reviews.data && <div className="flex gap-4"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang trước</button><span>Trang {page}</span><button disabled={page * reviews.data.pageSize >= reviews.data.total} onClick={() => setPage(page + 1)}>Trang sau</button></div>}
  </div>;
}
