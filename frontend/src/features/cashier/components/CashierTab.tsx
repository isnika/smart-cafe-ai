import { useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { isApiError } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import type { OrderDetail } from '@/shared/types';
import { Button, Skeleton } from '@/shared/ui';
import { useCashierFeed } from '../hooks/useCashier';
import { cashierGroup, GROUP_LABEL, matchesSearch, type CashierGroup } from '../model';
import { BillModal } from './BillModal';
import { CashierOrderCard } from './CashierOrderCard';

type Filter = 'all' | CashierGroup;
const GROUPS: CashierGroup[] = ['awaiting_counter', 'paid_online'];
const EMPTY: Record<CashierGroup, string> = {
  awaiting_counter: 'Không có đơn nào đang chờ thu tại quầy.',
  paid_online: 'Chưa có đơn trả online nào đang mở.',
};

const pill = (active: boolean) =>
  cn('rounded-md px-3 py-1.5 text-body font-medium transition-colors', active ? 'bg-primary-600 text-white' : 'border border-gray-200 bg-white text-gray-800 hover:bg-gray-50');

export function CashierTab() {
  const feed = useCashierFeed();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<number | null>(null);

  // Mốc thời gian = lúc dữ liệu được tải (cập nhật theo polling) → render thuần.
  const now = feed.dataUpdatedAt;
  const rows = useMemo(() => {
    const items = feed.data?.items ?? [];
    const byGroup: Record<CashierGroup, OrderDetail[]> = { awaiting_counter: [], paid_online: [] };
    const totals: Record<CashierGroup, number> = { awaiting_counter: 0, paid_online: 0 };
    for (const o of items) {
      const g = cashierGroup(o);
      if (!g) continue;
      totals[g] += 1;
      if (matchesSearch(o, q)) byGroup[g].push(o);
    }
    return { byGroup, totals };
  }, [feed.data, q]);

  const selected = openId === null ? null : (feed.data?.items.find((o) => o.id === openId) ?? null);
  const searching = q.trim() !== '';
  const hasData = feed.data !== undefined;
  const visible = GROUPS.filter((g) => filter === 'all' || filter === g);
  const shownCount = visible.reduce((n, g) => n + rows.byGroup[g].length, 0);

  return (
    <section aria-label="Thu ngân" className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-h3 text-gray-900">Thu ngân</h2>
        <Button variant="outline" size="sm" loading={feed.isFetching && hasData} leftIcon={<RefreshCw className="size-4" aria-hidden />} onClick={() => void feed.refetch()}>
          Tải lại
        </Button>
      </div>

      <label className="relative block">
        <span className="sr-only">Tìm theo mã đơn / số bàn</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo mã đơn / số bàn"
          className="h-11 w-full rounded-md border border-primary-100 bg-primary-50 pl-9 pr-3 text-body"
        />
      </label>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo trạng thái thanh toán">
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} className={pill(filter === 'all')}>
          Tất cả ({rows.totals.awaiting_counter + rows.totals.paid_online})
        </button>
        {GROUPS.map((g) => (
          <button key={g} type="button" aria-pressed={filter === g} onClick={() => setFilter(g)} className={pill(filter === g)}>
            {g === 'awaiting_counter' ? '🔵' : '🟢'} {GROUP_LABEL[g]} ({rows.totals[g]})
          </button>
        ))}
      </div>

      {feed.isPending && (
        <div className="space-y-3" aria-busy aria-label="Đang tải danh sách thu ngân">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      )}

      {feed.isError && (
        <div role="alert" className="rounded-lg border border-error/30 bg-error-soft p-4 text-error-strong">
          <p className="font-medium">{hasData ? 'Không cập nhật được danh sách' : 'Không tải được danh sách thu ngân'}</p>
          <p className="text-body">{isApiError(feed.error) ? feed.error.message : 'Vui lòng thử lại.'}{hasData ? ' Đang hiển thị dữ liệu lần tải trước.' : ''}</p>
          <Button className="mt-3" variant="outline" size="sm" onClick={() => void feed.refetch()}>
            Thử lại
          </Button>
        </div>
      )}

      {hasData && shownCount === 0 && searching && (
        <p role="status" className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-gray-500">Không có đơn nào khớp “{q.trim()}”.</p>
      )}

      {hasData &&
        visible.map((g) => (
          <section key={g} aria-label={GROUP_LABEL[g]} className="space-y-2">
            {rows.byGroup[g].length === 0 ? (
              !searching && <p role="status" className="rounded-lg border border-dashed border-gray-300 py-6 text-center text-body text-gray-500">{EMPTY[g]}</p>
            ) : (
              <ul className="space-y-2">
                {rows.byGroup[g].map((o) => (
                  <li key={o.id}>
                    <CashierOrderCard order={o} group={g} now={now} onOpen={setOpenId} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

      <BillModal open={openId !== null} order={selected} onClose={() => setOpenId(null)} />
    </section>
  );
}
