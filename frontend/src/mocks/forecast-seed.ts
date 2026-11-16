import type { AIForecast, ForecastType, IsoDate } from '@/shared/types';
import { BRANCH_ID } from './fixtures';
import { buildInventorySeed, seedDailyUse } from './inventory-seed';

/** Số ngày lịch sử (đã có actualValue) và số ngày dự báo phía trước mà seed phủ. UI chọn 7 / 30 / 90 ngày trong khoảng này. */
export const FORECAST_HISTORY_DAYS = 14;
export const FORECAST_HORIZON_DAYS = 90;

export const MODEL_VERSION = 'forecast-v1.4.0';
const REVENUE_TARGET_ID = 0; // theo contract: 0 = Revenue

const pad = (n: number) => String(n).padStart(2, '0');
/** IsoDate theo giờ địa phương — cùng cách UI xác định "hôm nay". */
export const isoDateLocal = (d: Date): IsoDate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Nhiễu xác định trong [-1, 1) (không dùng Math.random để seed luôn lặp lại được). */
function noise(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Hệ số theo thứ (CN, T2 … T7): cuối tuần đông hơn. */
const DOW_REVENUE = [1.18, 0.92, 0.95, 0.97, 1.0, 1.12, 1.25];
const DOW_USAGE = [1.15, 0.93, 0.95, 0.98, 1.0, 1.1, 1.22];

const REVENUE_BASE = 7_200_000; // VND / ngày
const GROWTH_PER_DAY = 0.002; // xu hướng tăng nhẹ

const roundTo = (value: number, step: number) => Math.round(value / step) * step;
const naiveUtc = (ms: number) => new Date(ms).toISOString().slice(0, 19);

interface SeriesSpec {
  forecastType: ForecastType;
  targetId: number;
  base: number;
  dow: number[];
  step: number;
  /** Độ lệch tối đa giữa thực tế và dự báo ở các ngày đã qua. */
  actualDrift: number;
}

/**
 * Sinh seed dự báo cho 1 chi nhánh, neo theo `now`:
 *   • Doanh thu (VND/ngày) và tiêu thụ từng nguyên liệu (đơn vị cơ sở g/ml/cái mỗi ngày), mỗi ngày 1 dòng.
 *   • Ngày đã qua: có actualValue (backfill) để đo độ chính xác; ngày hôm nay trở đi: chưa có actualValue, khoảng [lower, upper] rộng dần.
 *   • Thêm 1 lượt chạy cũ (isLatest=false) cho 7 ngày tới để API phải lọc đúng bản mới nhất.
 */
export function buildForecastSeed(now: number = Date.now()): AIForecast[] {
  const ingredients = buildInventorySeed(now).ingredients;
  const specs: SeriesSpec[] = [
    { forecastType: 'Revenue', targetId: REVENUE_TARGET_ID, base: REVENUE_BASE, dow: DOW_REVENUE, step: 1000, actualDrift: 0.07 },
    ...ingredients.map<SeriesSpec>((ingredient) => ({
      forecastType: 'Ingredient_Usage',
      targetId: ingredient.id,
      base: seedDailyUse(ingredient.id) ?? 100,
      dow: DOW_USAGE,
      step: ingredient.unit === 'cái' ? 1 : 10,
      actualDrift: 0.09,
    })),
  ];

  const today = new Date(now);
  const day0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const runDate = isoDateLocal(day0).replaceAll('-', '');
  const runId = `run-${runDate}-0200`;
  const staleRunId = `run-${isoDateLocal(new Date(day0.getFullYear(), day0.getMonth(), day0.getDate() - 1)).replaceAll('-', '')}-0200`;
  const generatedAt = naiveUtc(now - 6 * 3_600_000);
  const staleGeneratedAt = naiveUtc(now - 30 * 3_600_000);

  const rows: AIForecast[] = [];
  let id = 0;
  specs.forEach((spec, specIndex) => {
    for (let offset = -FORECAST_HISTORY_DAYS; offset < FORECAST_HORIZON_DAYS; offset += 1) {
      const date = new Date(day0.getFullYear(), day0.getMonth(), day0.getDate() + offset);
      const trend = 1 + GROWTH_PER_DAY * offset;
      const predicted = roundTo(spec.base * spec.dow[date.getDay()] * trend, spec.step);
      const isPast = offset < 0;
      // Khoảng bất định: hẹp ở quá khứ, rộng dần theo số ngày dự báo phía trước.
      const spread = isPast ? 0.08 : 0.05 + 0.003 * offset;
      const forecastDate = isoDateLocal(date);
      rows.push({
        id: (id += 1),
        branchId: BRANCH_ID,
        forecastType: spec.forecastType,
        targetId: spec.targetId,
        forecastDate,
        predictedValue: predicted,
        lowerBound: roundTo(predicted * (1 - spread), spec.step),
        upperBound: roundTo(predicted * (1 + spread), spec.step),
        actualValue: isPast ? roundTo(predicted * (1 + spec.actualDrift * noise(offset, specIndex + 1)), spec.step) : null,
        modelVersion: MODEL_VERSION,
        runId,
        isLatest: true,
        generatedAt,
      });
      // Lượt chạy cũ của hôm qua cho 7 ngày tới (chỉ doanh thu): số liệu hơi khác, không phải bản mới nhất.
      if (spec.forecastType === 'Revenue' && offset >= 0 && offset < 7) {
        const stale = roundTo(predicted * 0.93, spec.step);
        rows.push({
          id: (id += 1),
          branchId: BRANCH_ID,
          forecastType: 'Revenue',
          targetId: REVENUE_TARGET_ID,
          forecastDate,
          predictedValue: stale,
          lowerBound: roundTo(stale * 0.9, spec.step),
          upperBound: roundTo(stale * 1.1, spec.step),
          actualValue: null,
          modelVersion: MODEL_VERSION,
          runId: staleRunId,
          isLatest: false,
          generatedAt: staleGeneratedAt,
        });
      }
    }
  });
  return rows;
}
