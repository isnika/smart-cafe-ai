import type { IsoDateTime } from '@/shared/types';

/**
 * Backend (MySQL DATETIME) có thể trả timestamp KHÔNG có timezone, ví dụ
 * "2026-10-18 09:30:00" hoặc "2026-10-18T09:30:00". Theo quy ước DB, mọi
 * timestamp đều là UTC. Nếu để nguyên, `new Date(...)` sẽ hiểu là giờ máy
 * người dùng → lệch 7 tiếng ở VN.
 */
const NAIVE_DATETIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d+)?$/;
const ZONED_DATETIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/i;

/** '.123456' → '.123' (Safari không ổn định với > 3 chữ số thập phân). */
const trimFraction = (f?: string) => (f ? f.slice(0, 4) : '');

/**
 * Chuẩn hoá một chuỗi datetime về ISO 8601 có offset rõ ràng.
 * - Không có timezone → coi là UTC, thêm 'Z'.
 * - Đã có timezone → giữ nguyên (chỉ chuẩn hoá dạng).
 * - Không phải datetime (IsoDate "YYYY-MM-DD", TimeOfDay "HH:mm:ss", text tự do) → null.
 */
export function toUtcIso(value: string): IsoDateTime | null {
  const s = value.trim();

  const naive = NAIVE_DATETIME.exec(s);
  if (naive) return `${naive[1]}T${naive[2]}${trimFraction(naive[3])}Z`;

  const zoned = ZONED_DATETIME.exec(s);
  if (zoned) {
    let offset = zoned[4].toUpperCase();
    if (offset !== 'Z' && !offset.includes(':')) offset = `${offset.slice(0, 3)}:${offset.slice(3)}`;
    return `${zoned[1]}T${zoned[2]}${trimFraction(zoned[3])}${offset}`;
  }
  return null;
}

/**
 * Parse timestamp từ API thành Date, mặc định UTC khi thiếu timezone.
 * Trả về null nếu rỗng hoặc không hợp lệ (để UI tự quyết định hiển thị "—").
 *
 *   parseUtc('2026-10-18 09:30:00')      → 2026-10-18T09:30:00Z
 *   parseUtc('2026-10-18T09:30:00+07:00') → 2026-10-18T02:30:00Z
 *   parseUtc(null)                        → null
 */
export function parseUtc(value: IsoDateTime | null | undefined): Date | null {
  if (!value) return null;
  const iso = toUtcIso(value);
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Duyệt đệ quy một payload JSON và thêm 'Z' cho mọi chuỗi datetime thiếu timezone.
 * Chỉ khớp datetime đầy đủ nên IsoDate / TimeOfDay không bị đụng tới.
 * Mutate tại chỗ (payload vừa JSON.parse nên không ai khác giữ tham chiếu).
 */
export function normalizeTimestamps<T>(data: T): T {
  if (typeof data === 'string') {
    return (NAIVE_DATETIME.test(data) ? toUtcIso(data) ?? data : data) as T;
  }
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) data[i] = normalizeTimestamps(data[i]);
    return data;
  }
  if (data !== null && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of Object.keys(obj)) obj[key] = normalizeTimestamps(obj[key]);
    return data;
  }
  return data;
}