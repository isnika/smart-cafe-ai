import { useQuery } from '@tanstack/react-query';
import { intelligenceApi } from '@/shared/api';
import type { AIForecast, ForecastType, IsoDate } from '@/shared/types';
import { addDays, FORECAST_DAYS, INGREDIENT_FORECAST_DAYS } from '../model';

export const FORECAST_KEY = ['manager', 'forecast'] as const;
export const forecastKey = (branchId: number | null, type: ForecastType, today: IsoDate) =>
  [...FORECAST_KEY, branchId, type, today] as const;

const generatedAtFrom = (metadata?: Record<string, unknown> | null) =>
  (typeof metadata?.snapshotGeneratedAt === 'string' && metadata.snapshotGeneratedAt)
  || (typeof metadata?.trainedAt === 'string' && metadata.trainedAt)
  || new Date().toISOString();

/** Adapt the stateless AI forecast response to the view model used by the manager screen. */
export const useRevenueForecast = (branchId: number | null, today: IsoDate) =>
  useQuery<AIForecast[]>({
    queryKey: forecastKey(branchId, 'Revenue', today),
    queryFn: async () => {
      const response = await intelligenceApi.forecastRevenue({
        branchId: branchId as number,
        startDate: today,
        days: FORECAST_DAYS,
      });
      const generatedAt = generatedAtFrom(response.metadata);
      const runId = typeof response.metadata?.dataVersion === 'string'
        ? response.metadata.dataVersion
        : `${response.branchId}:${response.modelVersion}`;
      return response.forecast.map((point, index) => ({
        id: index + 1,
        branchId: response.branchId,
        forecastType: 'Revenue',
        targetId: 0,
        forecastDate: point.date,
        predictedValue: point.predictedRevenueVnd,
        lowerBound: null,
        upperBound: null,
        actualValue: null,
        modelVersion: response.modelVersion,
        runId,
        isLatest: true,
        generatedAt,
      }));
    },
    enabled: branchId !== null,
  });

/** The current AI contract forecasts inventory one target day per request. */
export const useIngredientForecast = (branchId: number | null, today: IsoDate) =>
  useQuery<AIForecast[]>({
    queryKey: forecastKey(branchId, 'Ingredient_Usage', today),
    queryFn: async () => {
      const targets = Array.from({ length: INGREDIENT_FORECAST_DAYS }, (_, index) => addDays(today, index));
      const responses = await Promise.all(targets.map((targetDate) =>
        intelligenceApi.forecastInventory({ branchId: branchId as number, targetDate }),
      ));
      const generatedAt = new Date().toISOString();
      let id = 0;
      return responses.flatMap((response, index) => response.ingredients.flatMap((ingredient) => {
        if (ingredient.status !== 'ok' || ingredient.forecastUsage == null) return [];
        return [{
          id: ++id,
          branchId: response.branchId,
          forecastType: 'Ingredient_Usage' as const,
          targetId: ingredient.ingredientId,
          forecastDate: targets[index],
          predictedValue: ingredient.forecastUsage,
          lowerBound: null,
          upperBound: null,
          actualValue: null,
          runId: `${response.branchId}:${targets[index]}`,
          isLatest: true,
          generatedAt,
        }];
      }));
    },
    enabled: branchId !== null,
  });
