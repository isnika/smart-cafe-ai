import { describe, expect, it } from 'vitest';
import type { AIForecast, InventoryItemView } from '@/shared/types';
import {
  MIN_HISTORY_DAYS, addDays, backfilledAccuracy, groupByTarget, ingredientBars, restockInsight, restockSuggestions, revenueInsight,
  revenueSeries, revenueTrend, shortDate, weekdayLabel,
} from './model';

const TODAY = '2026-11-01'; // Chủ nhật

let seq = 0;
const row = (over: Partial<AIForecast> & Pick<AIForecast, 'forecastDate'>): AIForecast => ({
  id: (seq += 1), branchId: 1, forecastType: 'Revenue', targetId: 0, predictedValue: 100, lowerBound: 90, upperBound: 110, actualValue: null,
  modelVersion: 'v', runId: 'r', isLatest: true, generatedAt: '2026-11-01T00:00:00Z', ...over,
});

/** Doanh thu: `back` ngày quá khứ có actual, `ahead` ngày từ hôm nay. */
const revenueRows = (back: number, ahead: number, predicted = 100, actual = 100): AIForecast[] => [
  ...Array.from({ length: back }, (_, i) => row({ forecastDate: addDays(TODAY, -(i + 1)), predictedValue: predicted, actualValue: actual })),
  ...Array.from({ length: ahead }, (_, i) => row({ forecastDate: addDays(TODAY, i), predictedValue: predicted })),
];

describe('ngày', () => {
  it('addDays qua tháng/năm, shortDate, weekdayLabel', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(shortDate('2026-11-05')).toBe('05/11');
    expect(weekdayLabel(TODAY)).toBe('CN');
  });
});

describe('revenueSeries', () => {
  it('cắt đúng cửa sổ: 7 ngày lịch sử + N ngày dự báo (hôm nay là ngày đầu), đánh dấu isForecast', () => {
    const rows = revenueRows(14, 90);
    const s7 = revenueSeries(rows, TODAY, 7);
    expect(s7).toHaveLength(14);
    expect(s7[0].date).toBe(addDays(TODAY, -7));
    expect(s7[6].isForecast).toBe(false);
    expect(s7[7]).toMatchObject({ date: TODAY, isForecast: true, actual: null });
    expect(s7[13].date).toBe(addDays(TODAY, 6));
    expect(revenueSeries(rows, TODAY, 30)).toHaveLength(37);
    expect(revenueSeries(rows, TODAY, 90)).toHaveLength(97);
  });

  it('bỏ loại khác Revenue; trùng ngày thì ưu tiên bản isLatest', () => {
    const rows = [
      row({ forecastDate: TODAY, predictedValue: 50, isLatest: false, id: 900 }),
      row({ forecastDate: TODAY, predictedValue: 70, isLatest: true, id: 1 }),
      row({ forecastDate: TODAY, forecastType: 'Ingredient_Usage', targetId: 2, predictedValue: 5 }),
    ];
    const s = revenueSeries(rows, TODAY, 7);
    expect(s).toHaveLength(1);
    expect(s[0].predicted).toBe(70);
  });
});

describe('backfilledAccuracy', () => {
  it('= 1 − MAPE trên ngày đã qua; sai số 10% → 90%', () => {
    const r = backfilledAccuracy(revenueRows(10, 5, 110, 100), TODAY);
    expect(r.days).toBe(10);
    expect(r.accuracy).toBeCloseTo(0.9, 5);
  });

  it('chưa đủ MIN_HISTORY_DAYS ngày có actual → accuracy null (AI đang học)', () => {
    const r = backfilledAccuracy(revenueRows(MIN_HISTORY_DAYS - 1, 5), TODAY);
    expect(r).toEqual({ days: MIN_HISTORY_DAYS - 1, accuracy: null });
    expect(backfilledAccuracy([], TODAY)).toEqual({ days: 0, accuracy: null });
  });

  it('bỏ actual = 0 / thiếu actual, không bao giờ âm', () => {
    const rows = [...revenueRows(8, 0, 1000, 100), row({ forecastDate: addDays(TODAY, -20), actualValue: 0 }), row({ forecastDate: addDays(TODAY, -21) })];
    const r = backfilledAccuracy(rows, TODAY);
    expect(r.days).toBe(8);
    expect(r.accuracy).toBe(0);
  });
});

