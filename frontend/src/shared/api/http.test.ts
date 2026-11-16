import { setupServer } from 'msw/node';
import { http as mswHttp, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { toCamelKeys, toSnakeKeys } from '@/shared/lib';
import { ApiError, configureHttp, http, isApiError } from './http';

// Chạy với VITE_API_BASE_URL=http://localhost/api (vite.config.ts → test.env)
const U = (p: string) => `http://localhost/api${p}`;
const server = setupServer();
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

let token: string | null = 'old';
const onUnauthorized = vi.fn();
let refresh = vi.fn<() => Promise<boolean>>();

beforeEach(() => {
  token = 'old';
  onUnauthorized.mockReset();
  refresh = vi.fn(async () => {
    token = 'new';
    return true;
  });
  configureHttp({ getToken: () => token, onUnauthorized, refresh });
});

const envelope = (data: unknown, meta: unknown = null) => HttpResponse.json({ success: true, data, meta, trace_id: 't-1' });

describe('case', () => {
  it('snake ↔ camel đệ quy, giữ nguyên giá trị', () => {
    expect(toCamelKeys({ access_token: 'a_b', user: { full_name: 'x', tags: [{ flavor_tag: 1 }] } })).toEqual({
      accessToken: 'a_b',
      user: { fullName: 'x', tags: [{ flavorTag: 1 }] },
    });
    expect(toSnakeKeys({ otpCode: '1', newPassword: 'p', nested: [{ branchId: 2 }] })).toEqual({
      otp_code: '1',
      new_password: 'p',
      nested: [{ branch_id: 2 }],
    });
  });
});

describe('http: envelope', () => {
  it('unwrap data (snake → camel), giữ meta + traceId', async () => {
    server.use(mswHttp.get(U('/x'), () => envelope([{ category_id: 1 }], { page: 1, size: 20, total: 45, total_pages: 3 })));
    const r = await http.getWithMeta<{ categoryId: number }[]>('/x');
    expect(r.data).toEqual([{ categoryId: 1 }]);
    expect(r.meta).toEqual({ page: 1, size: 20, total: 45, totalPages: 3 });
    expect(r.traceId).toBe('t-1');
    server.use(mswHttp.get(U('/y'), () => envelope({ ok: true })));
    expect(await http.get('/y')).toEqual({ ok: true });
  });

  it('payload trần (mock cũ) vẫn đọc được', async () => {
    server.use(mswHttp.get(U('/legacy'), () => HttpResponse.json([{ id: 1 }])));
    expect(await http.get('/legacy')).toEqual([{ id: 1 }]);
  });

  it('204 → undefined', async () => {
    server.use(mswHttp.post(U('/n'), () => new HttpResponse(null, { status: 204 })));
    expect(await http.post('/n', {})).toBeUndefined();
  });

  it('snake:true đổi key body sang snake_case', async () => {
    let body: unknown;
    server.use(
      mswHttp.post(U('/b'), async ({ request }) => {
        body = await request.json();
        return envelope(null);
      }),
    );
    await http.post('/b', { fullName: 'A', otpCode: '1' }, { snake: true });
    expect(body).toEqual({ full_name: 'A', otp_code: '1' });
  });
});

describe('http: ApiError', () => {
  it('lỗi envelope → code, message, details, traceId, status', async () => {
    server.use(
      mswHttp.get(U('/e'), () =>
        HttpResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Sai', details: [{ field: 'q' }] }, trace_id: 't-9' },
          { status: 422 },
        ),
      ),
    );
    const e = await http.get('/e').catch((x: unknown) => x);
    expect(isApiError(e)).toBe(true);
    expect(e).toMatchObject({ status: 422, code: 'VALIDATION_ERROR', message: 'Sai', details: [{ field: 'q' }], traceId: 't-9' });
  });

  it('lỗi dạng cũ { message, code } và mất mạng', async () => {
    server.use(mswHttp.get(U('/old'), () => HttpResponse.json({ message: 'Hỏng', code: 'X' }, { status: 500 })));
    expect(await http.get('/old').catch((x: unknown) => x)).toMatchObject({ status: 500, code: 'X', message: 'Hỏng' });
    server.use(mswHttp.get(U('/net'), () => HttpResponse.error()));
    const e = await http.get('/net').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});

describe('http: refresh single-flight', () => {
  const protectedRoute = () =>
    mswHttp.get(U('/p'), ({ request }) =>
      request.headers.get('Authorization') === 'Bearer new'
        ? envelope({ ok: true })
        : HttpResponse.json({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'hết hạn' }, trace_id: 't' }, { status: 401 }),
    );

  it('nhiều request cùng 401 → refresh đúng 1 lần, mỗi request retry đúng 1 lần với token mới', async () => {
    let hits = 0;
    server.use(
      mswHttp.get(U('/p'), ({ request }) => {
        hits++;
        return request.headers.get('Authorization') === 'Bearer new'
          ? envelope({ ok: true })
          : HttpResponse.json({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'x' }, trace_id: 't' }, { status: 401 });
      }),
    );
    const res = await Promise.all([http.get('/p'), http.get('/p'), http.get('/p')]);
    expect(res).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(hits).toBe(6); // 3 lần 401 + 3 lần retry
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('refresh thất bại → onUnauthorized + ném lỗi 401 gốc', async () => {
    refresh.mockResolvedValue(false);
    server.use(protectedRoute());
    const e = await http.get('/p').catch((x: unknown) => x);
    expect(e).toMatchObject({ status: 401, code: 'TOKEN_EXPIRED' });
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('retry chỉ 1 lần: vẫn 401 sau refresh thì không refresh tiếp', async () => {
    server.use(mswHttp.get(U('/always401'), () => HttpResponse.json({ message: 'no' }, { status: 401 })));
    await http.get('/always401').catch(() => undefined);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('auth:false (login) không refresh, không onUnauthorized', async () => {
    server.use(mswHttp.post(U('/auth/login'), () => HttpResponse.json({ message: 'sai' }, { status: 401 })));
    await http.post('/auth/login', {}, { auth: false }).catch(() => undefined);
    expect(refresh).not.toHaveBeenCalled();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('không có token thì không refresh, vẫn gọi onUnauthorized như cũ', async () => {
    token = null;
    server.use(protectedRoute());
    await http.get('/p').catch(() => undefined);
    expect(refresh).not.toHaveBeenCalled();
    expect(onUnauthorized).toHaveBeenCalled();
  });
});
