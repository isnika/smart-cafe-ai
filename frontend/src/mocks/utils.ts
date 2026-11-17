import { HttpResponse, delay, type HttpResponseResolver } from 'msw';
import type { ApiErrorBody } from '@/shared/types';
import { toSnakeKeys } from '@/shared/lib';

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

// ── Contract spec v1 (SmartAPI): envelope + JSON snake_case ───────────
// Dùng cho handler thuộc lát Identity/Catalog. Các service khác vẫn trả payload trần (camelCase).
const traceId = () => `mock-${crypto.randomUUID()}`;

/** { success:true, data, meta, trace_id } — key của data/meta đổi sang snake_case như server thật. */
export const ok = (data: unknown, meta: object | null = null, init?: ResponseInit) =>
  HttpResponse.json(
    { success: true, data: toSnakeKeys(data), meta: meta ? toSnakeKeys(meta) : null, trace_id: traceId() },
    init,
  );

/** { success:false, error:{code,message,details}, trace_id } */
export const envelopeError = (status: number, code: string, message: string, details: unknown = null) =>
  HttpResponse.json({ success: false, error: { code, message, details }, trace_id: traceId() }, { status });

/** 204 No Content (logout, resend OTP, reset password…). */
export const noContent = () => new HttpResponse(null, { status: 204 });

/**
 * Thêm latency giả + chuyển MockHttpError thành body lỗi.
 * envelope=true → lỗi đúng dạng spec; mặc định giữ dạng cũ { message, code } cho các service chưa chuyển.
 */
export const guarded =
  (resolver: HttpResponseResolver, opts: { envelope?: boolean } = {}): HttpResponseResolver =>
  async (info) => {
    if (mockConfig.latencyMs > 0) await delay(mockConfig.latencyMs);
    try {
      return await resolver(info);
    } catch (e) {
      if (e instanceof MockHttpError) {
        return opts.envelope ? envelopeError(e.status, e.code, e.message) : errorResponse(e.status, e.code, e.message);
      }
      throw e;
    }
  };

/** Phiên bản dùng cho endpoint theo spec v1. */
export const guardedV1 = (resolver: HttpResponseResolver) => guarded(resolver, { envelope: true });

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