import type { OrderHistoryEntry } from '@/shared/api/order-me.types';
import { cn } from '@/shared/lib/cn';
import type { FulfillmentType, OrderStatus } from '@/shared/types';
import { Button, Skeleton } from '@/shared/ui';
import { formatVnDateTime, isFailedStatus, trackingStatusLabel } from '../tracking';

interface Props {
  history: OrderHistoryEntry[] | undefined;
  fulfillment: FulfillmentType;
  /** Trạng thái hiện tại của đơn (từ chi tiết đơn). */
  currentStatus: OrderStatus;
  isLoading: boolean;
  isError: boolean;
  stale: boolean;
  onRetry: () => void;
  /** Lý do huỷ/từ chối đã hiện ở banner → không lặp lại ở dòng timeline. */
  hideNote?: string | null;
}

/** Dòng thời gian = lịch sử thật từ server (cũ → mới). Không bổ sung bước giả. */
export function OrderTimeline({ history, fulfillment, currentStatus, isLoading, isError, stale, onRetry, hideNote }: Props) {
  return (
    <section aria-labelledby="timeline-title" className="rounded-lg border border-primary-100 bg-white p-4">
      <h2 id="timeline-title" className="mb-3 text-body-lg font-semibold">
        Trạng thái đơn hàng
      </h2>

      {isLoading && (
        <div className="space-y-3" aria-busy aria-label="Đang tải lịch sử đơn hàng">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      )}

      {!isLoading && isError && (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-body text-gray-700">Không tải được lịch sử trạng thái.</p>
          <Button variant="outline" onClick={onRetry}>
            Tải lại lịch sử
          </Button>
        </div>
      )}

      {!isLoading && !isError && history && history.length === 0 && (
        <p className="text-body text-gray-500">Chưa có lịch sử trạng thái cho đơn này.</p>
      )}

      {!isLoading && !isError && history && history.length > 0 && (
        <>
          <ol className="space-y-4" aria-label="Lịch sử trạng thái">
            {history.map((h, idx, all) => {
              const current = idx === all.length - 1 && h.status === currentStatus;
              const failed = isFailedStatus(h.status);
              const note = h.note && h.note !== hideNote ? h.note : null;
              return (
                <li key={h.id} className="flex gap-3" aria-current={current ? 'step' : undefined} data-status={h.status}>
                  <span
                    className={cn(
                      'mt-1.5 size-3 shrink-0 rounded-full',
                      failed ? 'bg-error' : current ? 'bg-accent-500' : 'bg-primary-300',
                      current && (failed ? 'ring-4 ring-error-soft' : 'ring-4 ring-accent-100'),
                    )}
                    aria-hidden
                  />
                  <div className="flex flex-1 justify-between gap-2">
                    <div>
                      <p className={cn('text-body', failed ? 'font-semibold text-error-strong' : current ? 'font-semibold text-gray-900' : 'text-gray-700')}>
                        {trackingStatusLabel(h.status, fulfillment)}
                      </p>
                      {note && <p className="text-caption text-gray-500">{note}</p>}
                    </div>
                    <time dateTime={h.createdAt} className="shrink-0 text-caption text-gray-500">
                      {formatVnDateTime(h.createdAt)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
          {stale && <p className="mt-3 text-caption text-gray-500">Lịch sử đang được cập nhật…</p>}
        </>
      )}
    </section>
  );
}
