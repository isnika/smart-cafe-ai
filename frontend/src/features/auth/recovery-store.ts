import { create } from "zustand";

/**
 * Trạng thái tạm của các luồng dùng OTP, chỉ nằm trong RAM (không persist):
 *   - "reset"    : Forgot → OTP → Reset
 *   - "register" : Register → OTP (xác minh tài khoản) → Login
 * Reload giữa chừng thì quay lại bước đầu, vừa an toàn (không lưu resetToken) vừa đơn giản.
 */
export type RecoveryPurpose = "reset" | "register";

interface RecoveryState {
  identifier: string | null;
  purpose: RecoveryPurpose;
  resetToken: string | null;
  start: (identifier: string, purpose?: RecoveryPurpose) => void;
  setResetToken: (token: string) => void;
  reset: () => void;
}

export const useRecoveryStore = create<RecoveryState>((set) => ({
  identifier: null,
  purpose: "reset",
  resetToken: null,
  start: (identifier, purpose = "reset") => set({ identifier, purpose, resetToken: null }),
  setResetToken: (resetToken) => set({ resetToken }),
  reset: () => set({ identifier: null, purpose: "reset", resetToken: null }),
}));