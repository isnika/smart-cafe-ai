import { http } from 'msw';
import { fail, guardedV1, noContent, ok, readJson, url } from '../utils';
import { MOCK_ACCOUNTS, createCustomer, findAccount, type MockAccount } from './identity';

/** OTP cố định cho demo (cả đăng ký lẫn quên mật khẩu). */
export const MOCK_OTP = '123456';

/** Chỉnh lúc runtime qua window.__mock.auth.config (vd: otpTtlMs = 1000 để test OTP hết hạn). */
export const authFlowConfig = {
  otpTtlMs: 5 * 60_000,
  maxOtpAttempts: 5,
};

/** Mỗi mục đích có OTP riêng: mã đăng ký không dùng được cho đặt lại mật khẩu và ngược lại. */
type OtpScope = 'register' | 'reset';

interface OtpEntry { otp: string; expiresAt: number; attempts: number }

const otps = new Map<string, OtpEntry>(); // key = `${scope}:${accountId}`

export function resetAuthFlowMock(): void {
  otps.clear();
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

const post = (suffix: string, resolver: Parameters<typeof guardedV1>[0]) => http.post(url(`/auth${suffix}`), guardedV1(resolver));

/**
 * Contract theo SmartAPI v1 (envelope + snake_case):
 *   POST /auth/register          { full_name, email, phone, password } → 201 (tài khoản Unverified + gửi OTP)
 *   POST /auth/otp/verify        { target, otp_code } → { verified, user_status, used_at }  — KHÔNG cấp token
 *   POST /auth/otp/resend        { target } → 204
 *   POST /auth/forgot-password   { target } → 204
 *   POST /auth/reset-password    { target, otp_code, new_password } → 204 (OTP được kiểm tra ở đây, không có reset token)
 *
 * Kịch bản test nhanh:
 *   email kết thúc @fail.test          → 500 (test hiển thị lỗi form)
 *   email/SĐT trùng tài khoản đã Active → 409 EMAIL_TAKEN / PHONE_TAKEN
 *   email của tài khoản CHƯA xác minh   → đăng ký lại được: cập nhật thông tin + gửi OTP mới
 */
export const authFlowHandlers = [
  post('/register', async ({ request }) => {
    const b = await readJson<{ full_name?: string; email?: string; phone?: string; password?: string }>(request);
    const fullName = b.full_name?.trim() ?? '';
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
    return ok({ userStatus: 'Unverified' }, null, { status: 201 });
  }),

  /** Xác minh tài khoản bằng OTP đăng ký → Active. KHÔNG trả token: FE phải gọi /auth/login sau đó. */
  post('/otp/verify', async ({ request }) => {
    const { target, otp_code } = await readJson<{ target?: string; otp_code?: string }>(request);
    if (!target || !otp_code) fail(400, 'VALIDATION_ERROR', 'Thiếu mã OTP');

    const account = findAccount(target);
    consumeOtp('register', account, otp_code);
    if (!account) fail(400, 'OTP_INVALID', 'Mã OTP không đúng hoặc đã hết hạn');

    if (account.status === 'Unverified') account.status = 'Active';
    return ok({ verified: true, userStatus: account.status, usedAt: new Date().toISOString() });
  }),

  /**
   * Gửi lại OTP đăng ký. Luôn 204 (chống dò tài khoản); chỉ thực sự gửi khi tài khoản đang Unverified.
   * FE cũng gọi khi đăng nhập vào tài khoản chưa xác minh (403 ACCOUNT_UNVERIFIED).
   */
  post('/otp/resend', async ({ request }) => {
    const { target } = await readJson<{ target?: string }>(request);
    if (!target?.trim()) fail(400, 'VALIDATION_ERROR', 'Thiếu email hoặc số điện thoại');

    const account = findAccount(target);
    if (account && account.status === 'Unverified') issueOtp('register', account);
    return noContent();
  }),

  /**
   * Luôn 204 dù target có tồn tại hay không (chống dò tài khoản).
   * Chỉ tài khoản Active mới nhận OTP; còn lại bước reset sẽ báo OTP không đúng.
   */
  post('/forgot-password', async ({ request }) => {
    const { target } = await readJson<{ target?: string }>(request);
    if (!target?.trim()) fail(400, 'VALIDATION_ERROR', 'Thiếu email hoặc số điện thoại');

    const account = findAccount(target);
    if (account && account.status === 'Active') issueOtp('reset', account);
    return noContent();
  }),

  post('/reset-password', async ({ request }) => {
    const { target, otp_code, new_password } = await readJson<{ target?: string; otp_code?: string; new_password?: string }>(request);
    if (!target || !otp_code || !new_password) fail(400, 'VALIDATION_ERROR', 'Thiếu thông tin đặt lại mật khẩu');
    if (new_password.length < 6) fail(400, 'VALIDATION_ERROR', 'Mật khẩu tối thiểu 6 ký tự');

    const account = findAccount(target);
    consumeOtp('reset', account, otp_code); // OTP dùng 1 lần, sai quá số lần → khoá
    if (!account) fail(400, 'OTP_INVALID', 'Mã OTP không đúng hoặc đã hết hạn');

    account.password = new_password; // đăng nhập lại bằng mật khẩu mới được
    return noContent();
  }),
];
