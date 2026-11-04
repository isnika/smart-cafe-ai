import { ApiError, http } from "@/shared/api/http";
import { identityApi } from "@/shared/api";
import type { AuthSession } from "@/shared/types";

export interface RegisterInput {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}

/**
 * Luồng Đăng ký / OTP / Quên mật khẩu theo SmartAPI v1 (Identity, qua gateway).
 * Login / logout / me / refresh nằm ở identityApi + auth store.
 * Tất cả là endpoint công khai → auth:false (không gắn token, 401 không kích hoạt refresh/onUnauthorized).
 *
 * Khác biệt so với FE cũ (giữ nguyên chữ ký hàm để các page không phải đổi):
 *  - /auth/otp/verify KHÔNG trả token → verifyRegistration gọi tiếp /auth/login bằng thông tin
 *    vừa đăng ký (giữ tạm trong RAM, xoá ngay sau khi dùng) rồi trả AuthSession để page auto-login.
 *  - Không có bước "verify OTP → reset token" cho quên mật khẩu: /auth/reset-password nhận thẳng
 *    { target, otp_code, new_password }. verifyOtp chỉ giữ OTP trong RAM (đóng vai "resetToken")
 *    và OTP thật sự được server kiểm tra ở bước đặt mật khẩu mới.
 */

// ── Giữ tạm trong RAM (không persist, không log) ──────────────────────
const normKey = (v: string) => {
  const s = v.trim();
  return s.includes("@") ? s.toLowerCase() : s.replace(/[\s.\-()]/g, "").replace(/^\+84/, "0");
};

const pendingLogin = new Map<string, string>(); // identifier(chuẩn hoá) → mật khẩu
const resetTarget = { value: null as string | null };

/** Giữ mật khẩu để auto-login sau khi xác minh OTP. Gắn cho cả email lẫn SĐT. */
function holdCredentials(identifiers: string[], password: string): void {
  for (const id of identifiers) if (id) pendingLogin.set(normKey(id), password);
}

function takeCredentials(identifier: string): string | undefined {
  const key = normKey(identifier);
  const password = pendingLogin.get(key);
  // Xoá mọi mục trùng mật khẩu này (email + SĐT của cùng 1 lần đăng ký)
  for (const [k, v] of pendingLogin) if (v === password) pendingLogin.delete(k);
  return password;
}

export const authFlowApi = {
  /** Tạo tài khoản ở trạng thái Unverified và gửi OTP 6 số tới email. */
  register: async (body: RegisterInput) => {
    await http.post<void>("/auth/register", body, { auth: false, snake: true });
    holdCredentials([body.email, body.phone], body.password);
  },

  /**
   * Dùng khi người dùng đăng nhập vào tài khoản chưa xác minh (403 ACCOUNT_UNVERIFIED):
   * giữ mật khẩu vừa nhập để auto-login sau bước OTP.
   */
  holdCredentials: (identifier: string, password: string) => holdCredentials([identifier], password),

  /**
   * Xác minh tài khoản bằng OTP → /auth/otp/verify (không có token) → /auth/login để lấy phiên.
   * Mất thông tin đăng nhập tạm (vd: reload giữa chừng) thì tài khoản vẫn đã được xác minh,
   * chỉ cần đăng nhập lại → ném LOGIN_REQUIRED để page hiển thị thông báo.
   */
  verifyRegistration: async (identifier: string, otp: string): Promise<AuthSession> => {
    await http.post<{ verified: boolean; userStatus: string; usedAt: string }>(
      "/auth/otp/verify",
      { target: identifier, otpCode: otp },
      { auth: false, snake: true },
    );
    const password = takeCredentials(identifier);
    if (!password) {
      throw new ApiError(0, { message: "Xác minh thành công. Vui lòng đăng nhập để tiếp tục.", code: "LOGIN_REQUIRED" });
    }
    return identityApi.login({ identifier, password });
  },

  /** Gửi lại OTP xác minh đăng ký (cũng dùng khi đăng nhập vào tài khoản chưa xác minh). */
  resendRegistrationOtp: (identifier: string) =>
    http.post<void>("/auth/otp/resend", { target: identifier }, { auth: false, snake: true }),

  /** Gửi (hoặc gửi lại) mã OTP 6 số tới email / SĐT để đặt lại mật khẩu. */
  requestOtp: (identifier: string) =>
    http.post<void>("/auth/forgot-password", { target: identifier }, { auth: false, snake: true }),

  /** Không có endpoint riêng: giữ OTP + đích trong RAM, server kiểm tra ở resetPassword. */
  verifyOtp: async (identifier: string, otp: string): Promise<{ resetToken: string }> => {
    resetTarget.value = identifier;
    return { resetToken: otp };
  },

  /** `resetToken` ở đây chính là OTP đã nhập ở bước trước. */
  resetPassword: async (resetToken: string, newPassword: string) => {
    const target = resetTarget.value;
    if (!target) throw new ApiError(0, { message: "Phiên đặt lại mật khẩu đã hết hạn. Vui lòng thử lại từ đầu.", code: "RESET_EXPIRED" });
    await http.post<void>(
      "/auth/reset-password",
      { target, otpCode: resetToken, newPassword },
      { auth: false, snake: true },
    );
    resetTarget.value = null;
  },
};