describe('revenueTrend', () => {
  it('so trung bình dự báo/ngày với trung bình thực tế các ngày đã qua', () => {
    const points = revenueSeries([...revenueRows(7, 0, 100, 100), ...revenueRows(0, 7, 115)], TODAY, 7);
    const t = revenueTrend(points)!;
    expect(t.total).toBeCloseTo(115 * 7);
    expect(t.baselineAvg).toBe(100);
    expect(t.change).toBeCloseTo(0.15, 5);
  });

  it('không có lịch sử → change null; không có dự báo → null', () => {
    expect(revenueTrend(revenueSeries(revenueRows(0, 7), TODAY, 7))!.change).toBeNull();
    expect(revenueTrend(revenueSeries(revenueRows(7, 0), TODAY, 7))).toBeNull();
  });

  it('peak là ngày dự báo cao nhất; câu nhận định nêu đúng số liệu', () => {
    const rows = [
      ...revenueRows(7, 0, 100, 100),
      row({ forecastDate: TODAY, predictedValue: 100 }),
      row({ forecastDate: addDays(TODAY, 1), predictedValue: 300 }),
    ];
    const t = revenueTrend(revenueSeries(rows, TODAY, 7))!;
    expect(t.peak.date).toBe(addDays(TODAY, 1));
    const text = revenueInsight(t, 7);
    expect(text).toContain('7 ngày tới');
    expect(text).toContain('cao hơn 100% so với trung bình 7 ngày gần nhất');
    expect(text).toContain('T2 02/11');
  });
});

const usage = (targetId: number, predicted: number, days: number): AIForecast[] =>
  Array.from({ length: days }, (_, i) => row({ forecastDate: addDays(TODAY, i), forecastType: 'Ingredient_Usage', targetId, predictedValue: predicted }));

const stockItem = (ingredientId: number, name: string, unit: string, available: number): InventoryItemView => ({
  id: ingredientId, branchId: 1, ingredientId, quantityInStock: available, reservedQuantity: 0, reorderLevel: 0, averageCost: 1, version: 1,
  updatedAt: '2026-11-01T00:00:00Z', ingredientName: name, unit, available, isLow: false,
});

describe('ingredientBars', () => {
  it('3 ngày thực tế (không dự báo) + 7 ngày dự báo; ngày quá khứ thiếu actual thì bỏ', () => {
    const rows = [
      ...[1, 2, 3].map((n) => row({ forecastDate: addDays(TODAY, -n), forecastType: 'Ingredient_Usage', targetId: 2, predictedValue: 999, actualValue: 80 + n })),
      row({ forecastDate: addDays(TODAY, -4), forecastType: 'Ingredient_Usage', targetId: 2, actualValue: 1 }), // ngoài cửa sổ
      ...usage(2, 100, 10),
    ];
    const bars = ingredientBars(rows, TODAY);
    expect(bars).toHaveLength(10);
    expect(bars.slice(0, 3).map((b) => [b.forecast, b.value])).toEqual([[false, 83], [false, 82], [false, 81]]);
    expect(bars.slice(3).every((b) => b.forecast === true && b.value === 100)).toBe(true);
    expect(ingredientBars([row({ forecastDate: addDays(TODAY, -1), forecastType: 'Ingredient_Usage', targetId: 2 })], TODAY)).toEqual([]);
  });
});

describe('restockSuggestions', () => {
  it('thiếu khi Σ dự báo 7 ngày > tồn khả dụng; làm tròn lên bước 100; tìm đúng ngày hết', () => {
    const map = groupByTarget([...usage(2, 900, 14), ...usage(1, 100, 14)]);
    const stock = [stockItem(2, 'Arabica', 'g', 2000), stockItem(1, 'Robusta', 'g', 5000)];
    const [s, ...rest] = restockSuggestions(map, stock, TODAY);
    expect(rest).toHaveLength(0); // Robusta 700 ≤ 5000
    expect(s).toMatchObject({ ingredientId: 2, needed: 6300, available: 2000, suggestedQty: 4300 });
    expect(s.runsOutOn).toBe(addDays(TODAY, 2)); // 900+900=1800 ≤ 2000 < 2700
  });

  it('đơn vị "cái" làm tròn theo 1; hết ngay từ hôm nay khi tồn = 0; bỏ nguyên liệu không có dự báo', () => {
    const map = groupByTarget(usage(12, 8, 14));
    const [s] = restockSuggestions(map, [stockItem(12, 'Croissant', 'cái', 0), stockItem(99, 'Không dự báo', 'g', 0)], TODAY);
    expect(s).toMatchObject({ unit: 'cái', suggestedQty: 56, runsOutOn: TODAY });
    expect(restockSuggestions(map, [stockItem(99, 'Không dự báo', 'g', 0)], TODAY)).toEqual([]);
  });

  it('sắp xếp hết sớm nhất lên đầu; câu nhận định', () => {
    const map = groupByTarget([...usage(1, 1000, 14), ...usage(2, 1000, 14)]);
    const list = restockSuggestions(map, [stockItem(1, 'A', 'g', 3500), stockItem(2, 'B', 'g', 500)], TODAY);
    expect(list.map((s) => s.ingredientId)).toEqual([2, 1]);
    expect(restockInsight(list)).toContain('B và 1 nguyên liệu khác');
    expect(restockInsight([])).toContain('đủ cho nhu cầu');
  });

  it('groupByTarget bỏ dòng isLatest=false và sắp theo ngày', () => {
    const map = groupByTarget([row({ forecastDate: addDays(TODAY, 1), targetId: 2 }), row({ forecastDate: TODAY, targetId: 2 }), row({ forecastDate: TODAY, targetId: 2, isLatest: false })]);
    expect(map.get(2)!.map((r) => r.forecastDate)).toEqual([TODAY, addDays(TODAY, 1)]);
  });
});
