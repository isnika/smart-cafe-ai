import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";
import { roleHome } from "@/app/routes";
import { isApiError } from "@/shared/api/http";
import { Button, Input } from "@/shared/ui";
import { useAuthStore } from "../store";
import { authFlowApi } from "../api";
import { useRecoveryStore } from "../recovery-store";
import {
  AuthHeading,
  AuthShell,
  AuthSwitch,
  authLinkMuted,
} from "../components/AuthShell";
import { FormAlert } from "../components/FormAlert";
import { GoogleIcon } from "../components/GoogleIcon";
import { PasswordInput } from "../components/PasswordInput";
import {
  normalizeIdentifier,
  safeRedirect,
  validateIdentifier,
} from "../validators";

interface LocationState {
  from?: string;
  /** Thông báo từ trang trước (vd: đặt lại mật khẩu xong) */
  notice?: string;
}

export default function LoginPage() {
  const status = useAuthStore((s) => s.status);
  const roleName = useAuthStore((s) => s.roleName);
  const login = useAuthStore((s) => s.login);
  const state = useLocation().state as LocationState | null;
  const navigate = useNavigate();
  const startVerification = useRecoveryStore((s) => s.start);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{
    identifier?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Đã đăng nhập (kể cả vừa login xong) → đi tiếp. Redirect theo store nên không cần navigate() thủ công.
  if (status === "authenticated" && roleName) {
    return (
      <Navigate to={safeRedirect(state?.from) ?? roleHome[roleName]} replace />
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const next = {
      identifier: validateIdentifier(identifier),
      password: password ? undefined : "Vui lòng nhập mật khẩu",
    };
    setErrors(next);
    setInfo(null);
    if (next.identifier || next.password) return;

    setFormError(null);
    setSubmitting(true);
    try {
      await login({ identifier: normalizeIdentifier(identifier), password });
      // thành công: store đổi status → render lại ở trên và <Navigate/>
    } catch (err) {
      // Tài khoản đã đăng ký nhưng chưa xác minh OTP → gửi lại mã và đưa sang bước xác minh
      if (isApiError(err) && err.code === "ACCOUNT_UNVERIFIED") {
        const id = normalizeIdentifier(identifier);
        try {
          await authFlowApi.resendRegistrationOtp(id);
          startVerification(id, "register");
          navigate("/verify-otp");
          return;
        } catch {
          /* gửi mã lỗi → rơi xuống hiển thị thông báo của server bên dưới */
        }
      }
      setFormError(
        isApiError(err)
          ? err.status === 401
            ? "Email/số điện thoại hoặc mật khẩu không đúng"
            : err.message
          : "Đã có lỗi xảy ra, vui lòng thử lại",
      );
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      brand
      footer={
        <AuthSwitch text="Chưa có tài khoản?" to="/register" label="Đăng ký" />
      }
    >
      <AuthHeading
        title="Chào mừng trở lại!"
        subtitle="Đăng nhập để gọi nước ngon liền tay"
        className="mb-6"
      />

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {state?.notice && <FormAlert tone="success">{state.notice}</FormAlert>}
        {formError && <FormAlert>{formError}</FormAlert>}
        {info && <FormAlert tone="info">{info}</FormAlert>}

        <Input
          label="Email / Số điện thoại"
          placeholder="Nhập email hoặc số điện thoại"
          leftIcon={<Mail />}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            if (errors.identifier)
              setErrors((p) => ({ ...p, identifier: undefined }));
          }}
          error={errors.identifier}
        />

        <PasswordInput
          label="Mật khẩu"
          placeholder="Nhập mật khẩu"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (errors.password)
              setErrors((p) => ({ ...p, password: undefined }));
          }}
          error={errors.password}
        />

        <div className="text-right">
          <Link
            to="/forgot-password"
            className={`${authLinkMuted} text-caption`}
          >
            Quên mật khẩu?
          </Link>
        </div>

        <Button type="submit" size="lg" fullWidth loading={submitting}>
          Đăng nhập
        </Button>
      </form>

      <div
        className="my-5 flex items-center gap-3 text-caption text-gray-500"
        role="separator"
      >
        <span className="h-px flex-1 bg-gray-200" />
        hoặc
        <span className="h-px flex-1 bg-gray-200" />
      </div>

      <Button
        variant="outline"
        size="lg"
        fullWidth
        leftIcon={<GoogleIcon />}
        onClick={() => {
          setFormError(null);
          setInfo(
            "Đăng nhập bằng Google sẽ có ở phiên bản sau. Vui lòng dùng email / số điện thoại.",
          );
        }}
      >
        Đăng nhập với Google
      </Button>
    </AuthShell>
  );
}
