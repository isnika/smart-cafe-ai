import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiErrorBody, RecommendationView } from '@/shared/types';
import { BRANCH_ID, db, resetDb } from '../db';
import { mockConfig, url } from '../utils';
import { MOCK_PASSWORD, resetAuthMock, revokeAllTokens } from './identity';
import { handlers } from './index';

const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(() => {
  resetDb();
  resetAuthMock();
  mockConfig.latencyMs = 0;
  mockConfig.enforceAuth = false;
});
afterEach(() => server.resetHandlers());

const A = 'customer@smartcafe.vn';
const B = 'customer2@smartcafe.vn';

async function tokenOf(email: string): Promise<string> {
  const res = await fetch(url('/identity/auth/login'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: email, password: MOCK_PASSWORD }),
  });
  return ((await res.json()) as { accessToken: string }).accessToken;
}

async function list(token?: string, query = '') {
  const res = await fetch(url(`/intelligence/recommendations/me${query}`), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: (await res.json()) as RecommendationView[] & Partial<ApiErrorBody> };
}

async function click(id: number | string, token?: string) {
  const res = await fetch(url(`/intelligence/recommendations/${id}/click`), { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const text = await res.text();
  return { status: res.status, text, body: text ? (JSON.parse(text) as ApiErrorBody) : null };
}

describe('seed gợi ý AI', () => {
  it('dùng chung catalog fixtures: mọi productId đều là món có thật trong db.products', () => {
    const ids = new Set(db.products.map((p) => p.product.id));
    expect(db.recommendations.length).toBeGreaterThan(0);
    for (const r of db.recommendations) {
      expect(ids.has(r.productId)).toBe(true);
      expect(r.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(r.confidenceScore).toBeLessThanOrEqual(1);
    }
  });
});

describe('GET /intelligence/recommendations/me', () => {
  it('trả gợi ý của chính người gọi, điểm giảm dần, kèm product khớp catalog', async () => {
    const { status, body } = await list(await tokenOf(A));
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((r) => r.userId === 'u-customer')).toBe(true);
    const scores = body.map((r) => r.confidenceScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));

    const first = body[0];
    expect(first.product.id).toBe(first.productId);
    const seed = db.products.find((p) => p.product.id === first.productId)!;
    expect(first.product.name).toBe(seed.product.name);
    expect(first.product.price).toBe(Math.min(...seed.variants.map((v) => v.price)));
  });

  it('lọc gợi ý hết hạn, món hết hàng và món không còn bán', async () => {
    const { body } = await list(await tokenOf(A));
    const productIds = body.map((r) => r.productId);
    expect(productIds).not.toContain(4); // Matcha hết hàng
    expect(productIds).not.toContain(8); // Combo không còn variant Active
    expect(productIds).not.toContain(1); // gợi ý đã hết hạn
    expect(body.every((r) => r.product.isAvailable && r.product.price !== null)).toBe(true);

    // Món có hàng trở lại → gợi ý Matcha xuất hiện (chứng minh lọc theo tình trạng hiện tại, không phải bỏ seed)
    db.unavailableVariants.clear();
    const after = await list(await tokenOf(A));
    expect(after.body.map((r) => r.productId)).toContain(4);
  });

  it('cô lập theo người dùng: khách B không thấy gợi ý của khách A', async () => {
    const a = (await list(await tokenOf(A))).body;
    const b = (await list(await tokenOf(B))).body;
    expect(b.length).toBeGreaterThan(0);
    expect(b.every((r) => r.userId === 'u-customer2')).toBe(true);
    const aIds = new Set(a.map((r) => r.id));
    expect(b.some((r) => aIds.has(r.id))).toBe(false);
  });

  it('người dùng chưa có gợi ý (AI đang học dữ liệu) → 200 và mảng rỗng', async () => {
    db.recommendations.length = 0;
    const { status, body } = await list(await tokenOf(A));
    expect(status).toBe(200);
    expect(body).toEqual([]);
    // nhân viên không có gợi ý nào trong seed
    expect((await list(await tokenOf('staff@smartcafe.vn'))).body).toEqual([]);
  });

  it('khách vãng lai (không token) → 401, kể cả khi enforceAuth tắt', async () => {
    const { status, body } = await list();
    expect(status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('token bị thu hồi → 401 "phiên không còn hợp lệ"', async () => {
    const token = await tokenOf(A);
    revokeAllTokens();
    const { status, body } = await list(token);
    expect(status).toBe(401);
    expect(body.message).toMatch(/không còn hợp lệ/);
  });

  it('branchId: mặc định chi nhánh 1; chi nhánh lạ → 404; giá trị sai → 400', async () => {
    const token = await tokenOf(A);
    expect((await list(token, `?branchId=${BRANCH_ID}`)).status).toBe(200);
    expect((await list(token, '?branchId=99')).status).toBe(404);
    expect((await list(token, '?branchId=abc')).status).toBe(400);
  });
});

describe('POST /intelligence/recommendations/:id/click', () => {
  it('204 không body, ghi clickedAt và lần liệt kê sau thấy clickedAt', async () => {
    const token = await tokenOf(A);
    const target = (await list(token)).body[0];
    expect(target.clickedAt ?? null).toBeNull();

    const res = await click(target.id, token);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(db.recommendations.find((r) => r.id === target.id)?.clickedAt).toBeTruthy();

    const again = (await list(token)).body.find((r) => r.id === target.id);
    expect(again?.clickedAt).toBeTruthy();
  });

  it('idempotent: bấm lại vẫn 204 và giữ nguyên thời điểm bấm đầu', async () => {
    const token = await tokenOf(A);
    await click(1, token);
    const first = db.recommendations.find((r) => r.id === 1)!.clickedAt;
    expect((await click(1, token)).status).toBe(204);
    expect(db.recommendations.find((r) => r.id === 1)!.clickedAt).toBe(first);
  });

  it('gợi ý của người khác hoặc không tồn tại → 404 và không ghi gì', async () => {
    const tokenB = await tokenOf(B);
    const ofA = db.recommendations.find((r) => r.userId === 'u-customer')!;
    const res = await click(ofA.id, tokenB);
    expect(res.status).toBe(404);
    expect(res.body?.code).toBe('RECOMMENDATION_NOT_FOUND');
    expect(ofA.clickedAt ?? null).toBeNull();

    expect((await click(9999, tokenB)).status).toBe(404);
    expect((await click('abc', tokenB)).status).toBe(404);
  });

  it('không token → 401 và không ghi gì', async () => {
    expect((await click(1)).status).toBe(401);
    expect(db.recommendations.find((r) => r.id === 1)!.clickedAt ?? null).toBeNull();
  });
});
