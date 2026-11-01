import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureHttp, intelligenceApi, isApiError } from '@/shared/api';
import type { AIForecast } from '@/shared/types';
import { BRANCH_ID, db, resetDb } from '../db';
import { FORECAST_HISTORY_DAYS, FORECAST_HORIZON_DAYS, isoDateLocal } from '../forecast-seed';
import { mockConfig, url } from '../utils';
import { MOCK_PASSWORD, resetAuthMock } from './identity';
import { handlers } from './index';

const server = setupServer(...handlers);
let token: string | undefined;
beforeAll(() => {
  server.listen();
  configureHttp({ getToken: () => token ?? null });
});
afterAll(() => server.close());
beforeEach(async () => {
  resetDb();
  resetAuthMock();
  mockConfig.latencyMs = 0;
  mockConfig.enforceAuth = false;
  token = await login('manager@smartcafe.vn');
});
afterEach(() => server.resetHandlers());

async function login(identifier: string): Promise<string> {
  const res = await fetch(url('/identity/auth/login'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password: MOCK_PASSWORD }),
  });
  return ((await res.json()) as { accessToken: string }).accessToken;
}

const day = (offset: number) => {
  const d = new Date();
  return isoDateLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset));
};

async function raw(query: string, bearer: string | undefined = token) {
  const res = await fetch(url(`/intelligence/forecasts?${query}`), { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
  return { status: res.status, body: (await res.json()) as AIForecast[] & { code?: string } };
}

describe('seed dự báo', () => {
  it('phủ doanh thu + 12 nguyên liệu, mỗi ngày đúng 1 dòng mới nhất, chỉ ngày đã qua có actualValue', () => {
    const latest = db.forecasts.filter((f) => f.isLatest);
    const span = FORECAST_HISTORY_DAYS + FORECAST_HORIZON_DAYS;
    expect(latest.filter((f) => f.forecastType === 'Revenue')).toHaveLength(span);
    expect(latest.filter((f) => f.forecastType === 'Ingredient_Usage')).toHaveLength(12 * span);
    expect(new Set(latest.filter((f) => f.forecastType === 'Revenue').map((f) => f.forecastDate)).size).toBe(span);
    const today = day(0);
    for (const f of latest) {
      expect(f.actualValue != null).toBe(f.forecastDate < today);
      expect(f.lowerBound!).toBeLessThanOrEqual(f.predictedValue);
      expect(f.upperBound!).toBeGreaterThanOrEqual(f.predictedValue);
    }
    expect(db.forecasts.some((f) => !f.isLatest)).toBe(true);
  });
});

describe('GET /intelligence/forecasts', () => {
  it('trả doanh thu (targetId 0) tăng dần theo ngày và bỏ lượt chạy cũ', async () => {
    const { status, body } = await raw(`branchId=${BRANCH_ID}&forecastType=Revenue`);
    expect(status).toBe(200);
    expect(body.every((f) => f.forecastType === 'Revenue' && f.targetId === 0 && f.isLatest)).toBe(true);
    expect(body.map((f) => f.forecastDate)).toEqual([...body.map((f) => f.forecastDate)].sort());
    expect(new Set(body.map((f) => f.forecastDate)).size).toBe(body.length);
  });

  it('lọc theo from/to (gồm cả hai đầu) và targetId', async () => {
    const range = await raw(`branchId=${BRANCH_ID}&forecastType=Revenue&from=${day(0)}&to=${day(6)}`);
    expect(range.body).toHaveLength(7);
    expect(range.body[0].forecastDate).toBe(day(0));
    expect(range.body[6].forecastDate).toBe(day(6));

    const one = await raw(`branchId=${BRANCH_ID}&forecastType=Ingredient_Usage&targetId=2&from=${day(-3)}&to=${day(6)}`);
    expect(one.body).toHaveLength(10);
    expect(one.body.every((f) => f.targetId === 2)).toBe(true);
  });

  it('chi nhánh không có dữ liệu / loại chưa có seed → mảng rỗng', async () => {
    expect((await raw('branchId=99&forecastType=Revenue')).body).toEqual([]);
    expect((await raw(`branchId=${BRANCH_ID}&forecastType=Product_Demand`)).body).toEqual([]);
  });

  it('tham số sai → 400', async () => {
    for (const q of ['forecastType=Revenue', `branchId=${BRANCH_ID}`, `branchId=${BRANCH_ID}&forecastType=Nope`, `branchId=${BRANCH_ID}&forecastType=Revenue&from=01-11-2026`, `branchId=${BRANCH_ID}&forecastType=Revenue&from=${day(5)}&to=${day(1)}`]) {
      const res = await raw(q);
      expect(res.status, q).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('chưa đăng nhập → 401, không phải Quản lý → 403', async () => {
    expect((await raw(`branchId=${BRANCH_ID}&forecastType=Revenue`, '')).status).toBe(401);
    const staff = await login('staff@smartcafe.vn');
    expect((await raw(`branchId=${BRANCH_ID}&forecastType=Revenue`, staff)).status).toBe(403);
  });
});

describe('intelligenceApi.listForecasts', () => {
  it('đi qua http client, nhận đúng AIForecast[] và chuẩn hoá generatedAt thành ISO có timezone', async () => {
    const rows = await intelligenceApi.listForecasts({ branchId: BRANCH_ID, forecastType: 'Revenue', from: day(-7), to: day(6) });
    expect(rows).toHaveLength(14);
    expect(rows[0]).toMatchObject({ branchId: BRANCH_ID, forecastType: 'Revenue', targetId: 0, isLatest: true });
    expect(rows[0].generatedAt).toMatch(/Z$/);
    expect(typeof rows[0].predictedValue).toBe('number');
  });

  it('401 được ném thành ApiError', async () => {
    token = undefined;
    const err = await intelligenceApi.listForecasts({ branchId: BRANCH_ID, forecastType: 'Revenue' }).catch((e: unknown) => e);
    expect(isApiError(err) && err.status === 401).toBe(true);
  });
});
