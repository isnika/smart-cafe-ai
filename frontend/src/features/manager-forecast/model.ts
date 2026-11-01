import type { AIForecast, InventoryItemView, IsoDate } from '@/shared/types';
import { formatCompactVnd, formatPercent } from '@/features/manager-dashboard/model';
import type { ConsumptionBar } from '@/features/manager-inventory/components/ConsumptionChart';
import { formatQty } from '@/features/manager-inventory/model';
import { formatVnd } from '@/shared/lib';

// ── Khoảng thời gian ──────────────────────────────────────────────────
export const HORIZONS = [7, 30, 90] as const;
export type Horizon = (typeof HORIZONS)[number];
export const DEFAULT_HORIZON: Horizon = 7;

/** Số ngày lịch sử (đã qua) hiển thị cạnh dự báo trên biểu đồ doanh thu. */
export const HISTORY_DAYS = 7;
/** Cần tối thiểu từng này ngày có giá trị thực tế (backfill) mới đo độ chính xác; ít hơn → AI "đang học dữ liệu". */
export const MIN_HISTORY_DAYS = 7;
/** Cửa sổ nhu cầu dùng để gợi ý nhập hàng, độc lập với tab 7/30/90 (nhập hàng cần đủ cho vài ngày tới, không phải cả quý). */
export const RESTOCK_WINDOW_DAYS = 7;
/** Biểu đồ tiêu thụ nguyên liệu: số ngày thực tế gần nhất + số ngày dự báo hiển thị. */
export const INGREDIENT_HISTORY_DAYS = 3;
export const INGREDIENT_FORECAST_DAYS = 7;

// ── Ngày (IsoDate, giờ địa phương) ────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
export const toIsoDate = (d: Date): IsoDate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIsoDate = (iso: IsoDate): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = parseIsoDate(iso);
  return toIsoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}
/** "2026-11-01" → "01/11". */
export const shortDate = (iso: IsoDate): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;
export const weekdayLabel = (iso: IsoDate): string => WEEKDAY[parseIsoDate(iso).getDay()];

// ── Doanh thu ─────────────────────────────────────────────────────────
export interface RevenuePoint {
  date: IsoDate;
  /** dd/MM */
  label: string;
  predicted: number;
  lower: number | null;
  upper: number | null;
  /** Giá trị thực tế đã backfill (chỉ có ở ngày đã qua). */
  actual: number | null;
  /** date >= hôm nay. */
  isForecast: boolean;
}

/** Cửa sổ của biểu đồ: HISTORY_DAYS ngày trước hôm nay → hết `horizon` ngày dự báo (hôm nay là ngày đầu tiên). */
export function revenueSeries(rows: readonly AIForecast[], today: IsoDate, horizon: Horizon): RevenuePoint[] {
  const from = addDays(today, -HISTORY_DAYS);
  const to = addDays(today, horizon - 1);
  const byDate = new Map<IsoDate, AIForecast>();
  for (const row of rows) {
    if (row.forecastType !== 'Revenue' || row.forecastDate < from || row.forecastDate > to) continue;
    const current = byDate.get(row.forecastDate);
    if (!current || row.isLatest || row.id > current.id) byDate.set(row.forecastDate, row);
  }
  return [...byDate.values()]
    .sort((a, b) => a.forecastDate.localeCompare(b.forecastDate))
    .map((row) => ({
      date: row.forecastDate,
      label: shortDate(row.forecastDate),
      predicted: row.predictedValue,
      lower: row.lowerBound ?? null,
      upper: row.upperBound ?? null,
      actual: row.actualValue ?? null,
      isForecast: row.forecastDate >= today,
    }));
}

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

export interface BackfilledAccuracy {
  /** Số ngày đã qua có cả actualValue lẫn predictedValue. */
  days: number;
  /** 1 − MAPE trong [0, 1]; null khi chưa đủ MIN_HISTORY_DAYS. */
  accuracy: number | null;
}

/** Độ chính xác đo được trên các ngày đã qua: 1 − mean(|thực tế − dự báo| / thực tế). Không phải chỉ số do model báo. */
export function backfilledAccuracy(rows: readonly AIForecast[], today: IsoDate): BackfilledAccuracy {
  const errors: number[] = [];
  for (const row of rows) {
    if (row.forecastDate >= today || row.actualValue == null || row.actualValue <= 0) continue;
    errors.push(Math.abs(row.actualValue - row.predictedValue) / row.actualValue);
  }
  if (errors.length < MIN_HISTORY_DAYS) return { days: errors.length, accuracy: null };
  return { days: errors.length, accuracy: Math.max(0, 1 - sum(errors) / errors.length) };
}

export interface RevenueTrend {
  /** Σ dự báo trong `horizon` ngày tới (từ hôm nay). */
  total: number;
  /** Trung bình/ngày của dự báo. */
  forecastAvg: number;
  /** Trung bình/ngày thực tế của các ngày đã qua trong cửa sổ lịch sử; null nếu chưa có. */
  baselineAvg: number | null;
  /** forecastAvg / baselineAvg − 1; null nếu không có mốc so sánh. */
  change: number | null;
  /** Ngày dự báo cao nhất. */
  peak: RevenuePoint;
}

export function revenueTrend(points: readonly RevenuePoint[]): RevenueTrend | null {
  const future = points.filter((p) => p.isForecast);
  if (future.length === 0) return null;
  const actuals = points.filter((p) => !p.isForecast && p.actual !== null).map((p) => p.actual as number);
  const total = sum(future.map((p) => p.predicted));
  const forecastAvg = total / future.length;
  const baselineAvg = actuals.length > 0 ? sum(actuals) / actuals.length : null;
  const peak = future.reduce((best, p) => (p.predicted > best.predicted ? p : best), future[0]);
  return { total, forecastAvg, baselineAvg, change: baselineAvg ? forecastAvg / baselineAvg - 1 : null, peak };
}

