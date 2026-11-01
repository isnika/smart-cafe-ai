import { formatVnd } from '@/shared/lib';
import { formatCompactVnd, type HourlyRevenue } from '../model';

const W = 640;
const H = 220;
const PAD_L = 44;
const PAD_R = 8;
const TOP = 14;
const BOTTOM = 26;
const LABEL_EVERY = 3;

/** Làm tròn lên mốc "đẹp" (1/2/5 × 10^k) để trục tiền dễ đọc. */
function niceCeil(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 5, 10].map((m) => m * magnitude).find((v) => v >= value) ?? value);
}

/** Cột doanh thu đã thu theo 24 giờ trong ngày, vẽ bằng SVG thuần (không dùng thư viện chart). */
export function HourlyRevenueChart({ data }: { data: HourlyRevenue[] }) {
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - TOP - BOTTOM;
  const slot = plotW / data.length;
  const barW = slot * 0.6;
  const total = data.reduce((sum, d) => sum + d.amount, 0);
  const peak = data.reduce((best, d) => (d.amount > best.amount ? d : best), data[0]);
  const yMax = total > 0 ? niceCeil(peak.amount) : 0;
  const ticks = yMax > 0 ? [0, yMax / 2, yMax] : [0];
  const yOf = (value: number) => TOP + plotH - (yMax > 0 ? (value / yMax) * plotH : 0);

  const summary =
    total > 0
      ? `Doanh thu đã thu theo giờ hôm nay: tổng ${formatVnd(total)}, cao nhất lúc ${peak.hour} giờ với ${formatVnd(peak.amount)}.`
      : 'Doanh thu đã thu theo giờ hôm nay: chưa có đơn nào đã thanh toán.';

  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto w-full">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD_L} x2={W - PAD_R} y1={yOf(tick)} y2={yOf(tick)} className={tick === 0 ? 'stroke-gray-300' : 'stroke-gray-100'} strokeWidth={1} />
            <text x={PAD_L - 6} y={yOf(tick) + 3} textAnchor="end" fontSize={10} className="fill-gray-500">
              {formatCompactVnd(tick)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD_L + i * slot;
          const barX = x + (slot - barW) / 2;
          const h = d.amount > 0 ? Math.max(3, (d.amount / yMax) * plotH) : 0;
          const isPeak = total > 0 && d.hour === peak.hour;
          return (
            <g key={d.hour}>
              <title>{`${d.hour}h–${d.hour + 1}h: ${formatVnd(d.amount)} · ${d.orders} đơn đã thu`}</title>
              {/* Vùng hover phủ cả cột để giờ không có doanh thu vẫn hiện tooltip */}
              <rect x={x} y={TOP} width={slot} height={plotH} fill="transparent" />
              {h > 0 ? (
                <rect x={barX} y={TOP + plotH - h} width={barW} height={h} rx={2} className={isPeak ? 'fill-primary-700' : 'fill-primary-400'} />
              ) : (
                <rect x={barX} y={TOP + plotH - 2} width={barW} height={2} rx={1} className="fill-gray-200" />
              )}
              {d.hour % LABEL_EVERY === 0 && (
                <text x={x + slot / 2} y={H - 8} textAnchor="middle" fontSize={10} className="fill-gray-500">
                  {`${d.hour}h`}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-caption text-gray-500">
        {total > 0 ? `Cao nhất lúc ${peak.hour}h (${formatVnd(peak.amount)}) · giờ địa phương, chỉ tính đơn đã thanh toán` : 'Chưa có đơn nào đã thanh toán hôm nay.'}
      </figcaption>
    </figure>
  );
}
