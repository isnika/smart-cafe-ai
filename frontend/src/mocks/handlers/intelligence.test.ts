// @vitest-environment jsdom
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
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
  const res = await fetch(url(`/ai/forecasts?${query}`), { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
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

describe('GET /ai/forecasts', () => {
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

describe('intelligenceApi.getRecommendations', () => {
  it('uses the AI Gateway response and normalizes its snake_case fields', async () => {
    token = await login('customer@smartcafe.vn');
    const response = await intelligenceApi.getRecommendations(
      { mode: 'personalized', topK: 6 },
      BRANCH_ID,
    );
    expect(response.modelVersion).toBe('mock-ai-recommendation');
    expect(response.recommendations[0]).toMatchObject({
      productId: 5,
      priceVnd: expect.any(Number),
      score: 0.92,
    });
  });

  it('fallbacks to the direct AI Service recommendation route on gateway 404', async () => {
    token = await login('customer@smartcafe.vn');
    server.use(
      http.post(url('/ai/recommendation'), () => HttpResponse.json({ message: 'Not Found' }, { status: 404 }), { once: true }),
      http.post(/\/ai-service\/api\/recommendation$/, () => HttpResponse.json({
        user_id: 'u-customer',
        branch_id: BRANCH_ID,
        strategy: 'personalized',
        model_version: 'direct-ai-v1',
        recommendations: [{ product_id: 5, name: 'Trà đào cam sả', price_vnd: 45000, score: 0.9 }],
      })),
    );

    const response = await intelligenceApi.getRecommendations({ mode: 'personalized', topK: 6 }, BRANCH_ID);
    expect(response.modelVersion).toBe('direct-ai-v1');
    expect(response.recommendations[0]?.productId).toBe(5);
  });

  describe('intelligenceApi.forecastInventory', () => {
    it('uses the target-date gateway contract without inventing a model version', async () => {
      const targetDate = day(0);
      const response = await intelligenceApi.forecastInventory({ branchId: BRANCH_ID, targetDate });
      expect(response.targetDate).toBe(targetDate);
      expect(response.branchId).toBe(BRANCH_ID);
      expect(response.ingredients[0]).toMatchObject({
        ingredientId: expect.any(Number),
        status: 'ok',
      });
      expect(response).not.toHaveProperty('modelVersion');
    });
  });
});
