import { useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Coins,
  DollarSign,
  Filter,
  LoaderCircle,
  RefreshCw,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { formatVnd } from '@/shared/lib';
import { Badge, Button, Card } from '@/shared/ui';
import {
  useAdminRevenueOverview,
  useAdminRevenueByBranches,
  BRANCH_META,
  getBranchName,
} from '../hooks/useAdminRevenue';
import { AdminRevenueTimelineChart } from './AdminRevenueTimelineChart';
import { AdminBranchRevenueChart } from './AdminBranchRevenueChart';

type TimeRangePreset = '7d' | '30d' | 'month' | 'all';

function getDateRange(preset: TimeRangePreset): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().split('T')[0];

  if (preset === '7d') {
    const d = new Date(today);
    d.setDate(d.getDate() - 7);
    return { from: d.toISOString().split('T')[0], to };
  }
  if (preset === '30d') {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return { from: d.toISOString().split('T')[0], to };
  }
  if (preset === 'month') {
    const d = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: d.toISOString().split('T')[0], to };
  }
  // 'all'
  return { from: '2025-01-01', to };
}

export function AdminRevenueSection() {
  const [preset, setPreset] = useState<TimeRangePreset>('30d');
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  const { from, to } = useMemo(() => getDateRange(preset), [preset]);

  const overviewParams = useMemo(
    () => ({
      from,
      to,
      groupBy,
      branchId: selectedBranchId ?? undefined,
    }),
    [from, to, groupBy, selectedBranchId],
  );

  const branchesParams = useMemo(
    () => ({
      from,
      to,
    }),
    [from, to],
  );

  const overview = useAdminRevenueOverview(overviewParams);
  const byBranches = useAdminRevenueByBranches(branchesParams);

  const summary = overview.data?.summary;
  const totalRevenue = summary?.totalRevenue ?? 0;
  const completedOrders = summary?.completedOrders ?? 0;
  const totalOrders = summary?.totalOrders ?? 0;
  const aov = summary?.averageOrderValue ?? 0;

  const branchItems = byBranches.data?.branches ?? overview.data?.byBranch ?? [];

  // Determine top-performing branch
  const topBranch = useMemo(() => {
    if (branchItems.length === 0) return null;
    return [...branchItems].sort(
      (a, b) => (b.finalAmount ?? b.revenue ?? 0) - (a.finalAmount ?? a.revenue ?? 0),
    )[0];
  }, [branchItems]);

  const isRefreshing = overview.isFetching || byBranches.isFetching;

  const handleRefresh = () => {
    void overview.refetch();
    void byBranches.refetch();
  };

  return (
    <div className="space-y-6">
      {/* Section Header with Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800 shadow-2xs">
              <BarChart3 className="size-5" />
            </span>
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">
              Doanh thu chuỗi 3 chi nhánh
            </h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Theo dõi dòng tiền, quy mô doanh số và hiệu suất kinh doanh trên toàn hệ thống Smart Café
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Time range preset selector */}
          <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setPreset('7d')}
              className={`rounded-lg px-3 py-1.5 transition ${
                preset === '7d' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              7 ngày
            </button>
            <button
              type="button"
              onClick={() => setPreset('30d')}
              className={`rounded-lg px-3 py-1.5 transition ${
                preset === '30d' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              30 ngày
            </button>
            <button
              type="button"
              onClick={() => setPreset('month')}
              className={`rounded-lg px-3 py-1.5 transition ${
                preset === 'month' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Tháng này
            </button>
            <button
              type="button"
              onClick={() => setPreset('all')}
              className={`rounded-lg px-3 py-1.5 transition ${
                preset === 'all' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Toàn thời gian
            </button>
          </div>

          {/* Refresh button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-1.5"
            aria-label="Làm mới dữ liệu doanh thu"
          >
            <RefreshCw className={`size-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
        </div>
      </div>

      {/* Branch Filter Pills */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="flex items-center gap-1 text-xs font-semibold text-gray-500">
          <Filter className="size-3.5" /> Lọc theo chi nhánh:
        </span>
        <button
          type="button"
          onClick={() => setSelectedBranchId(null)}
          className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${
            selectedBranchId === null
              ? 'bg-primary-800 text-white shadow-2xs'
              : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          Tất cả 3 chi nhánh
        </button>
        {[1, 2, 3].map((bId) => {
          const meta = BRANCH_META[bId];
          const isSelected = selectedBranchId === bId;
          return (
            <button
              key={bId}
              type="button"
              onClick={() => setSelectedBranchId(bId)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold transition ${
                isSelected
                  ? 'bg-gray-900 text-white shadow-2xs'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: meta?.color ?? '#8c5835' }} />
              {meta?.shortName ?? `CN ${bId}`}
            </button>
          );
        })}
      </div>

      {/* 4 Top KPI Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Revenue */}
        <Card className="relative overflow-hidden border-amber-200/60 bg-linear-to-br from-amber-50/40 to-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
              {selectedBranchId ? getBranchName(selectedBranchId) : 'Tổng doanh thu (3 chi nhánh)'}
            </span>
            <span className="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <DollarSign className="size-4.5" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-extrabold text-gray-900 sm:text-3xl">
              {overview.isPending ? 'Đang tải…' : formatVnd(totalRevenue)}
            </p>
            <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
              <span className="text-emerald-600 font-semibold flex items-center">
                <TrendingUp className="size-3.5 mr-0.5 inline" /> Doanh thu thực nhận
              </span>
              <span>• Sau chiết khấu & phí</span>
            </p>
          </div>
        </Card>

        {/* Total Orders */}
        <Card className="p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Đơn hàng hoàn thành
            </span>
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="size-4.5" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-extrabold text-gray-900 sm:text-3xl">
              {overview.isPending ? '—' : `${completedOrders} / ${totalOrders}`}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {totalOrders > 0
                ? `${Math.round((completedOrders / totalOrders) * 100)}% tỷ lệ đơn thành công`
                : 'Chưa có đơn hàng'}
            </p>
          </div>
        </Card>

        {/* Average Order Value (AOV) */}
        <Card className="p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Giá trị đơn trung bình
            </span>
            <span className="flex size-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <Coins className="size-4.5" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-extrabold text-gray-900 sm:text-3xl">
              {overview.isPending ? '—' : formatVnd(aov)}
            </p>
            <p className="mt-1 text-xs text-gray-500">AOV (Average Order Value)</p>
          </div>
        </Card>

        {/* Top Branch */}
        <Card className="p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Chi nhánh dẫn đầu
            </span>
            <span className="flex size-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Trophy className="size-4.5" />
            </span>
          </div>
          <div className="mt-3">
            <p className="truncate text-lg font-bold text-gray-900 sm:text-xl">
              {topBranch ? getBranchName(topBranch.branchId) : 'Đang phân tích'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {topBranch ? (
                <>
                  <strong className="text-gray-900">{formatVnd(topBranch.finalAmount ?? topBranch.revenue ?? 0)}</strong> (
                  <span className="font-semibold text-primary-700">
                    {topBranch.revenuePercentage ?? topBranch.percentage ?? 0}%
                  </span>)
                </>
              ) : (
                'Chưa có dữ liệu'
              )}
            </p>
          </div>
        </Card>
      </div>

      {/* Two Main Charts Side by Side */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Revenue Timeline Chart (7 Cols) */}
        <div className="lg:col-span-7">
          <Card className="p-5 shadow-2xs">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-gray-900 text-base">
                  Xu hướng doanh thu theo thời gian
                </h3>
                <p className="text-xs text-gray-500">
                  {selectedBranchId
                    ? `Dữ liệu cho ${getBranchName(selectedBranchId)}`
                    : 'Tổng hợp từ cả 3 chi nhánh trong chuỗi'}
                </p>
              </div>

              {/* Group By selector */}
              <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setGroupBy('day')}
                  className={`rounded-md px-2.5 py-1 transition ${
                    groupBy === 'day' ? 'bg-white text-gray-900 shadow-2xs font-semibold' : 'text-gray-500'
                  }`}
                >
                  Ngày
                </button>
                <button
                  type="button"
                  onClick={() => setGroupBy('week')}
                  className={`rounded-md px-2.5 py-1 transition ${
                    groupBy === 'week' ? 'bg-white text-gray-900 shadow-2xs font-semibold' : 'text-gray-500'
                  }`}
                >
                  Tuần
                </button>
                <button
                  type="button"
                  onClick={() => setGroupBy('month')}
                  className={`rounded-md px-2.5 py-1 transition ${
                    groupBy === 'month' ? 'bg-white text-gray-900 shadow-2xs font-semibold' : 'text-gray-500'
                  }`}
                >
                  Tháng
                </button>
              </div>
            </div>

            {overview.isPending ? (
              <div className="flex h-64 items-center justify-center">
                <LoaderCircle className="size-6 animate-spin text-primary-600" />
              </div>
            ) : (
              <AdminRevenueTimelineChart data={overview.data?.timeline ?? []} />
            )}
          </Card>
        </div>

        {/* Right: Branch Revenue Share & Comparison (5 Cols) */}
        <div className="lg:col-span-5">
          <Card className="p-5 shadow-2xs h-full flex flex-col justify-between">
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 text-base">
                    So sánh & Tỷ trọng 3 chi nhánh
                  </h3>
                  <p className="text-xs text-gray-500">
                    Phân bổ đóng góp doanh số giữa các cơ sở
                  </p>
                </div>
                <Badge tone="primary">{branchItems.length} chi nhánh</Badge>
              </div>

              {byBranches.isPending ? (
                <div className="flex h-64 items-center justify-center">
                  <LoaderCircle className="size-6 animate-spin text-primary-600" />
                </div>
              ) : (
                <AdminBranchRevenueChart
                  branches={branchItems}
                  totalRevenue={totalRevenue}
                />
              )}
            </div>

            <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50/80 p-3 text-xs text-gray-500">
              💡 <strong>Gợi ý:</strong> Doanh thu được tính tự động từ các đơn hàng hoàn tất thanh toán (`status = Completed`).
            </div>
          </Card>
        </div>
      </div>

      {/* 3 Branches Detailed Breakdown Table */}
      <Card className="p-5 shadow-2xs overflow-hidden">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-gray-900 text-base">
              Bảng chi tiết doanh thu theo chi nhánh
            </h3>
            <p className="text-xs text-gray-500">
              Chi tiết các thành phần doanh thu, đơn hàng và tỷ trọng đóng góp
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="border-b border-gray-100 bg-gray-50/70 text-xs font-semibold text-gray-700 uppercase">
              <tr>
                <th className="py-3 px-4">Chi nhánh</th>
                <th className="py-3 px-4 text-right">Doanh thu thực nhận</th>
                <th className="py-3 px-4 text-center">Tỷ trọng</th>
                <th className="py-3 px-4 text-right">Đơn hoàn thành</th>
                <th className="py-3 px-4 text-right">Giá trị đơn TB (AOV)</th>
                <th className="py-3 px-4 text-right">Tiền món</th>
                <th className="py-3 px-4 text-right">Phí giao hàng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[1, 2, 3].map((bId) => {
                const found = branchItems.find((b) => b.branchId === bId);
                const meta = BRANCH_META[bId];
                const revenue = found?.finalAmount ?? found?.revenue ?? 0;
                const count = found?.ordersCount ?? 0;
                const pct = totalRevenue > 0 ? Number(((revenue / totalRevenue) * 100).toFixed(1)) : 0;
                const aovVal = count > 0 ? Math.round(revenue / count) : 0;
                const subTotalVal = found?.subTotal ?? Math.round(revenue * 0.85);
                const deliveryFeeVal = found?.deliveryFee ?? Math.round(revenue * 0.15);

                return (
                  <tr key={bId} className="hover:bg-gray-50/50 transition">
                    <td className="py-3.5 px-4 font-semibold text-gray-900">
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: meta?.color ?? '#8c5835' }} />
                        <div>
                          <span>{meta?.name ?? `Chi nhánh #${bId}`}</span>
                          <p className="text-xs font-normal text-gray-400">{meta?.city}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-gray-900">
                      {formatVnd(revenue)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className="inline-block rounded-md px-2 py-0.5 text-xs font-semibold text-white"
                        style={{ backgroundColor: meta?.color ?? '#8c5835' }}
                      >
                        {pct}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-medium text-gray-700">
                      {count} đơn
                    </td>
                    <td className="py-3.5 px-4 text-right text-gray-600 font-medium">
                      {formatVnd(aovVal)}
                    </td>
                    <td className="py-3.5 px-4 text-right text-gray-500">
                      {formatVnd(subTotalVal)}
                    </td>
                    <td className="py-3.5 px-4 text-right text-gray-500">
                      {formatVnd(deliveryFeeVal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50/90 font-bold text-gray-900">
              <tr>
                <td className="py-3.5 px-4">TỔNG CỘNG (3 CHI NHÁNH)</td>
                <td className="py-3.5 px-4 text-right text-base text-primary-800">
                  {formatVnd(totalRevenue)}
                </td>
                <td className="py-3.5 px-4 text-center">100%</td>
                <td className="py-3.5 px-4 text-right">{completedOrders} đơn</td>
                <td className="py-3.5 px-4 text-right">{formatVnd(aov)}</td>
                <td className="py-3.5 px-4 text-right">{formatVnd(summary?.subTotal ?? 0)}</td>
                <td className="py-3.5 px-4 text-right">{formatVnd(summary?.deliveryFee ?? 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
