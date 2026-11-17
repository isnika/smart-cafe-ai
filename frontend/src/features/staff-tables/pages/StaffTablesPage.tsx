import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store';
import { isApiError } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { Button, Skeleton } from '@/shared/ui';
import { NoticeBanner } from '../components/NoticeBanner';
import { SessionCard } from '../components/SessionCard';
import { TableGrid } from '../components/TableGrid';
import { useSessionStatusAction, useStaffSessions, useStaffTables } from '../hooks/useStaffTables';
import { countTables, EMPTY_SESSIONS, SESSION_FILTERS, type SessionFilter } from '../model';

const pill = (active: boolean) =>
  cn('rounded-md px-3 py-1.5 text-body font-medium transition-colors', active ? 'bg-primary-600 text-white' : 'border border-gray-200 bg-white text-gray-800 hover:bg-gray-50');

const errorText = (e: unknown, fallback: string): string => {
  if (isApiError(e) && e.status === 403) return 'Bạn không có quyền xem dữ liệu bàn của chi nhánh này.';
  return isApiError(e) ? e.message : fallback;
};

export default function StaffTablesPage() {
  const branchId = useAuthStore((s) => s.branchId);
  const [filter, setFilter] = useState<SessionFilter>('Payment_Pending');
  const [page, setPage] = useState(1);
  const tables = useStaffTables(branchId);
  const sessions = useStaffSessions(branchId, filter, page);
  const action = useSessionStatusAction();

  const changeFilter = (next: SessionFilter) => {
    setFilter(next);
    setPage(1);
  };
  const counts = tables.data ? countTables(tables.data) : null;
  const meta = sessions.data?.meta;
  const refetchAll = () => void Promise.all([tables.refetch(), sessions.refetch()]);

  // Chưa biết chi nhánh của tài khoản thì không đoán/hardcode: dừng ở đây (spec chưa nêu nguồn branch_id cho Staff).
  if (branchId === null) {
    return (
      <div className="space-y-4">
        <h1 className="text-h2 text-gray-900">Bàn & phiên bàn</h1>
        <p role="alert" className="rounded-lg border border-error/30 bg-error-soft p-4 text-error-strong">
          Chưa xác định được chi nhánh của tài khoản này nên không thể tải danh sách bàn. Vui lòng đăng nhập lại hoặc liên hệ quản lý.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption text-gray-500">Nhân viên / Bàn</p>
          <h1 className="text-h2 text-gray-900">Bàn & phiên bàn</h1>
        </div>
        <Button variant="outline" size="sm" loading={(tables.isFetching || sessions.isFetching) && !tables.isPending} leftIcon={<RefreshCw className="size-4" aria-hidden />} onClick={refetchAll}>
          Tải lại
        </Button>
      </div>

      <NoticeBanner notice={action.notice} />

      <section aria-label="Sơ đồ bàn" className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-h3 text-gray-900">Bàn</h2>
          {counts && (
            <p role="status" className="text-body text-gray-600">
              Trống {counts.empty} · Đang có khách {counts.occupied}
              {counts.unknown > 0 ? ` · Không rõ ${counts.unknown}` : ''}
            </p>
          )}
        </div>
        {tables.isPending && (
          <div aria-busy="true" aria-label="Đang tải danh sách bàn" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        )}
        {tables.isError && (
          <div role="alert" className="rounded-lg border border-error/30 bg-error-soft p-4 text-error-strong">
            <p className="font-medium">{tables.data ? 'Không cập nhật được danh sách bàn' : 'Không tải được danh sách bàn'}</p>
            <p className="text-body">{errorText(tables.error, 'Vui lòng thử lại.')}</p>
            <Button className="mt-3" variant="outline" size="sm" onClick={() => void tables.refetch()}>
              Thử lại
            </Button>
          </div>
        )}
        {tables.data && (tables.data.length === 0 ? <p role="status" className="text-body text-gray-500">Chi nhánh chưa có bàn nào.</p> : <TableGrid tables={tables.data} />)}
      </section>

      <section aria-label="Phiên bàn" className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 md:p-5">
        <h2 className="text-h3 text-gray-900">Phiên bàn</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc phiên theo trạng thái">
          {SESSION_FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => changeFilter(f.id)} className={pill(filter === f.id)}>
              {f.label}
            </button>
          ))}
        </div>

        {sessions.isPending && (
          <div aria-busy="true" aria-label="Đang tải phiên bàn" className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        )}
        {sessions.isError && (
          <div role="alert" className="rounded-lg border border-error/30 bg-error-soft p-4 text-error-strong">
            <p className="font-medium">{sessions.data ? 'Không cập nhật được danh sách phiên' : 'Không tải được danh sách phiên'}</p>
            <p className="text-body">{errorText(sessions.error, 'Vui lòng thử lại.')}</p>
            <Button className="mt-3" variant="outline" size="sm" onClick={() => void sessions.refetch()}>
              Thử lại
            </Button>
          </div>
        )}
        {sessions.data && sessions.data.items.length === 0 && (
          <p role="status" className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-gray-500">{EMPTY_SESSIONS[filter]}</p>
        )}
        {sessions.data && sessions.data.items.length > 0 && (
          <ul className="space-y-2">
            {sessions.data.items.map((s) => (
              <li key={s.id}>
                <SessionCard session={s} tables={tables.data} busy={action.isPending} loading={action.pendingId === s.id} onAct={action.run} />
              </li>
            ))}
          </ul>
        )}

        {filter !== 'open' && meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" disabled={meta.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Trang trước
            </Button>
            <p className="text-caption text-gray-600">Trang {meta.page} / {meta.totalPages} · {meta.total} phiên</p>
            <Button variant="outline" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
              Trang sau
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
