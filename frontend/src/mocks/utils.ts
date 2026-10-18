import { HttpResponse, delay, type HttpResponseResolver } from 'msw';
import type { ApiErrorBody } from '@/shared/types';

/** Phải khớp BASE_URL trong shared/api/http.ts. */
const API = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/+$/, '');
export const url = (path: string) => `${API}${path}`;

/** Chỉnh lúc runtime qua `window.__mock.config` (xem browser.ts). */
export const mockConfig = {
  latencyMs: 150,
  /** true → PATCH status trả 401 nếu thiếu header Authorization (để test onUnauthorized). */
  enforceAuth: false,
};

export class MockHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Function declaration (không phải arrow) để TS hiểu `never` và thu hẹp kiểu sau `if (!x) fail(...)`. */
export function fail(status: number, code: string, message: string): never {
  throw new MockHttpError(status, code, message);
}

export const errorResponse = (status: number, code: string, message: string) =>
  HttpResponse.json<ApiErrorBody>({ message, code }, { status });

/** Thêm latency giả + chuyển MockHttpError thành body lỗi đúng dạng ApiErrorBody. */
export const guarded =
  (resolver: HttpResponseResolver): HttpResponseResolver =>
  async (info) => {
    if (mockConfig.latencyMs > 0) await delay(mockConfig.latencyMs);
    try {
      return await resolver(info);
    } catch (e) {
      if (e instanceof MockHttpError) return errorResponse(e.status, e.code, e.message);
      throw e;
    }
  };

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return fail(400, 'BAD_REQUEST', 'Body không phải JSON hợp lệ');
  }
}

export function requireAuth(request: Request): void {
  if (mockConfig.enforceAuth && !request.headers.get('Authorization')?.startsWith('Bearer ')) {
    fail(401, 'UNAUTHORIZED', 'Chưa đăng nhập');
  }
}