import { useMemo, useState } from 'react';
import { formatVnd } from '@/shared/lib';
import type { RevenueTimelinePoint } from '@/shared/api/order';

const W = 680;
const H = 260;
const PAD_L = 56;
const PAD_R = 20;
const TOP = 20;
const BOTTOM = 36;

function formatCompact(val: number): string {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${Math.round(val / 1_000)}k`;
  return String(val);
}

function niceCeil(val: number): number {
  if (val <= 0) return 100_000;
  const p = Math.pow(10, Math.floor(Math.log10(val)));
  const f = val / p;
  const c = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return c * p;
}

export function AdminRevenueTimelineChart({ data }: { data: RevenueTimelinePoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - TOP - BOTTOM;
  const n = data.length;

  const maxVal = useMemo(() => {
    const top = Math.max(0, ...data.map((d) => d.revenue));
    return niceCeil(top);
  }, [data]);

  const ticks = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];

  const xOf = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yOf = (val: number) => TOP + plotH - (maxVal > 0 ? (val / maxVal) * plotH : 0);

  const points = useMemo(() => {
    return data.map((d, i): [number, number] => [xOf(i), yOf(d.revenue)]);
  }, [data, maxVal]);

  const linePath = useMemo(() => {
    if (points.length === 0) return '';
    return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const firstX = points[0][0];
    const lastX = points[points.length - 1][0];
    const groundY = TOP + plotH;
    return `${linePath} L${lastX.toFixed(1)} ${groundY} L${firstX.toFixed(1)} ${groundY} Z`;
  }, [linePath, points]);

  const totalRevenue = useMemo(() => data.reduce((s, d) => s + d.revenue, 0), [data]);
  const totalOrders = useMemo(() => data.reduce((s, d) => s + d.ordersCount, 0), [data]);

  if (data.length === 0) {
    return (
      <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
        <p className="text-sm font-medium text-gray-600">Chưa có dữ liệu doanh thu trong khoảng thời gian này</p>
        <p className="mt-1 text-xs text-gray-400">Dữ liệu sẽ hiển thị khi có đơn hàng được thanh toán và hoàn thành</p>
      </div>
    );
  }

  const activePoint = hoverIndex !== null && hoverIndex >= 0 && hoverIndex < data.length ? data[hoverIndex] : null;

  return (
    <figure className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 font-medium text-gray-700">
            <span className="inline-block size-3 rounded-full bg-primary-600" />
            Doanh thu thực nhận
          </span>
          <span className="text-gray-500">
            Tổng: <strong className="text-gray-900">{formatVnd(totalRevenue)}</strong> ({totalOrders} đơn)
          </span>
        </div>
        {activePoint && (
          <div className="rounded-lg bg-gray-900 px-2.5 py-1 text-white shadow-sm">
            <span className="font-semibold text-amber-300">{activePoint.period}</span>: {formatVnd(activePoint.revenue)} ({activePoint.ordersCount} đơn)
          </div>
        )}
      </div>

      <div className="relative overflow-hidden rounded-xl border border-gray-100 bg-white p-3 shadow-xs">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Biểu đồ xu hướng doanh thu" className="h-auto w-full overflow-visible">
          <defs>
            <linearGradient id="revenueTimelineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8c5835" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#8c5835" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines & Y-axis labels */}
          {ticks.map((tick) => {
            const y = yOf(tick);
            return (
              <g key={tick}>
                <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="#f1f5f9" strokeWidth={1} strokeDasharray={tick === 0 ? '' : '3 3'} />
                <text x={PAD_L - 8} y={y + 3.5} textAnchor="end" fontSize={10} className="fill-gray-400 font-mono">
                  {formatCompact(tick)}
                </text>
              </g>
            );
          })}

          {/* Shaded Area */}
          {areaPath && <path d={areaPath} fill="url(#revenueTimelineGradient)" />}

          {/* Line */}
          {linePath && <path d={linePath} fill="none" stroke="#8c5835" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}

          {/* Interactive vertical hover indicator */}
          {hoverIndex !== null && points[hoverIndex] && (
            <line
              x1={points[hoverIndex][0]}
              x2={points[hoverIndex][0]}
              y1={TOP}
              y2={TOP + plotH}
              stroke="#8c5835"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          )}

          {/* Data points & X-axis labels */}
          {points.map(([x, y], i) => {
            const isHovered = hoverIndex === i;
            const item = data[i];
            const showLabel = n <= 7 || i % Math.ceil(n / 7) === 0 || i === n - 1;

            return (
              <g
                key={item.period}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
                className="cursor-pointer"
              >
                {/* Hit area for easy mouse hover */}
                <rect x={x - plotW / (2 * Math.max(1, n - 1))} y={TOP} width={plotW / Math.max(1, n - 1)} height={plotH} fill="transparent" />

                {/* Point circle */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 6 : 4}
                  className={isHovered ? 'fill-amber-500 stroke-white' : 'fill-primary-700 stroke-white'}
                  strokeWidth={2}
                />

                {/* Date label */}
                {showLabel && (
                  <text x={x} y={H - 12} textAnchor="middle" fontSize={10} className="fill-gray-400 font-medium">
                    {item.period.length > 5 ? item.period.slice(5) : item.period}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}
