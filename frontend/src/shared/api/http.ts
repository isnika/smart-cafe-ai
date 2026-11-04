import type { ApiErrorBody } from '@/shared/types';
import { normalizeTimestamps, toCamelKeys, toSnakeKeys } from '@/shared/lib';

/**
 * Base URL: spec = https://{host}/api/v1 (qua API Gateway).
 * Mock/dev: để trống → '/api' (MSW chặn đường dẫn tương đối). Thật: đặt VITE_API_BASE_URL.
 */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/+$/, '');

/** true → entry (main.tsx) khởi động MSW; false/không đặt → mọi request đi ra mạng thật. */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

// ── Error ─────────────────────────────────────────────────────────────
export const API_ERROR_CODES = {
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  OPTION_REQUIRED: 'OPTION_REQUIRED',
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const;

export interface ApiErrorInit extends ApiErrorBody {
  details?: unknown;
  traceId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly traceId?: string;

  constructor(status: number, body: ApiErrorInit) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
    this.traceId = body.traceId;
  }

  is(code: string): boolean {
    return this.code === code;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

// ── Envelope ──────────────────────────────────────────────────────────
/** meta phân trang của spec (đã camelCase): page, size, total, totalPages. */
export interface ApiMeta {
  page?: number;
  size?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export interface ApiResult<T> {
  data: T;
  meta: ApiMeta | null;
  traceId?: string;
}

interface Envelope {
  success: boolean;
  data?: unknown;
  meta?: unknown;
  error?: { code?: string; message?: string; details?: unknown };
  trace_id?: string;
}

const isEnvelope = (j: unknown): j is Envelope =>
  j !== null && typeof j === 'object' && !Array.isArray(j) && typeof (j as { success?: unknown }).success === 'boolean';

// ── Cấu hình (auth store gọi 1 lần khi khởi động, http.ts không import store) ──
interface HttpConfig {
  getToken: () => string | null | undefined;
  /** Gọi khi không thể phục hồi phiên (401 mà không refresh được) → vd: logout + về /login. */
  onUnauthorized: (() => void) | undefined;
  /**
   * Đổi refresh token lấy access token mới (refresh token bị xoay → store phải lưu cặp mới).
   * Trả true nếu thành công. Không đặt = tắt cơ chế refresh (hành vi cũ: 401 → onUnauthorized).
   */
  refresh: (() => Promise<boolean>) | undefined;
}

const config: HttpConfig = { getToken: () => null, onUnauthorized: undefined, refresh: undefined };

export function configureHttp(next: Partial<HttpConfig>): void {
  Object.assign(config, next);
}

/** Single-flight: nhiều request cùng 401 chỉ gọi refresh 1 lần, tất cả cùng chờ kết quả đó. */
let refreshInflight: Promise<boolean> | null = null;
function refreshOnce(): Promise<boolean> {
  refreshInflight ??= (config.refresh?.() ?? Promise.resolve(false))
    .catch(() => false)
    .finally(() => {
      refreshInflight = null;
    });
  return refreshInflight;
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
  /** false = không gắn token / không refresh / không kích hoạt onUnauthorized (login, endpoint public). */
  auth?: boolean;
  /** true = đổi key body camelCase → snake_case (endpoint theo spec v1). Mặc định giữ nguyên. */
  snake?: boolean;
}

async function readErrorBody(res: Response): Promise<ApiErrorInit> {
  try {
    const json = (await res.json()) as unknown;
    if (isEnvelope(json) && json.error) {
      return {
        message: json.error.message ?? (res.statusText || `Lỗi máy chủ (${res.status})`),
        code: json.error.code,
        details: json.error.details,
        traceId: json.trace_id,
      };
    }
    // Dạng cũ (mock chưa chuyển envelope): { message, code }
    const legacy = json as Partial<ApiErrorBody> | null;
    if (legacy && typeof legacy.message === 'string') return { message: legacy.message, code: legacy.code };
  } catch {
    /* body rỗng hoặc không phải JSON */
  }
  return { message: res.statusText || `Lỗi máy chủ (${res.status})` };
}

async function execute<T>(method: HttpMethod, path: string, opts: RequestOptions, isRetry: boolean): Promise<ApiResult<T>> {
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}${buildQuery(opts.query)}`;

  const headers = new Headers(opts.headers);
  headers.set('Accept', 'application/json');
  const hasBody = opts.body !== undefined;
  if (hasBody) headers.set('Content-Type', 'application/json');

  const useAuth = opts.auth !== false;
  let sentToken = false;
  if (useAuth) {
    const token = config.getToken(); // đọc lại mỗi lần → request retry dùng token mới sau refresh
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
      sentToken = true;
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: hasBody ? JSON.stringify(opts.snake ? toSnakeKeys(opts.body) : opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e; // để React Query / caller tự xử lý huỷ
    throw new ApiError(0, { message: 'Không thể kết nối tới máy chủ', code: API_ERROR_CODES.NETWORK_ERROR });
  }

  if (!res.ok) {
    const body = await readErrorBody(res);
    if (res.status === 401 && useAuth) {
      // Có token + có cơ chế refresh + chưa retry → thử phục hồi phiên đúng 1 lần rồi gửi lại request gốc.
      if (sentToken && config.refresh && !isRetry && (await refreshOnce())) {
        return execute<T>(method, path, opts, true);
      }
      config.onUnauthorized?.();
    }
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) return { data: undefined as T, meta: null };
  const text = await res.text();
  if (!text) return { data: undefined as T, meta: null };

  const json = JSON.parse(text) as unknown;
  if (isEnvelope(json)) {
    // Envelope spec: { success, data, meta, trace_id } — key snake_case → camelCase cho FE.
    return {
      data: normalizeTimestamps(toCamelKeys<T>(json.data)),
      meta: json.meta ? toCamelKeys<ApiMeta>(json.meta) : null,
      traceId: json.trace_id,
    };
  }
  // Payload trần (mock cũ của các service chưa chuyển sang spec) — giữ nguyên hành vi.
  return { data: normalizeTimestamps(json) as T, meta: null };
}

const request = async <T>(method: HttpMethod, path: string, opts: RequestOptions = {}): Promise<T> =>
  (await execute<T>(method, path, opts, false)).data;

export const http = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'body'>) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) => request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) => request<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) => request<T>('PATCH', path, { ...opts, body }),
  delete: <T = void>(path: string, opts?: Omit<RequestOptions, 'body'>) => request<T>('DELETE', path, opts),
  /** Như get nhưng giữ cả meta (phân trang) và trace_id. */
  getWithMeta: <T>(path: string, opts?: Omit<RequestOptions, 'body'>) => execute<T>('GET', path, opts ?? {}, false),
};
