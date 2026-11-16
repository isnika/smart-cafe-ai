import { useMemo, useState } from 'react';
import { AlertTriangle, BrainCircuit, Sparkles, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store';
import { SectionEmpty, SectionError, StaleNote } from '@/features/manager-dashboard/components/SectionState';
import { formatPercent } from '@/features/manager-dashboard/model';
import { useInventoryStock } from '@/features/manager-inventory/hooks/useInventory';
import { PATHS } from '@/app/routes';
import { isApiError } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { parseUtc } from '@/shared/lib';
import { Badge, Button, Card, Skeleton } from '@/shared/ui';
import { IngredientForecastCard } from '../components/IngredientForecastCard';
import { ForecastLineChart } from '../components/ForecastLineChart';
import { RestockCard } from '../components/RestockCard';
import { useIngredientForecast, useRevenueForecast } from '../hooks/useForecasts';
import {
  DEFAULT_HORIZON, HORIZONS, MIN_HISTORY_DAYS, backfilledAccuracy, groupByTarget, ingredientBars, restockInsight, restockSuggestions,
  revenueInsight, revenueSeries, revenueTrend, toIsoDate, type Horizon, type IngredientOption,
} from '../model';

const errorMessage = (e: unknown) => (isApiError(e) ? e.message : undefined);

export default function ManagerForecastPage() {
  const branchId = useAuthStore((s) => s.branchId);
  // "Hôm nay" cố định theo lần mở trang để mọi phép tính thuần và khớp với khoá query.
  const today = useMemo(() => toIsoDate(new Date()), []);
  const [horizon, setHorizon] = useState<Horizon>(DEFAULT_HORIZON);
  const [pickedIngredient, setPickedIngredient] = useState<number | null>(null);

  const revenue = useRevenueForecast(branchId, today);
  const usage = useIngredientForecast(branchId, today);
  const stock = useInventoryStock(branchId);

  const points = useMemo(() => revenueSeries(revenue.data ?? [], today, horizon), [revenue.data, today, horizon]);
  const trend = useMemo(() => revenueTrend(points), [points]);
  const accuracy = useMemo(() => backfilledAccuracy(revenue.data ?? [], today), [revenue.data, today]);
  const byIngredient = useMemo(() => groupByTarget(usage.data ?? []), [usage.data]);
  const suggestions = useMemo(() => restockSuggestions(byIngredient, stock.data ?? [], today), [byIngredient, stock.data, today]);

  const options = useMemo<IngredientOption[]>(() => {
    const names = new Map((stock.data ?? []).map((i) => [i.ingredientId, i]));
    return [...byIngredient.keys()]
      .map((id) => ({ id, name: names.get(id)?.ingredientName ?? `Nguyên liệu #${id}`, unit: names.get(id)?.unit ?? '' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [byIngredient, stock.data]);
  const selectedId = pickedIngredient ?? suggestions[0]?.ingredientId ?? options[0]?.id ?? null;
  const selected = options.find((o) => o.id === selectedId);
  const bars = useMemo(() => (selectedId !== null ? ingredientBars(byIngredient.get(selectedId) ?? [], today) : []), [byIngredient, selectedId, today]);

  const generatedAt = useMemo(() => {
    const times = (revenue.data ?? []).map((r) => parseUtc(r.generatedAt)?.getTime() ?? 0);
    return times.length ? new Date(Math.max(...times)) : null;
  }, [revenue.data]);

  const hasForecast = points.some((p) => p.isForecast);
  const learning = !!revenue.data && hasForecast && accuracy.accuracy === null;
  const insights = [trend ? revenueInsight(trend, horizon) : null, !stock.isPending && stock.data && byIngredient.size > 0 ? restockInsight(suggestions) : null].filter(
    (t): t is string => t !== null,
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="text-caption text-gray-500">Quản lý / Dự báo AI</p>
        <h1 className="flex items-center gap-2 text-h2 text-gray-900">
          <Sparkles aria-hidden className="size-6 text-primary-600" /> Dự báo nhu cầu AI
        </h1>
      </div>

      {branchId === null ? (
        <Card padding="lg" className="flex flex-col items-center gap-2 py-10 text-center">
          <AlertTriangle aria-hidden className="size-8 text-warning" />
          <p className="font-medium text-gray-900">Tài khoản chưa được gán chi nhánh</p>
          <p className="text-body text-gray-600">Liên hệ quản trị viên để được gán chi nhánh trước khi xem dự báo.</p>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div role="group" aria-label="Khoảng thời gian dự báo" className="inline-flex rounded-md bg-gray-100 p-1">
              {HORIZONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={h === horizon}
                  onClick={() => setHorizon(h)}
                  className={cn('rounded-sm px-3 py-1.5 text-body font-medium', h === horizon ? 'bg-primary-600 text-white' : 'text-gray-700 hover:bg-gray-200')}
                >
                  {h} ngày tới
                </button>
              ))}
            </div>
            {revenue.data &&
              (accuracy.accuracy !== null ? (
                <Badge tone="success" title={`1 − sai số trung bình giữa dự báo và thực tế trên ${accuracy.days} ngày đã qua`}>
                  Độ chính xác gần đây: {formatPercent(accuracy.accuracy)}
                </Badge>
              ) : (
                <Badge tone="neutral">Độ chính xác: chưa xác định</Badge>
              ))}
            {generatedAt && (
              <span className="text-caption text-gray-500">
                Cập nhật {generatedAt.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                {revenue.data?.[0] ? ` · mô hình ${revenue.data[0].modelVersion}` : ''}
              </span>
            )}
          </div>

          {revenue.isError && revenue.data && <StaleNote onRetry={() => void revenue.refetch()}>Không cập nhật được dự báo, đang hiển thị dữ liệu lần tải trước.</StaleNote>}

          {learning && (
            <Card padding="md" accent="warning" className="space-y-2" role="status">
              <h2 className="flex items-center gap-2 text-h4 text-gray-900">
                <BrainCircuit aria-hidden className="size-5 text-warning" /> AI đang học dữ liệu
              </h2>
              <p className="text-body text-gray-700">
                Chưa đủ lịch sử (cần tối thiểu {MIN_HISTORY_DAYS} ngày có số liệu thực tế, hiện có {accuracy.days}). Độ chính xác chưa xác định nên gợi ý nhập tự động bị vô hiệu hoá.
              </p>
              <Link to={PATHS.managerInventory}>
                <Button variant="outline" size="sm">Tạo đơn nhập thủ công (đến trang Kho)</Button>
              </Link>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Card padding="md" aria-busy={revenue.isPending}>
                <h2 className="mb-3 flex items-center gap-2 text-h4 text-gray-900">
                  <TrendingUp aria-hidden className="size-5 text-primary-600" /> Biểu đồ dự báo doanh thu
                </h2>
                {revenue.isPending ? (
                  <div role="status" aria-label="AI đang tải dữ liệu" className="space-y-2">
                    <p className="text-body font-medium text-ai-from">AI đang tải dữ liệu</p>
                    <Skeleton className="h-56" />
                  </div>
                ) : revenue.isError && !revenue.data ? (
                  <SectionError title="Không tải được dự báo doanh thu" message={errorMessage(revenue.error)} onRetry={() => void revenue.refetch()} retrying={revenue.isFetching} />
                ) : !hasForecast ? (
                  <SectionEmpty>Chưa có dữ liệu dự báo cho chi nhánh này</SectionEmpty>
                ) : (
                  <ForecastLineChart points={points} />
                )}
              </Card>

              <Card padding="md" className="space-y-2">
                <h2 className="flex items-center gap-2 text-h4 text-gray-900">
                  <Sparkles aria-hidden className="size-5 text-ai-from" /> Gợi ý & phân tích từ dự báo
                </h2>
                {revenue.isPending || stock.isPending ? (
                  <Skeleton className="h-16" />
                ) : insights.length === 0 ? (
                  <SectionEmpty>Chưa có đủ dữ liệu để phân tích</SectionEmpty>
                ) : (
                  <ul className="space-y-2">
                    {insights.map((text) => (
                      <li key={text} className="flex gap-3 rounded-md bg-primary-50 p-3 text-body text-gray-800">
                        <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-600" />
                        {text}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="space-y-4">
              {usage.isPending || stock.isPending ? (
                <Skeleton className="h-72" />
              ) : usage.isError || stock.isError ? (
                <SectionError
                  title="Không tải được dự báo nguyên liệu"
                  message={errorMessage(usage.error) ?? errorMessage(stock.error)}
                  onRetry={() => {
                    void usage.refetch();
                    void stock.refetch();
                  }}
                  retrying={usage.isFetching || stock.isFetching}
                />
              ) : options.length === 0 ? (
                <Card padding="md"><SectionEmpty>Chưa có dự báo tiêu thụ nguyên liệu</SectionEmpty></Card>
              ) : (
                <>
                  <IngredientForecastCard options={options} selectedId={selectedId} onSelect={setPickedIngredient} bars={bars} unit={selected?.unit ?? ''} />
                  <RestockCard suggestions={suggestions} disabledReason={learning ? 'Chưa đủ lịch sử để gợi ý nhập đáng tin cậy.' : undefined} />
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
