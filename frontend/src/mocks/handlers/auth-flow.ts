import { http, HttpResponse, type HttpResponseResolver } from 'msw';
import { fail, guarded, readJson, url } from '../utils';
import { MOCK_ACCOUNTS, createCustomer, findAccount, toSession, type MockAccount } from './identity';

/** OTP cố định cho demo (cả đăng ký lẫn quên mật khẩu). */
export const MOCK_OTP = '123456';

/** Chỉnh lúc runtime qua window.__mock.auth.config (vd: otpTtlMs = 1000 để test OTP hết hạn). */
export const authFlowConfig = {
  otpTtlMs: 5 * 60_000,
  resetTtlMs: 10 * 60_000,
  maxOtpAttempts: 5,
};

/** Mỗi mục đích có OTP riêng: mã đăng ký không dùng được cho đặt lại mật khẩu và ngược lại. */
type OtpScope = 'register' | 'reset';

interface OtpEntry { otp: string; expiresAt: number; attempts: number }
interface ResetEntry { accountId: string; expiresAt: number }

const otps = new Map<string, OtpEntry>(); // key = `${scope}:${accountId}`
const resetTokens = new Map<string, ResetEntry>(); // dùng 1 lần

export function resetAuthFlowMock(): void {
  otps.clear();
  resetTokens.clear();
}

const otpKey = (scope: OtpScope, account: MockAccount) => `${scope}:${account.id}`;

/** Tạo OTP mới cho tài khoản (thay mã cũ, reset số lần thử). */
function issueOtp(scope: OtpScope, account: MockAccount): void {
  otps.set(otpKey(scope, account), { otp: MOCK_OTP, expiresAt: Date.now() + authFlowConfig.otpTtlMs, attempts: 0 });
  console.info(`[mock] OTP (${scope}) cho ${account.email}: ${MOCK_OTP}`);
}

