import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { roleHome } from "@/app/routes";
import { isApiError } from "@/shared/api/http";
import { Button } from "@/shared/ui";
import { authFlowApi } from "../api";
import { useAuthStore } from "../store";
import { useRecoveryStore } from "../recovery-store";
import { useCountdown } from "../hooks/useCountdown";
import { AuthHeading, AuthShell, authLinkMuted } from "../components/AuthShell";
import { FormAlert } from "../components/FormAlert";
import { OtpInput } from "../components/OtpInput";
import { maskIdentifier } from "../validators";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

/**
 * Dùng chung cho 2 luồng (phân biệt bằng recovery-store.purpose):
 *   register : xác minh tài khoản mới → server cấp phiên → auto-login vào trang theo vai trò
 *   reset    : quên mật khẩu → nhận resetToken → /reset-password
 */
export default function VerifyOtpPage() {
  const navigate = useNavigate();
  const identifier = useRecoveryStore((s) => s.identifier);
  const purpose = useRecoveryStore((s) => s.purpose);
  const setResetToken = useRecoveryStore((s) => s.setResetToken);
  const applySession = useAuthStore((s) => s.applySession);
  const { remaining, restart } = useCountdown(RESEND_SECONDS);

  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  // Xác minh đăng ký xong: dọn recovery store SAU khi rời trang. Xoá ngay lúc thành công thì
  // guard bên dưới sẽ đá về /forgot-password trước khi kịp chuyển sang /login.
  const finished = useRef(false);
  useEffect(
    () => () => {
      if (finished.current) useRecoveryStore.getState().reset();
    },
    [],
  );

  // Vào thẳng /verify-otp (reload, gõ URL) → chưa có ngữ cảnh → về bước đầu của luồng tương ứng
  if (!identifier) return <Navigate to="/forgot-password" replace />;

  const isRegister = purpose === "register";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting || !identifier) return;
    if (otp.length < OTP_LENGTH) {
      setError(`Vui lòng nhập đủ ${OTP_LENGTH} số`);
      return;
    }
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      if (isRegister) {
        // Server xác minh OTP và cấp luôn phiên → auto-login, không cần nhập lại mật khẩu
        const session = await authFlowApi.verifyRegistration(identifier, otp);
        finished.current = true;
        applySession(session);
        navigate(roleHome[session.roleName], { replace: true });
      } else {
        const { resetToken } = await authFlowApi.verifyOtp(identifier, otp);
        setResetToken(resetToken);
        navigate("/reset-password", { replace: true });
      }
    } catch (err) {
      setError(
        isApiError(err) ? err.message : "Không thể xác nhận, vui lòng thử lại",
      );
      setOtp("");
      setSubmitting(false);
    }
  }

  async function resend() {
    if (remaining > 0 || resending || !identifier) return;
    setResending(true);
    setError(null);
    try {
      await (isRegister
        ? authFlowApi.resendRegistrationOtp(identifier)
        : authFlowApi.requestOtp(identifier));
      setOtp("");
      setNotice("Đã gửi lại mã xác nhận.");
      restart();
    } catch (err) {
      setError(
        isApiError(err)
          ? err.message
          : "Không thể gửi lại mã, vui lòng thử lại",
      );
    } finally {
      setResending(false);
    }
  }

  const canResend = remaining === 0 && !resending;

  return (
    <AuthShell
      footer={
        <p>
          Chưa nhận được mã?{" "}
          <button
            type="button"
            onClick={resend}
            disabled={!canResend}
            className={`${authLinkMuted} disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline`}
          >
            Gửi lại mã
          </button>
        </p>
      }
    >
      <AuthHeading
        icon={<ShieldCheck />}
        tone="success"
        title={isRegister ? "Xác minh tài khoản" : "Xác nhận OTP"}
        subtitle={`Nhập mã ${OTP_LENGTH} số đã được gửi đến ${maskIdentifier(identifier)}`}
      />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <FormAlert>{error}</FormAlert>}
        {notice && <FormAlert tone="success">{notice}</FormAlert>}

        <OtpInput
          value={otp}
          onChange={(v) => {
            setOtp(v);
            if (error) setError(null);
          }}
          length={OTP_LENGTH}
          invalid={!!error}
          disabled={submitting}
          autoFocus
        />

        <p
          className="text-center text-caption text-gray-500"
          aria-live="polite"
        >
          {remaining > 0 ? (
            <>
              Gửi lại mã sau{" "}
              <span className="tabular font-semibold text-primary-600">
                {remaining}s
              </span>
            </>
          ) : (
            "Bạn có thể yêu cầu gửi lại mã"
          )}
        </p>

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={submitting}
          disabled={otp.length < OTP_LENGTH}
        >
          Xác nhận
        </Button>
      </form>
    </AuthShell>
  );
}
