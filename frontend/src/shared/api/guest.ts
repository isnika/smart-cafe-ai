/**
 * Định danh khách guest cho luồng QR (spec "QUY ƯỚC / QR guest"):
 *  - X-Client-Key: UUID sinh MỘT lần/thiết bị, lưu localStorage, dùng cho mọi request giỏ.
 *  - X-Table-Session-Code: session_code của phiên bàn đã mở, nhớ theo tableCode để F5 không mất giỏ.
 * Mọi truy cập storage bọc try/catch (private mode / bị chặn) → rơi về RAM.
 */
export const CLIENT_KEY_STORAGE = 'smartcafe.clientKey';
const SESSION_PREFIX = 'smartcafe.dinein.session.';

export const HEADER_SESSION_CODE = 'X-Table-Session-Code';
export const HEADER_CLIENT_KEY = 'X-Client-Key';
export const HEADER_IDEMPOTENCY_KEY = 'Idempotency-Key';

const uuid = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `ck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

let memoryClientKey: string | null = null;
const memorySessions = new Map<string, string>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage bị chặn → chỉ sống trong RAM */
  }
}
function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* bỏ qua */
  }
}

/** Sinh một lần rồi tái dùng. Storage lỗi → vẫn ổn định trong phiên chạy (RAM). */
export function getClientKey(): string {
  const stored = read(CLIENT_KEY_STORAGE);
  if (stored) {
    memoryClientKey = stored;
    return stored;
  }
  memoryClientKey ??= uuid();
  write(CLIENT_KEY_STORAGE, memoryClientKey);
  return memoryClientKey;
}

export const loadSessionCode = (tableCode: string): string | null =>
  read(SESSION_PREFIX + tableCode) ?? memorySessions.get(tableCode) ?? null;

export function saveSessionCode(tableCode: string, sessionCode: string): void {
  memorySessions.set(tableCode, sessionCode);
  write(SESSION_PREFIX + tableCode, sessionCode);
}

export function clearSessionCode(tableCode: string): void {
  memorySessions.delete(tableCode);
  remove(SESSION_PREFIX + tableCode);
}

/** Chỉ dành cho test. */
export function resetGuestMemory(): void {
  memoryClientKey = null;
  memorySessions.clear();
}

/** Header nhận diện phiên bàn; withClientKey=true cho các call giỏ (guest). */
export function guestHeaders(sessionCode: string, opts: { clientKey?: boolean } = {}): Record<string, string> {
  return {
    [HEADER_SESSION_CODE]: sessionCode,
    ...(opts.clientKey ? { [HEADER_CLIENT_KEY]: getClientKey() } : {}),
  };
}