// ── Tiêu thụ nguyên liệu ──────────────────────────────────────────────
export function groupByTarget(rows: readonly AIForecast[]): Map<number, AIForecast[]> {
  const map = new Map<number, AIForecast[]>();
  for (const row of rows) {
    if (!row.isLatest) continue;
    const list = map.get(row.targetId);
    if (list) list.push(row);
    else map.set(row.targetId, [row]);
  }
  for (const list of map.values()) list.sort((a, b) => a.forecastDate.localeCompare(b.forecastDate));
  return map;
}

/** Vài ngày thực tế gần nhất (xám) rồi các ngày dự báo (tím), cho ConsumptionChart. */
export function ingredientBars(rows: readonly AIForecast[], today: IsoDate): ConsumptionBar[] {
  const from = addDays(today, -INGREDIENT_HISTORY_DAYS);
  const to = addDays(today, INGREDIENT_FORECAST_DAYS - 1);
  const bars: ConsumptionBar[] = [];
  for (const row of rows) {
    if (row.forecastDate < from || row.forecastDate > to) continue;
    const forecast = row.forecastDate >= today;
    if (!forecast && row.actualValue == null) continue; // ngày quá khứ chưa có số thực tế thì bỏ, không thay bằng dự báo
    bars.push({ date: row.forecastDate, label: shortDate(row.forecastDate), value: forecast ? row.predictedValue : (row.actualValue as number), forecast });
  }
  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

export interface IngredientOption {
  id: number;
  name: string;
  unit: string;
}

// ── Gợi ý nhập hàng (tính từ dự báo + tồn kho hiện có) ────────────────
export interface RestockSuggestion {
  ingredientId: number;
  name: string;
  unit: string;
  /** Tồn khả dụng = tồn − đang giữ (đúng định nghĩa của màn Kho). */
  available: number;
  /** Σ dự báo tiêu thụ trong RESTOCK_WINDOW_DAYS ngày tới. */
  needed: number;
  /** Phần thiếu, làm tròn lên bước nhập (100 g/ml; 1 cái). */
  suggestedQty: number;
  /** Ngày đầu tiên tồn khả dụng không đủ cho tiêu thụ dự báo tích luỹ. */
  runsOutOn: IsoDate;
}

const stepOf = (unit: string) => (unit === 'cái' ? 1 : 100);

export function restockSuggestions(
  forecastsByIngredient: ReadonlyMap<number, readonly AIForecast[]>,
  stock: readonly InventoryItemView[],
  today: IsoDate,
): RestockSuggestion[] {
  const last = addDays(today, RESTOCK_WINDOW_DAYS - 1);
  const result: RestockSuggestion[] = [];
  for (const item of stock) {
    const days = (forecastsByIngredient.get(item.ingredientId) ?? []).filter((r) => r.forecastDate >= today && r.forecastDate <= last);
    if (days.length === 0) continue;
    const available = Math.max(0, item.available);
    const needed = sum(days.map((d) => d.predictedValue));
    if (needed <= available) continue;
    let cumulative = 0;
    const runsOutOn = (days.find((d) => (cumulative += d.predictedValue) > available) ?? days[days.length - 1]).forecastDate;
    const step = stepOf(item.unit);
    result.push({
      ingredientId: item.ingredientId,
      name: item.ingredientName,
      unit: item.unit,
      available,
      needed,
      suggestedQty: Math.ceil((needed - available) / step) * step,
      runsOutOn,
    });
  }
  // Gấp nhất (hết sớm nhất, rồi thiếu nhiều nhất) lên đầu.
  return result.sort((a, b) => a.runsOutOn.localeCompare(b.runsOutOn) || b.suggestedQty / b.needed - a.suggestedQty / a.needed);
}

// ── Nhận định (câu chữ sinh từ số liệu, không phải đầu ra của model) ──
export function revenueInsight(trend: RevenueTrend, horizon: Horizon): string {
  const parts = [`Doanh thu dự báo ${horizon} ngày tới khoảng ${formatVnd(trend.total)} (trung bình ${formatCompactVnd(trend.forecastAvg)}/ngày)`];
  if (trend.change !== null) {
    const pct = formatPercent(Math.abs(trend.change));
    parts.push(trend.change >= 0 ? `cao hơn ${pct} so với trung bình ${HISTORY_DAYS} ngày gần nhất` : `thấp hơn ${pct} so với trung bình ${HISTORY_DAYS} ngày gần nhất`);
  }
  return `${parts.join(', ')}. Ngày cao nhất: ${weekdayLabel(trend.peak.date)} ${trend.peak.label} (~${formatCompactVnd(trend.peak.predicted)}).`;
}

export function restockInsight(suggestions: readonly RestockSuggestion[]): string {
  if (suggestions.length === 0) return `Tồn kho hiện tại đủ cho nhu cầu dự báo ${RESTOCK_WINDOW_DAYS} ngày tới.`;
  const first = suggestions[0];
  const rest = suggestions.length > 1 ? ` và ${suggestions.length - 1} nguyên liệu khác` : '';
  return `${first.name}${rest} có nguy cơ thiếu trong ${RESTOCK_WINDOW_DAYS} ngày tới; ${first.name} dự kiến hết từ ${shortDate(first.runsOutOn)} (cần thêm khoảng ${formatQty(first.suggestedQty)} ${first.unit}).`;
}
