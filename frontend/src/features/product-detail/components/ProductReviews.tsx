import { Star } from "lucide-react";
import { isApiError } from "@/shared/api";
import { cn } from "@/shared/lib/cn";
import type { ProductReviewView } from "@/shared/types";
import { Button, Skeleton } from "@/shared/ui";
import { useProductReviews } from "../hooks/useProduct";
import { formatRating, formatReviewDate } from "../model";

function Stars({ rating, className }: { rating: number; className?: string }) {
  const filled = Math.round(rating);
  return (
    <span role="img" aria-label={`${filled} trên 5 sao`} className={cn("inline-flex gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn("size-4", n <= filled ? "fill-accent-500 text-accent-500" : "text-gray-300")}
        />
      ))}
    </span>
  );
}

function ReviewItem({ review }: { review: ProductReviewView }) {
  return (
    <li className="rounded-xl border border-primary-100 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-gray-900">{review.authorName}</span>
        <time dateTime={review.createdAt} className="text-caption text-gray-500">
          {formatReviewDate(review.createdAt)}
        </time>
      </div>
      <Stars rating={review.rating} className="mt-1" />
      {review.comment && <p className="mt-2 text-body text-gray-700">{review.comment}</p>}
    </li>
  );
}

/**
 * Đánh giá của món. Có trạng thái loading / lỗi / trống riêng và không bao giờ chặn phần chi tiết món phía trên.
 */
export function ProductReviews({ productId }: { productId: number }) {
  const reviews = useProductReviews(productId);
  const first = reviews.data?.pages[0];
  const items = reviews.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section aria-labelledby="reviews-heading" className="space-y-3 px-4 pt-8">
      <h2 id="reviews-heading" className="text-h4 text-gray-900">
        Đánh giá
      </h2>

      {reviews.isPending && (
        <div className="space-y-3" aria-busy aria-label="Đang tải đánh giá">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}

      {reviews.isError && (
        <div role="alert" className="rounded-xl border border-primary-100 bg-white p-4 text-center">
          <p className="font-semibold">Không tải được đánh giá</p>
          <p className="mt-1 text-body text-gray-600">{isApiError(reviews.error) ? reviews.error.message : "Vui lòng thử lại."}</p>
          <Button className="mt-3" variant="outline" onClick={() => void reviews.refetch()}>
            Thử lại
          </Button>
        </div>
      )}

      {first && first.total === 0 && (
        <p role="status" className="rounded-xl border border-dashed border-primary-200 bg-white p-6 text-center text-body text-gray-600">
          Chưa có đánh giá
        </p>
      )}

      {first && first.total > 0 && (
        <>
          <div className="flex items-center gap-3">
            {first.averageRating !== null && (
              <>
                <span className="text-h2 text-gray-900">{formatRating(first.averageRating)}</span>
                <Stars rating={first.averageRating} />
              </>
            )}
            <span className="text-body text-gray-600">{first.total} đánh giá</span>
          </div>

          <ul className="space-y-3" aria-label="Danh sách đánh giá">
            {items.map((r) => (
              <ReviewItem key={r.id} review={r} />
            ))}
          </ul>

          {reviews.isFetchNextPageError && (
            <p role="alert" className="text-center text-body text-error-strong">
              Không tải thêm được đánh giá.
            </p>
          )}
          {reviews.hasNextPage && (
            <Button
              variant="outline"
              fullWidth
              loading={reviews.isFetchingNextPage}
              onClick={() => void reviews.fetchNextPage()}
            >
              Xem thêm đánh giá
            </Button>
          )}
        </>
      )}
    </section>
  );
}
