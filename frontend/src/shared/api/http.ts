import type { ApiErrorBody } from '@/shared/types';
import { normalizeTimestamps } from '@/shared/lib';

/** Dev: MSW chặn đường dẫn tương đối `/api`. Prod: đặt VITE_API_BASE_URL. */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/+$/, '');

// ── Error ─────────────────────────────────────────────────────────────
export const API_ERROR_CODES = {
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  OPTION_REQUIRED: 'OPTION_REQUIRED',
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const;

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
  }

  is(code: string): boolean {
    return this.code === code;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

// ── Cấu hình (auth store gọi 1 lần khi khởi động, http.ts không import store) ──
interface HttpConfig {
  getToken: () => string | null | undefined;
  /** Gọi khi server trả 401 cho request có gắn token (vd: logout + chuyển về /login). */
  onUnauthorized: (() => void) | undefined;
}

const config: HttpConfig = { getToken: () => null, onUnauthorized: undefined };

export function configureHttp(next: Partial<HttpConfig>): void {
  Object.assign(config, next);
}

// ── Query string ──────────────────────────────────────────────────────
/** undefined/null bị bỏ; mảng → key lặp lại (status=Pending&status=Confirmed). */
export function buildQuery(params?: object): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) value.forEach((v) => sp.append(key, String(v)));
    else sp.append(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ── Request ───────────────────────────────────────────────────────────
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  query?: object;
  body?: unknown;
  signal?: AbortSignal;
  headers?: HeadersInit;
  /** false = không gắn token / không kích hoạt onUnauthorized (login, endpoint public). */
  auth?: boolean;
}

async function readErrorBody(res: Response): Promise<ApiErrorBody> {
  try {
    const json = (await res.json()) as Partial<ApiErrorBody> | null;
    if (json && typeof json.message === 'string') return { message: json.message, code: json.code };
  } catch {
    /* body rỗng hoặc không phải JSON */
  }
  return { message: res.statusText || `Lỗi máy chủ (${res.status})` };
}

async function request<T>(method: HttpMethod, path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}${buildQuery(opts.query)}`;

  const headers = new Headers(opts.headers);
  headers.set('Accept', 'application/json');
  if (opts.body !== undefined) headers.set('Content-Type', 'application/json');

  const useAuth = opts.auth !== false;
  if (useAuth) {
    const token = config.getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e; // để React Query / caller tự xử lý huỷ
    throw new ApiError(0, { message: 'Không thể kết nối tới máy chủ', code: API_ERROR_CODES.NETWORK_ERROR });
  }

  if (!res.ok) {
    const body = await readErrorBody(res);
    if (res.status === 401 && useAuth) config.onUnauthorized?.();
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return normalizeTimestamps(JSON.parse(text)) as T;
}

export const http = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'body'>) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) => request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) => request<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) => request<T>('PATCH', path, { ...opts, body }),
  delete: <T = void>(path: string, opts?: Omit<RequestOptions, 'body'>) => request<T>('DELETE', path, opts),
};