/** Kiểm tra OTP; ném MockHttpError nếu sai/hết hạn/bị khoá. Đúng → OTP bị huỷ (dùng 1 lần). */
function consumeOtp(scope: OtpScope, account: MockAccount | undefined, otp: string): void {
  const key = account ? otpKey(scope, account) : '';
  const entry = otps.get(key);
  // Không có tài khoản / chưa từng gửi OTP → cùng 1 thông báo (không lộ tài khoản nào có thật)
  if (!entry) fail(400, 'OTP_INVALID', 'Mã OTP không đúng hoặc đã hết hạn');
  if (entry.attempts >= authFlowConfig.maxOtpAttempts) {
    fail(429, 'OTP_LOCKED', 'Bạn đã nhập sai quá nhiều lần. Vui lòng yêu cầu mã mới.');
  }
  if (Date.now() > entry.expiresAt) {
    otps.delete(key);
    fail(400, 'OTP_EXPIRED', 'Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.');
  }
  if (otp !== entry.otp) {
    entry.attempts += 1;
    const left = authFlowConfig.maxOtpAttempts - entry.attempts;
    if (left <= 0) fail(429, 'OTP_LOCKED', 'Bạn đã nhập sai quá nhiều lần. Vui lòng yêu cầu mã mới.');
    fail(400, 'OTP_INVALID', `Mã OTP không đúng (còn ${left} lần thử)`);
  }
  otps.delete(key);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(0|\+84)\d{9}$/;

/**
 * FE hiện gọi /auth/*; backend thật có thể đặt dưới /identity/auth/* (giống login/logout/me).
 * Mock nhận cả hai để đổi đường dẫn ở FE không làm vỡ mock.
 */
const post = (suffix: string, resolver: HttpResponseResolver) =>
  [url(`/auth${suffix}`), url(`/identity/auth${suffix}`)].map((p) => http.post(p, guarded(resolver)));

const noContent = () => new HttpResponse(null, { status: 204 });

/**
 * Luồng đăng ký:  register (Unverified + gửi OTP) → verify-registration (→ Active + cấp phiên = auto-login).
 *
 * Kịch bản test nhanh:
 *   email kết thúc @fail.test          → 500 (test hiển thị lỗi form)
 *   email/SĐT trùng tài khoản đã Active → 409 EMAIL_TAKEN / PHONE_TAKEN
 *   email của tài khoản CHƯA xác minh   → đăng ký lại được: cập nhật thông tin + gửi OTP mới
 */
export const authFlowHandlers = [
  ...post('/register', async ({ request }) => {
    const b = await readJson<{ fullName?: string; email?: string; phone?: string; password?: string }>(request);
    const fullName = b.fullName?.trim() ?? '';
    const email = b.email?.trim() ?? '';
    const phone = b.phone?.trim() ?? '';
    const password = b.password ?? '';

    if (fullName.length < 2 || !EMAIL_RE.test(email) || !PHONE_RE.test(phone) || password.length < 6) {
      fail(400, 'VALIDATION_ERROR', 'Thông tin đăng ký không hợp lệ');
    }
    if (email.toLowerCase().endsWith('@fail.test')) fail(500, 'INTERNAL_ERROR', 'Máy chủ đang bận, vui lòng thử lại sau');

    const byEmail = MOCK_ACCOUNTS.find((a) => a.email.toLowerCase() === email.toLowerCase());
    const byPhone = findAccount(phone);
    if (byEmail && byEmail.status !== 'Unverified') fail(409, 'EMAIL_TAKEN', 'Email này đã được đăng ký');
    if (byPhone && byPhone !== byEmail) fail(409, 'PHONE_TAKEN', 'Số điện thoại này đã được đăng ký');

    let account: MockAccount;
    if (byEmail) {
      // Người dùng bỏ dở bước xác minh rồi đăng ký lại → dùng lại tài khoản, cập nhật thông tin mới
      Object.assign(byEmail, { fullName, phone, password });
      account = byEmail;
    } else {
      account = createCustomer({ fullName, email, phone, password, status: 'Unverified' });
    }
    issueOtp('register', account);
    return new HttpResponse(null, { status: 201 });
  }),

  /** Xác minh tài khoản mới bằng OTP đăng ký → Active và cấp phiên đăng nhập luôn (auto-login). */
  ...post('/verify-registration', async ({ request }) => {
    const { identifier, otp } = await readJson<{ identifier?: string; otp?: string }>(request);
    if (!identifier || !otp) fail(400, 'VALIDATION_ERROR', 'Thiếu mã OTP');

    const account = findAccount(identifier);
    consumeOtp('register', account, otp);
    if (!account) fail(400, 'OTP_INVALID', 'Mã OTP không đúng hoặc đã hết hạn');

    if (account.status === 'Unverified') account.status = 'Active';
    account.lastLoginAt = new Date().toISOString();
    return HttpResponse.json(toSession(account)); // cấp phiên luôn → FE auto-login
  }),

  /**
   * Gửi lại OTP đăng ký. Luôn 204 (chống dò tài khoản); chỉ thực sự gửi khi tài khoản đang Unverified.
   * FE cũng gọi khi đăng nhập vào tài khoản chưa xác minh (403 ACCOUNT_UNVERIFIED).
   */
  ...post('/resend-otp', async ({ request }) => {
    const { identifier } = await readJson<{ identifier?: string }>(request);
    if (!identifier?.trim()) fail(400, 'VALIDATION_ERROR', 'Thiếu email hoặc số điện thoại');

    const account = findAccount(identifier);
    if (account && account.status === 'Unverified') issueOtp('register', account);
    return noContent();
  }),

  /**
   * Luôn 204 dù identifier có tồn tại hay không (chống dò tài khoản).
   * Chỉ tài khoản Active mới nhận OTP; còn lại bước verify sẽ báo OTP không đúng.
   */
  ...post('/forgot-password', async ({ request }) => {
    const { identifier } = await readJson<{ identifier?: string }>(request);
    if (!identifier?.trim()) fail(400, 'VALIDATION_ERROR', 'Thiếu email hoặc số điện thoại');

    const account = findAccount(identifier);
    if (account && account.status === 'Active') issueOtp('reset', account);
    return noContent();
  }),

  ...post('/verify-otp', async ({ request }) => {
    const { identifier, otp } = await readJson<{ identifier?: string; otp?: string }>(request);
    if (!identifier || !otp) fail(400, 'VALIDATION_ERROR', 'Thiếu mã OTP');

    const account = findAccount(identifier);
    consumeOtp('reset', account, otp);
    if (!account) fail(400, 'OTP_INVALID', 'Mã OTP không đúng hoặc đã hết hạn');

    const resetToken = `mock-reset-${crypto.randomUUID()}`;
    resetTokens.set(resetToken, { accountId: account.id, expiresAt: Date.now() + authFlowConfig.resetTtlMs });
    return HttpResponse.json({ resetToken });
  }),

  ...post('/reset-password', async ({ request }) => {
    const { resetToken, newPassword } = await readJson<{ resetToken?: string; newPassword?: string }>(request);
    if (!resetToken || !newPassword) fail(400, 'VALIDATION_ERROR', 'Thiếu thông tin đặt lại mật khẩu');

    const entry = resetTokens.get(resetToken);
    if (!entry || Date.now() > entry.expiresAt) {
      resetTokens.delete(resetToken);
      fail(410, 'RESET_EXPIRED', 'Phiên đặt lại mật khẩu đã hết hạn. Vui lòng thử lại từ đầu.');
    }
    if (newPassword.length < 6) fail(400, 'VALIDATION_ERROR', 'Mật khẩu tối thiểu 6 ký tự');

    const account = MOCK_ACCOUNTS.find((a) => a.id === entry.accountId);
    if (!account) fail(410, 'RESET_EXPIRED', 'Phiên đặt lại mật khẩu đã hết hạn. Vui lòng thử lại từ đầu.');

    account.password = newPassword; // đăng nhập lại bằng mật khẩu mới được
    resetTokens.delete(resetToken); // token dùng 1 lần
    return noContent();
  }),
];