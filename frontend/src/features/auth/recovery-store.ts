import { create } from "zustand";

const STORAGE_KEY = "smartcafe.auth-recovery";

/**
 * Trạng thái định tuyến của luồng OTP. Chỉ lưu identifier + purpose để refresh trang xác minh được;
 * mật khẩu và OTP đặt lại không bao giờ persist.
 *   - "reset"    : Forgot → OTP → Reset
 *   - "register" : Register → OTP (xác minh tài khoản) → Login
 * Reload giữa chừng thì quay lại bước đầu, vừa an toàn (không lưu resetToken) vừa đơn giản.
 */
export type RecoveryPurpose = "reset" | "register";

function loadRecovery(): { identifier: string | null; purpose: RecoveryPurpose } {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as { identifier?: unknown; purpose?: unknown } | null;
    if (typeof saved?.identifier === "string" && (saved.purpose === "reset" || saved.purpose === "register")) {
      return { identifier: saved.identifier, purpose: saved.purpose };
    }
  } catch {
    // Storage bị chặn hoặc dữ liệu lỗi: tiếp tục như phiên mới.
  }
  return { identifier: null, purpose: "reset" };
}

const initialRecovery = loadRecovery();

function saveRecovery(identifier: string | null, purpose: RecoveryPurpose): void {
  try {
    if (identifier) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ identifier, purpose }));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Luồng vẫn chạy trong RAM nếu storage không khả dụng.
  }
}

interface RecoveryState {
  identifier: string | null;
  purpose: RecoveryPurpose;
  resetToken: string | null;
  start: (identifier: string, purpose?: RecoveryPurpose) => void;
  setResetToken: (token: string) => void;
  reset: () => void;
}

export const useRecoveryStore = create<RecoveryState>((set) => ({
  identifier: initialRecovery.identifier,
  purpose: initialRecovery.purpose,
  resetToken: null,
  start: (identifier, purpose = "reset") => {
    saveRecovery(identifier, purpose);
    set({ identifier, purpose, resetToken: null });
  },
  setResetToken: (resetToken) => set({ resetToken }),
  reset: () => {
    saveRecovery(null, "reset");
    set({ identifier: null, purpose: "reset", resetToken: null });
  },
}));
