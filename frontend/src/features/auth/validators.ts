const EMAIL_RE = /^[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const PHONE_RE = /^(?:\+84|0)[35789][0-9]{8}$/;

export const PASSWORD_MIN = 8;

/** Bỏ khoảng trắng / dấu chấm / gạch ngang trong số điện thoại. */
export const normalizePhone = (v: string) => v.replace(/[\s.\-()]/g, "");

export const isEmail = (v: string) => EMAIL_RE.test(v.trim());
export const isPhone = (v: string) => PHONE_RE.test(v.trim());

/** Chuẩn hoá trước khi gửi API: email giữ nguyên (đã trim), số điện thoại bỏ ký tự phân tách. */
export function normalizeIdentifier(v: string): string {
  const s = v.trim();
  return isEmail(s) ? s : isPhone(s) ? normalizePhone(s) : s;
}

export function validateIdentifier(v: string): string | undefined {
  const s = v.trim();
  if (!s) return "Vui lòng nhập email hoặc số điện thoại";
  if (!isEmail(s) && !isPhone(s)) return "Email hoặc số điện thoại không hợp lệ";
}

export function validateEmail(v: string): string | undefined {
  if (!v.trim()) return "Vui lòng nhập email";
  if (!isEmail(v)) return "Email chưa đúng định dạng, ví dụ: ten@example.com";
}

export function validatePhone(v: string): string | undefined {
  if (!v.trim()) return "Vui lòng nhập số điện thoại";
  if (!isPhone(v)) return "Số điện thoại chưa đúng định dạng, ví dụ: 0901234567 hoặc +84901234567";
}

export function validateFullName(v: string): string | undefined {
  if (v.trim().length < 2) return "Vui lòng nhập họ và tên";
}

export function validateNewPassword(v: string): string | undefined {
  if (!v) return "Vui lòng nhập mật khẩu";
  if (v.length < PASSWORD_MIN) return `Mật khẩu cần ít nhất ${PASSWORD_MIN} ký tự`;
  if (!/[\p{L}]/u.test(v) || !/\d/.test(v)) return "Mật khẩu cần có cả chữ và số";
  if (new TextEncoder().encode(v).length > 72) return "Mật khẩu tối đa 72 byte UTF-8";
}

export function validateConfirm(password: string, confirm: string): string | undefined {
  if (!confirm) return "Vui lòng nhập lại mật khẩu";
  if (confirm !== password) return "Mật khẩu xác nhận không khớp";
}

export const hasErrors = (e: Record<string, string | undefined>) =>
  Object.values(e).some(Boolean);

// ── Độ mạnh mật khẩu: 4 tiêu chí → 4 thanh ──
export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  tone: "error" | "warning" | "success";
}

export function passwordStrength(v: string): PasswordStrengthResult {
  const score = [
    v.length >= 8,
    /[a-z]/.test(v) && /[A-Z]/.test(v),
    /\d/.test(v),
    /[^A-Za-z0-9]/.test(v),
  ].filter(Boolean).length as PasswordStrengthResult["score"];

  if (score <= 1) return { score, label: "Mật khẩu yếu", tone: "error" };
  if (score === 2) return { score, label: "Mật khẩu trung bình", tone: "warning" };
  if (score === 3) return { score, label: "Mật khẩu mạnh", tone: "success" };
  return { score, label: "Mật khẩu rất mạnh", tone: "success" };
}

/** em***@example.com  |  090****567 */
export function maskIdentifier(v: string): string {
  const s = v.trim();
  const at = s.indexOf("@");
  if (at > 0) return `${s.slice(0, Math.min(2, at))}***${s.slice(at)}`;
  return `${s.slice(0, 3)}****${s.slice(-3)}`;
}

/** Chỉ cho phép redirect nội bộ (chống open-redirect qua location.state). */
export function safeRedirect(path: string | undefined): string | undefined {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return undefined;
  if (/^\/(login|register|forgot-password|verify-otp|reset-password)/.test(path)) return undefined;
  return path;
}
