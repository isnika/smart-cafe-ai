import { useQuery } from '@tanstack/react-query';
import { intelligenceApi } from '@/shared/api';
import type { AIForecast, ForecastType, IsoDate } from '@/shared/types';
import { addDays, HISTORY_DAYS, HORIZONS, INGREDIENT_HISTORY_DAYS } from '../model';

export const FORECAST_KEY = ['manager', 'forecast'] as const;
export const forecastKey = (branchId: number | null, type: ForecastType, today: IsoDate) =>
  [...FORECAST_KEY, branchId, type, today] as const;

const MAX_HORIZON = HORIZONS[HORIZONS.length - 1];

/** Lấy một lần cho cả cửa sổ lớn nhất; chuyển tab 7/30/90 ngày chỉ cắt dữ liệu phía client (không gọi lại API). */
const useForecastRows = (branchId: number | null, forecastType: ForecastType, today: IsoDate, historyDays: number) =>
  useQuery<AIForecast[]>({
    queryKey: forecastKey(branchId, forecastType, today),
    queryFn: () =>
      intelligenceApi.listForecasts({
        branchId: branchId as number,
        forecastType,
        from: addDays(today, -historyDays),
        to: addDays(today, MAX_HORIZON - 1),
      }),
    enabled: branchId !== null,
  });

/** Dự báo doanh thu (targetId = 0) kèm lịch sử đã backfill actualValue. */
export const useRevenueForecast = (branchId: number | null, today: IsoDate) =>
  useForecastRows(branchId, 'Revenue', today, HISTORY_DAYS);

/** Dự báo tiêu thụ của mọi nguyên liệu (nhóm theo targetId ở phía client). */
export const useIngredientForecast = (branchId: number | null, today: IsoDate) =>
  useForecastRows(branchId, 'Ingredient_Usage', today, INGREDIENT_HISTORY_DAYS);
