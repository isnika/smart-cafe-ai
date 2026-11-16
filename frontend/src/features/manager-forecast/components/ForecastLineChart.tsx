import { formatVnd } from '@/shared/lib';
import { formatCompactVnd, niceCeil } from '@/features/manager-dashboard/model';
import type { RevenuePoint } from '../model';

const W = 640;
const H = 240;
const PAD_L = 44;
const PAD_R = 12;
const TOP = 14;
const BOTTOM = 28;
const MAX_LABELS = 7;

const path = (coords: [number, number][]) => coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

/**
 * Doanh thu: thực tế (xám) so với dự báo (nâu) + vùng [lower, upper] của phần dự báo. SVG thuần, cùng khung/trục/nhãn tiền
 * (formatCompactVnd, niceCeil) với biểu đồ doanh thu của Dashboard — không dùng thư viện chart.
 */
export function ForecastLineChart({ points }: { points: RevenuePoint[] }) {
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - TOP - BOTTOM;
  const n = points.length;
  const top = Math.max(1, ...points.flatMap((p) => [p.predicted, p.upper ?? 0, p.actual ?? 0]));
  const yMax = niceCeil(top);
  const xOf = (i: number) => PAD_L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yOf = (v: number) => TOP + plotH - (v / yMax) * plotH;
  const ticks = [0, yMax / 2, yMax];

  const predicted = points.map((p, i): [number, number] => [xOf(i), yOf(p.predicted)]);
  const actual = points.flatMap((p, i): [number, number][] => (p.actual !== null ? [[xOf(i), yOf(p.actual)]] : []));
  const band = points.flatMap((p, i) => (p.isForecast && p.lower !== null && p.upper !== null ? [{ x: xOf(i), lo: yOf(p.lower), hi: yOf(p.upper) }] : []));
  const bandPath = band.length > 1 ? `${path(band.map((b) => [b.x, b.hi]))} ${band.slice().reverse().map((b) => `L${b.x.toFixed(1)} ${b.lo.toFixed(1)}`).join(' ')} Z` : '';
  const firstForecast = points.findIndex((p) => p.isForecast);
  const step = Math.max(1, Math.ceil(n / MAX_LABELS));

  const forecastDays = points.filter((p) => p.isForecast);
  const total = forecastDays.reduce((s, p) => s + p.predicted, 0);
  const summary = `Biểu đồ doanh thu: ${n} ngày, gồm lịch sử thực tế và dự báo ${forecastDays.length} ngày tới, tổng dự báo ${formatVnd(total)}.`;

  return (
    <figure className="space-y-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-gray-600" aria-label="Chú giải">
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 rounded bg-gray-400" />Lịch sử thực tế</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 rounded bg-primary-600" />Dự báo AI</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-4 rounded-sm bg-primary-600/15" />Khoảng dự báo (thấp nhất – cao nhất)</li>
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto w-full">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD_L} x2={W - PAD_R} y1={yOf(tick)} y2={yOf(tick)} className={tick === 0 ? 'stroke-gray-300' : 'stroke-gray-100'} strokeWidth={1} />
            <text x={PAD_L - 6} y={yOf(tick) + 3} textAnchor="end" fontSize={10} className="fill-gray-500">{formatCompactVnd(tick)}</text>
          </g>
        ))}
        {bandPath && <path d={bandPath} className="fill-primary-600/15" data-testid="forecast-band" />}
        {firstForecast > 0 && (
          <g>
            <line x1={xOf(firstForecast)} x2={xOf(firstForecast)} y1={TOP} y2={TOP + plotH} className="stroke-gray-300" strokeDasharray="3 3" />
            <text x={xOf(firstForecast) + 4} y={TOP + 10} fontSize={10} className="fill-gray-500">Hôm nay</text>
          </g>
        )}
        {actual.length > 1 && <path d={path(actual)} fill="none" className="stroke-gray-400" strokeWidth={2} data-testid="forecast-actual-line" />}
        {predicted.length > 1 && <path d={path(predicted)} fill="none" className="stroke-primary-600" strokeWidth={2} data-testid="forecast-predicted-line" />}
        {points.map((p, i) => {
          const slot = plotW / Math.max(1, n - 1);
          const tip = [
            `${p.label}${p.isForecast ? ' (dự báo)' : ''}`,
            `Dự báo: ${formatVnd(p.predicted)}`,
            p.lower !== null && p.upper !== null ? `Khoảng: ${formatVnd(p.lower)} – ${formatVnd(p.upper)}` : null,
            p.actual !== null ? `Thực tế: ${formatVnd(p.actual)}` : null,
          ].filter(Boolean).join(' · ');
          return (
            <g key={p.date}>
              <title>{tip}</title>
              <rect x={xOf(i) - slot / 2} y={TOP} width={slot} height={plotH} fill="transparent" />
              {n <= 31 && <circle cx={xOf(i)} cy={yOf(p.predicted)} r={2.5} className="fill-primary-600" />}
              {i % step === 0 && <text x={xOf(i)} y={H - 8} textAnchor="middle" fontSize={10} className="fill-gray-500">{p.label}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-caption text-gray-500">Đơn vị: VND/ngày · đường nâu là dự báo, đường xám là doanh thu thực tế đã ghi nhận.</figcaption>
    </figure>
  );
}
