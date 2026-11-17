/**
 * Đổi key snake_case ↔ camelCase (đệ quy, chỉ đụng key — không đụng giá trị).
 * Spec API dùng snake_case; types.ts của FE dùng camelCase → đổi ở MỘT chỗ (http.ts).
 * Chỉ duyệt object thuần + mảng (Date, File, Blob… giữ nguyên). Key đã đúng dạng thì không đổi
 * nên payload "legacy" (đã camelCase) đi qua vẫn an toàn.
 */
const snakeToCamel = (k: string) => k.replace(/_+([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const camelToSnake = (k: string) => k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
};

function mapKeys(value: unknown, fn: (k: string) => string): unknown {
  if (Array.isArray(value)) return value.map((v) => mapKeys(v, fn));
  if (!isPlain(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[fn(k)] = mapKeys(v, fn);
  return out;
}

export const toCamelKeys = <T = unknown>(value: unknown): T => mapKeys(value, snakeToCamel) as T;
export const toSnakeKeys = <T = unknown>(value: unknown): T => mapKeys(value, camelToSnake) as T;
