import { http, HttpResponse, delay } from "msw";

/** OTP cố định cho demo. */
export const MOCK_OTP = "123456";
const base = "/api/auth";

/**
 * Mock cho Đăng ký / Quên mật khẩu. Thêm vào mảng handlers hiện có:
 *   export const handlers = [...existing, ...authFlowHandlers];
 *
 * Lưu ý: /auth/login mock chỉ nhận 4 tài khoản @smartcafe.vn có sẵn,
 * nên đăng ký xong auto-login sẽ lỗi → app chuyển về /login kèm thông báo (đã xử lý).
 */
export const authFlowHandlers = [
  http.post(`${base}/register`, async ({ request }) => {
    await delay(400);
    const body = (await request.json()) as { email?: string };
    if (body.email?.toLowerCase().endsWith("@smartcafe.vn")) {
      return HttpResponse.json({ message: "Email này đã được đăng ký", code: "EMAIL_TAKEN" }, { status: 409 });
    }
    return new HttpResponse(null, { status: 201 });
  }),

  http.post(`${base}/forgot-password`, async () => {
    await delay(400);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${base}/verify-otp`, async ({ request }) => {
    await delay(400);
    const body = (await request.json()) as { otp?: string };
    if (body.otp !== MOCK_OTP) {
      return HttpResponse.json({ message: "Mã OTP không đúng hoặc đã hết hạn", code: "OTP_INVALID" }, { status: 400 });
    }
    return HttpResponse.json({ resetToken: "mock-reset-token" });
  }),

  http.post(`${base}/reset-password`, async ({ request }) => {
    await delay(400);
    const body = (await request.json()) as { resetToken?: string };
    if (body.resetToken !== "mock-reset-token") {
      return HttpResponse.json({ message: "Phiên đặt lại mật khẩu đã hết hạn", code: "RESET_EXPIRED" }, { status: 410 });
    }
    return new HttpResponse(null, { status: 204 });
  }),
];
