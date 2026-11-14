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
 *  - Identity service trả luôn token từ /auth/otp/verify; fallback hỗ trợ deployments cũ không trả token.
 *  - Không có bước "verify OTP → reset token" cho quên mật khẩu: /auth/reset-password nhận thẳng
 *    { phone_email, otp_code, new_password }. verifyOtp chỉ giữ OTP trong RAM (đóng vai "resetToken")
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
   * Xác minh tài khoản bằng OTP. Identity service trả phiên ngay sau khi OTP hợp lệ.
   * Nếu một deployment cũ chỉ trả trạng thái xác minh, dùng credential tạm nếu còn;
   * nếu không thì báo LOGIN_REQUIRED để người dùng đăng nhập.
   */
  verifyRegistration: async (identifier: string, otp: string): Promise<AuthSession> => {
    const result = await http.post<{ accessToken?: string; refreshToken?: string | null; user?: AuthSession["user"]; roleName?: AuthSession["roleName"]; role?: string | { name?: string }; branchId?: number | null; verified?: boolean; userStatus?: string; usedAt?: string }>(
      "/auth/otp/verify", { phoneEmail: identifier, otpCode: otp }, { auth: false, snake: true },
    );
    // Identity service hiện cấp phiên ngay khi xác minh OTP; một số deployments cũ chỉ trả verified.
    if (result.accessToken && result.user) {
      const roleName = result.roleName ?? (typeof result.role === "string" ? result.role : result.role?.name) ?? "Customer";
      return { accessToken: result.accessToken, refreshToken: result.refreshToken ?? null, user: result.user, roleName: roleName as AuthSession["roleName"], branchId: result.branchId ?? null };
    }
    const password = takeCredentials(identifier);
    if (!password) {
      throw new ApiError(0, { message: "Xác minh thành công. Vui lòng đăng nhập để tiếp tục.", code: "LOGIN_REQUIRED" });
    }
    return identityApi.login({ identifier, password });
  },

  /** Gửi lại OTP xác minh đăng ký (cũng dùng khi đăng nhập vào tài khoản chưa xác minh). */
  resendRegistrationOtp: (identifier: string) =>
    http.post<void>("/auth/otp/resend", { phoneEmail: identifier }, { auth: false, snake: true }),

  /** Gửi (hoặc gửi lại) mã OTP 6 số tới email / SĐT để đặt lại mật khẩu. */
  requestOtp: (identifier: string) =>
    http.post<void>("/auth/forgot-password", { phoneEmail: identifier }, { auth: false, snake: true }),

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
      { phoneEmail: target, otpCode: resetToken, newPassword },
      { auth: false, snake: true },
    );
    resetTarget.value = null;
  },
};
