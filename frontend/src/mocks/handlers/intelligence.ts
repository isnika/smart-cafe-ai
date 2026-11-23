import { http, HttpResponse } from 'msw';
import type { AIForecast, ForecastType, RecommendationView } from '@/shared/types';
import { BRANCH_ID, db, isExpired, nowNaive, toMenuProduct } from '../db';
import { seedCategories } from '../fixtures';
import { fail, guarded, readJson, url } from '../utils';
import { accountFromRequest, hasMockToken, type MockAccount } from './identity';

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

/**
 * Gợi ý là dữ liệu của chính người gọi (`/me`): luôn cần token hợp lệ, không phụ thuộc mockConfig.enforceAuth
 * (giống GET /identity/users/me). Khách vãng lai không có gợi ý → 401; UI không gọi API khi chưa đăng nhập.
 */
function requireAccount(request: Request): MockAccount {
  const account = accountFromRequest(request);
  if (!account) fail(401, 'UNAUTHORIZED', hasMockToken(request) ? 'Phiên đăng nhập không còn hợp lệ' : 'Chưa đăng nhập');
  return account;
}

export const intelligenceHandlers = [
  // POST /ai/recommendation → mock of the live AI Gateway contract.
  http.post(
    url('/ai/recommendation'),
    guarded(async ({ request }) => {
      const account = requireAccount(request);
      const body = await readJson<{ mode?: string; product_id?: number; top_k?: number }>(request);
      const branchHeader = request.headers.get('X-Branch-Id');
      const branchId = branchHeader === null ? BRANCH_ID : Number(branchHeader);
      if (!Number.isInteger(branchId) || branchId < 1) invalid('X-Branch-Id không hợp lệ');
      if (branchId !== BRANCH_ID) fail(404, 'BRANCH_NOT_FOUND', `Không có chi nhánh ${branchId}`);
      if (body.top_k !== undefined && (!Number.isInteger(body.top_k) || body.top_k < 1 || body.top_k > 50)) {
        invalid('topK không hợp lệ');
      }

      const categoryName = new Map(seedCategories().map((category) => [category.id, category.name]));
      const recommendations = db.recommendations
        .filter((row) =>
          row.userId === account.id
          && (row.branchId == null || row.branchId === branchId)
          && !isExpired(row.expiresAt)
          && (body.mode !== 'similar' || row.productId !== body.product_id),
        )
        .flatMap((row) => {
          const seed = db.products.find((product) => product.product.id === row.productId);
          if (!seed) return [];
          const product = toMenuProduct(seed, branchId);
          if (!product.isAvailable || product.price === null) return [];
          return [{
            productId: row.productId,
            name: product.name,
            category: categoryName.get(product.categoryId) ?? null,
            priceVnd: product.price,
            image: product.image ?? null,
            score: row.confidenceScore,
            reason: row.reason ?? null,
          }];
        })
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.productId - b.productId)
        .slice(0, body.top_k ?? 6);

      return HttpResponse.json({
        userId: account.id,
        branchId,
        strategy: body.mode ?? 'personalized',
        fallbackReason: null,
        modelVersion: 'mock-ai-recommendation',
        recommendations,
      });
    }),
  ),

  // POST /ai/forecasting → one live revenue-forecast response for a manager branch.
  http.post(
    url('/ai/forecasting'),
    guarded(async ({ request }) => {
      requireManager(request);
      const body = await readJson<{ start_date?: string; days?: number; branch_id?: number }>(request);
      const start = body.start_date ?? '';
      const days = body.days ?? 1;
      const branchId = body.branch_id;
      if (!ISO_DATE.test(start) || Number.isNaN(Date.parse(start))) invalid('start_date phải có dạng YYYY-MM-DD');
      if (!Number.isInteger(days) || days < 1 || days > 90) invalid('days không hợp lệ');
      if (!Number.isInteger(branchId) || (branchId ?? 0) < 1) invalid('branch_id không hợp lệ');
      const end = new Date(Date.parse(`${start}T00:00:00Z`) + (days - 1) * 86_400_000).toISOString().slice(0, 10);
      const rows = db.forecasts.filter((row) =>
        row.isLatest && row.branchId === branchId && row.forecastType === 'Revenue' && row.forecastDate >= start && row.forecastDate <= end,
      );
      return HttpResponse.json({
        start_date: start,
        days,
        branch_id: branchId,
        currency: 'VND',
        model: 'mock-model',
        model_version: rows[0]?.modelVersion ?? 'mock-forecast-v1',
        metadata: { data_version: 'mock-data-v1', snapshot_generated_at: rows[0]?.generatedAt ?? nowNaive() },
        forecast: rows.map((row) => ({ date: row.forecastDate, predicted_revenue_vnd: row.predictedValue })),
      });
    }),
  ),

  // POST /ai/forecasting/inventory → one inventory projection for a target day.
  http.post(
    url('/ai/forecasting/inventory'),
    guarded(async ({ request }) => {
      requireManager(request);
      const body = await readJson<{ target_date?: string; branch_id?: number }>(request);
      const targetDate = body.target_date ?? '';
      const branchId = body.branch_id;
      if (!ISO_DATE.test(targetDate) || Number.isNaN(Date.parse(targetDate))) invalid('target_date phải có dạng YYYY-MM-DD');
      if (!Number.isInteger(branchId) || (branchId ?? 0) < 1) invalid('branch_id không hợp lệ');
      const ingredients = db.forecasts
        .filter((row) => row.isLatest && row.branchId === branchId && row.forecastType === 'Ingredient_Usage' && row.forecastDate === targetDate)
        .map((row) => ({
          ingredient_id: row.targetId,
          ingredient_name: `Nguyên liệu #${row.targetId}`,
          unit: 'g',
          forecast_usage: row.predictedValue,
          recommended_purchase: null,
          status: 'ok',
        }));
      return HttpResponse.json({
        target_date: targetDate,
        branch_id: branchId,
        ingredients,
      });
    }),
  ),

  // GET /ai/forecasts?branchId=&forecastType=&targetId=&from=&to=   (from/to: IsoDate, gồm cả hai đầu)
  // Chỉ trả lượt chạy mới nhất (isLatest), sắp theo targetId rồi forecastDate tăng dần.
  http.get(
    url('/ai/forecasts'),
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
  // GET /ai/recommendations/me?branchId=
  // Chỉ gợi ý của chính người gọi (lấy từ token), còn hạn, và món còn bán ở chi nhánh; điểm tin cậy giảm dần.
  // `product` ghép từ catalog fixtures (cùng nguồn với GET /catalog/products). Không có gợi ý nào → [].
  http.get(
    url('/ai/recommendations/me'),
    guarded(({ request }) => {
      const account = requireAccount(request);
      const branchId = intParam(new URL(request.url).searchParams, 'branchId', false) ?? BRANCH_ID;
      if (branchId !== BRANCH_ID) fail(404, 'BRANCH_NOT_FOUND', `Không có chi nhánh ${branchId}`);

      const rows = db.recommendations
        .filter((r) => r.userId === account.id && (r.branchId == null || r.branchId === branchId) && !isExpired(r.expiresAt))
        .flatMap((r): RecommendationView[] => {
          const seed = db.products.find((p) => p.product.id === r.productId);
          if (!seed) return [];
          const product = toMenuProduct(seed, branchId);
          return product.isAvailable && product.price !== null ? [{ ...r, product }] : [];
        })
        .sort((a, b) => b.confidenceScore - a.confidenceScore || a.id - b.id);
      return HttpResponse.json<RecommendationView[]>(rows);
    }),
  ),

  // POST /ai/recommendations/:id/click → 204 (không body, khớp `post<void>` của trackRecommendationClick)
  // Chỉ ghi clickedAt của gợi ý thuộc về người gọi; idempotent (giữ lần bấm đầu). Gợi ý của người khác → 404 (không lộ sự tồn tại).
  http.post(
    url('/ai/recommendations/:id/click'),
    guarded(({ request, params }) => {
      const account = requireAccount(request);
      const id = Number(params.id);
      const rec = Number.isInteger(id) ? db.recommendations.find((r) => r.id === id && r.userId === account.id) : undefined;
      if (!rec) fail(404, 'RECOMMENDATION_NOT_FOUND', `Không tìm thấy gợi ý ${String(params.id)}`);
      rec.clickedAt ??= nowNaive();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];
