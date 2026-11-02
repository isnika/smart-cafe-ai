/**
 * Định danh khách vãng lai cho chat AI (gửi làm `guestKey` khi chưa đăng nhập).
 * Lưu localStorage theo convention `smartcafe.*` của repo để mở lại panel / F5 vẫn nhận ra phiên cũ.
 */
const STORAGE_KEY = 'smartcafe.chat.guestKey';

/** Dự phòng khi storage bị chặn (private mode): key sống trong RAM của tab. */
let memoryKey: string | null = null;

function generate(): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `guest-${id}`;
}

export function getGuestKey(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
    const created = memoryKey ?? generate();
    localStorage.setItem(STORAGE_KEY, created);
    memoryKey = created;
    return created;
  } catch {
    memoryKey ??= generate();
    return memoryKey;
  }
}
