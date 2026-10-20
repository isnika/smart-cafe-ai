import { http } from "@/shared/api/http";

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
 */
export const authFlowApi = {
  register: (body: RegisterInput) =>
    http.post<void>("/auth/register", body, { auth: false }),

  /** Gửi (hoặc gửi lại) mã OTP 6 số tới email / SĐT. */
  requestOtp: (identifier: string) =>
    http.post<void>("/auth/forgot-password", { identifier }, { auth: false }),

  /** Đổi OTP lấy resetToken dùng 1 lần cho bước đặt lại mật khẩu. */
  verifyOtp: (identifier: string, otp: string) =>
    http.post<{ resetToken: string }>("/auth/verify-otp", { identifier, otp }, { auth: false }),

  resetPassword: (resetToken: string, newPassword: string) =>
    http.post<void>("/auth/reset-password", { resetToken, newPassword }, { auth: false }),
};
