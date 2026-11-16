import { CheckCircle2, RefreshCw } from 'lucide-react';
import { isApiError } from '@/shared/api';
import { Button, Skeleton } from '@/shared/ui';
import { useOpenSessionLookup, useSessionStatusAction } from '../hooks/useStaffTables';
import { SESSION_STATUS_LABEL, tableLabelOf } from '../model';
import { NoticeBanner } from './NoticeBanner';

/**
 * Hiển thị sau khi Payment Success của đơn Dine-in. Thanh toán thành công KHÔNG đồng nghĩa phiên đã đóng, nên mỗi lần mount
 * component tải lại phiên từ server rồi quyết định theo trạng thái thật:
 * - còn Payment_Pending → nút "Hoàn tất phiên" (PATCH Completed; 409 → refetch + thông báo, không retry);
 * - còn Active → chỉ báo trạng thái (khách chưa yêu cầu tính tiền), không tự đóng;
 * - không còn trong danh sách phiên mở → báo đã đóng.
 */
export function SessionCompletionPrompt({ branchId, sessionId }: { branchId: number; sessionId: number }) {
  const lookup = useOpenSessionLookup(branchId, sessionId);
  const action = useSessionStatusAction();
  const session = lookup.data;

  return (
    <section aria-label="Phiên bàn" className="space-y-2 rounded-md border border-gray-200 p-3">
      <NoticeBanner notice={action.notice} />

      {lookup.isPending && <Skeleton aria-busy="true" aria-label="Đang tải phiên bàn" className="h-10 w-full" />}

      {lookup.isError && (
        <div role="alert" className="space-y-2 text-body text-error-strong">
          <p>{isApiError(lookup.error) ? lookup.error.message : 'Không tải được trạng thái phiên bàn.'}</p>
          <Button variant="outline" size="sm" leftIcon={<RefreshCw className="size-4" aria-hidden />} onClick={() => void lookup.refetch()}>
            Tải lại phiên bàn
          </Button>
        </div>
      )}

      {lookup.isSuccess && session === null && !action.notice && (
        <p role="status" className="text-body text-gray-700">Phiên bàn này đã đóng hoặc không còn trong danh sách phiên đang mở.</p>
      )}

      {lookup.isSuccess && session && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-body text-gray-800">
            Phiên #{session.id} ({tableLabelOf(session, undefined)}): <strong>{SESSION_STATUS_LABEL[session.status]}</strong>
            {session.status === 'Active' && <span className="text-gray-600"> — khách chưa yêu cầu tính tiền nên chưa thể hoàn tất.</span>}
          </p>
          {session.status === 'Payment_Pending' && (
            <Button
              size="sm"
              loading={action.pendingId === session.id}
              disabled={action.isPending}
              leftIcon={<CheckCircle2 className="size-4" aria-hidden />}
              onClick={() => action.run(session.id, 'Completed')}
            >
              Hoàn tất phiên
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
