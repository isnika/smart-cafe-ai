import { create } from "zustand";

/**
 * Trạng thái tạm của luồng Quên mật khẩu: Forgot → OTP → Reset.
 * Chỉ nằm trong RAM (không persist): reload giữa chừng thì quay lại bước 1,
 * vừa an toàn (không lưu resetToken) vừa đơn giản.
 */
interface RecoveryState {
  identifier: string | null;
  resetToken: string | null;
  start: (identifier: string) => void;
  setResetToken: (token: string) => void;
  reset: () => void;
}

export const useRecoveryStore = create<RecoveryState>((set) => ({
  identifier: null,
  resetToken: null,
  start: (identifier) => set({ identifier, resetToken: null }),
  setResetToken: (resetToken) => set({ resetToken }),
  reset: () => set({ identifier: null, resetToken: null }),
}));
