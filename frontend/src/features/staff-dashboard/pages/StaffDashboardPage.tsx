import { useSearchParams } from 'react-router-dom';
import { CashierTab } from '@/features/cashier/components/CashierTab';
import { cn } from '@/shared/lib/cn';
import { OverviewTab } from '../components/OverviewTab';

type Tab = 'overview' | 'cashier';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Tổng quan ca' },
  { id: 'cashier', label: 'Thu ngân' },
];

/** Tab nằm trong query `?tab=cashier` (khớp `to.staffCashier()`), nên tải lại trang hoặc chia sẻ link vẫn giữ tab. */
export default function StaffDashboardPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'cashier' ? 'cashier' : 'overview';
  const select = (next: Tab) => setParams(next === 'overview' ? {} : { tab: next }, { replace: true });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-caption text-gray-500">Nhân viên / Trang chủ</p>
        <h1 className="text-h2 text-gray-900">Tổng quan ca trực</h1>
      </div>

      <div role="tablist" aria-label="Khu vực làm việc" className="inline-flex gap-2 rounded-lg bg-white p-1 shadow-card">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => select(t.id)}
            className={cn('rounded-md px-4 py-2 text-body font-medium transition-colors', tab === t.id ? 'bg-primary-600 text-white' : 'text-gray-700 hover:bg-gray-100')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' ? <OverviewTab onOpenCashier={() => select('cashier')} /> : <CashierTab />}
      </div>
    </div>
  );
}
