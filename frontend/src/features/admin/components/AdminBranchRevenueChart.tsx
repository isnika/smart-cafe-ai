import { formatVnd } from '@/shared/lib';
import type { BranchRevenueItem } from '@/shared/api/order';
import { BRANCH_META } from '../hooks/useAdminRevenue';

interface AdminBranchRevenueChartProps {
  branchIds: number[];
  branches: BranchRevenueItem[];
  totalRevenue: number;
}

export function AdminBranchRevenueChart({ branchIds, branches, totalRevenue }: AdminBranchRevenueChartProps) {
  const branchList = branchIds.map((bId) => {
    const found = branches.find((b) => b.branchId === bId);
    const revenue = found?.finalAmount ?? found?.revenue ?? 0;
    const ordersCount = found?.ordersCount ?? 0;
    const percentage = totalRevenue > 0 ? Number(((revenue / totalRevenue) * 100).toFixed(1)) : 0;
    const meta = BRANCH_META[bId];
    return {
      branchId: bId,
      name: meta?.name ?? `Chi nhánh #${bId}`,
      shortName: meta?.shortName ?? `Chi nhánh ${bId}`,
      city: meta?.city ?? '',
      color: meta?.color ?? '#8c5835',
      revenue,
      ordersCount,
      percentage,
    };
  });

  const maxRevenue = Math.max(1, ...branchList.map((b) => b.revenue));

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        {branchList.map((b, idx) => {
          const widthPct = Math.max(4, Math.round((b.revenue / maxRevenue) * 100));
          return (
            <div key={b.branchId} className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-2xs transition hover:border-gray-200">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex size-6 items-center justify-center rounded-full text-xs font-bold text-white shadow-xs"
                    style={{ backgroundColor: b.color }}
                  >
                    {idx + 1}
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">{b.shortName}</h4>
                    <p className="text-xs text-gray-400">{b.city} • {b.ordersCount} đơn hoàn thành</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-gray-900">{formatVnd(b.revenue)}</span>
                  <p className="text-xs font-semibold" style={{ color: b.color }}>
                    {b.percentage}% tổng doanh thu
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: b.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Summary Pill Breakdown */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
        {branchList.map((b) => (
          <div
            key={b.branchId}
            style={{ width: `${b.percentage}%`, backgroundColor: b.color }}
            title={`${b.shortName}: ${b.percentage}% (${formatVnd(b.revenue)})`}
            className="h-full transition-all duration-500"
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-gray-500">
        {branchList.map((b) => (
          <span key={b.branchId} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: b.color }} />
            <strong className="text-gray-700">{b.shortName}</strong> ({b.percentage}%)
          </span>
        ))}
      </div>
    </div>
  );
}
