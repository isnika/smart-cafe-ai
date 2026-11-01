import { http, HttpResponse } from 'msw';
import type { AIForecast, ForecastType } from '@/shared/types';
import { db } from '../db';
import { fail, guarded, url } from '../utils';
import { accountFromRequest, hasMockToken } from './identity';

const FORECAST_TYPES: ForecastType[] = ['Revenue', 'Product_Demand', 'Ingredient_Usage'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const invalid = (message: string): never => fail(400, 'VALIDATION_ERROR', message);

function intParam(sp: URLSearchParams, name: string, required: boolean): number | undefined {
  const raw = sp.get(name);
  if (raw === null || raw === '') {
    if (required) invalid(`Thiếu ${name}`);
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) invalid(`${name} không hợp lệ`);
  return n;
}

function dateParam(sp: URLSearchParams, name: 'from' | 'to'): string | undefined {
  const raw = sp.get(name);
  if (!raw) return undefined;
  if (!ISO_DATE.test(raw) || Number.isNaN(Date.parse(raw))) invalid(`${name} phải có dạng YYYY-MM-DD`);
  return raw;
}

/** Dự báo là dữ liệu quản trị: phải đăng nhập (401) và là Quản lý (403). */
function requireManager(request: Request): void {
  const account = accountFromRequest(request);
  if (!account) {
    if (hasMockToken(request)) fail(401, 'UNAUTHORIZED', 'Phiên đăng nhập không còn hợp lệ');
    fail(401, 'UNAUTHORIZED', 'Chưa đăng nhập');
    return;
  }
  if (account.roleName !== 'Manager') fail(403, 'FORBIDDEN', 'Chỉ quản lý mới xem được dự báo AI');
}

export const intelligenceHandlers = [
  // GET /intelligence/forecasts?branchId=&forecastType=&targetId=&from=&to=   (from/to: IsoDate, gồm cả hai đầu)
  // Chỉ trả lượt chạy mới nhất (isLatest), sắp theo targetId rồi forecastDate tăng dần.
  http.get(
    url('/intelligence/forecasts'),
    guarded(({ request }) => {
      requireManager(request);
      const sp = new URL(request.url).searchParams;
      const branchId = intParam(sp, 'branchId', true);
      const forecastType = sp.get('forecastType') as ForecastType | null;
      if (!forecastType) invalid('Thiếu forecastType');
      if (!FORECAST_TYPES.includes(forecastType as ForecastType)) invalid(`forecastType không hợp lệ: ${forecastType}`);
      const targetId = intParam(sp, 'targetId', false);
      const from = dateParam(sp, 'from');
      const to = dateParam(sp, 'to');
      if (from && to && from > to) invalid('from phải nhỏ hơn hoặc bằng to');

      const rows = db.forecasts
        .filter((f) => f.isLatest && f.branchId === branchId && f.forecastType === forecastType)
        .filter((f) => targetId === undefined || f.targetId === targetId)
        .filter((f) => (!from || f.forecastDate >= from) && (!to || f.forecastDate <= to))
        .sort((a, b) => a.targetId - b.targetId || a.forecastDate.localeCompare(b.forecastDate));
      return HttpResponse.json<AIForecast[]>(rows);
    }),
  ),
];
