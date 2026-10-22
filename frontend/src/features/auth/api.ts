import { http } from "@/shared/api/http";
import type { AuthSession } from "@/shared/types";

export interface RegisterInput {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}

/**
 * Các endpoint của luồng Đăng ký / Quên mật khẩu (Identity service).
 * Login / logout / me vẫn đi qua identityApi + auth store như cũ.
 * Tất cả là endpoint công khai → auth:false (không gắn token, 401 không kích hoạt onUnauthorized).
 *
 * Đăng ký: register (tạo tài khoản CHƯA xác minh + gửi OTP) → verifyRegistration → đăng nhập.
 */
export const authFlowApi = {
  /** Tạo tài khoản ở trạng thái Unverified và gửi OTP 6 số tới email. */
  register: (body: RegisterInput) =>
    http.post<void>("/auth/register", body, { auth: false }),

  /**
   * Xác minh tài khoản mới bằng OTP đã gửi lúc đăng ký → tài khoản chuyển sang Active
   * và server cấp luôn phiên đăng nhập (FE áp dụng bằng authStore.applySession → auto-login).
   */
  verifyRegistration: (identifier: string, otp: string) =>
    http.post<AuthSession>("/auth/verify-registration", { identifier, otp }, { auth: false }),

  /** Gửi lại OTP xác minh đăng ký (cũng dùng khi đăng nhập vào tài khoản chưa xác minh). */
  resendRegistrationOtp: (identifier: string) =>
    http.post<void>("/auth/resend-otp", { identifier }, { auth: false }),

  /** Gửi (hoặc gửi lại) mã OTP 6 số tới email / SĐT để đặt lại mật khẩu. */
  requestOtp: (identifier: string) =>
    http.post<void>("/auth/forgot-password", { identifier }, { auth: false }),

  /** Đổi OTP lấy resetToken dùng 1 lần cho bước đặt lại mật khẩu. */
  verifyOtp: (identifier: string, otp: string) =>
    http.post<{ resetToken: string }>("/auth/verify-otp", { identifier, otp }, { auth: false }),

  resetPassword: (resetToken: string, newPassword: string) =>
    http.post<void>("/auth/reset-password", { resetToken, newPassword }, { auth: false }),
};