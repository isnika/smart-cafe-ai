import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { isApiError } from "@/shared/api/http";
import { Button } from "@/shared/ui";
import { authFlowApi } from "../api";
import { useRecoveryStore } from "../recovery-store";
import { AuthHeading, AuthShell } from "../components/AuthShell";
import { FormAlert } from "../components/FormAlert";
import { PasswordInput } from "../components/PasswordInput";
import { PasswordStrength } from "../components/PasswordStrength";
import { validateConfirm, validateNewPassword } from "../validators";

const REDIRECT_DELAY_MS = 1500;

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const resetToken = useRecoveryStore((s) => s.resetToken);
  const clearRecovery = useRecoveryStore((s) => s.reset);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Hiện banner thành công một nhịp rồi chuyển về /login.
  // Chỉ xoá recovery store lúc chuyển trang, nếu không guard bên dưới sẽ đá về /forgot-password trước.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => {
      navigate("/login", {
        replace: true,
        state: { notice: "Mật khẩu đã được thay đổi. Hãy đăng nhập bằng mật khẩu mới." },
      });
      clearRecovery();
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(t);
  }, [done, navigate, clearRecovery]);

  if (!resetToken && !done) return <Navigate to="/forgot-password" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting || done || !resetToken) return;

    const next = {
      password: validateNewPassword(password),
      confirm: validateConfirm(password, confirm),
    };
    setErrors(next);
    if (next.password || next.confirm) return;

    setFormError(null);
    setSubmitting(true);
    try {
      await authFlowApi.resetPassword(resetToken, password);
      setDone(true);
    } catch (err) {
      setFormError(isApiError(err) ? err.message : "Không thể đổi mật khẩu, vui lòng thử lại");
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <AuthHeading
        icon={<KeyRound />}
        tone="info"
        title="Đặt lại mật khẩu"
        subtitle="Tạo mật khẩu mới bảo mật hơn"
      />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div>
          <PasswordInput
            label="Mật khẩu mới"
            placeholder="Nhập mật khẩu mới"
            autoComplete="new-password"
            disabled={done}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
            }}
            error={errors.password}
          />
          <PasswordStrength value={password} />
        </div>

        <PasswordInput
          label="Xác nhận mật khẩu mới"
          placeholder="Nhập lại mật khẩu mới"
          autoComplete="new-password"
          disabled={done}
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (errors.confirm) setErrors((p) => ({ ...p, confirm: undefined }));
          }}
          error={errors.confirm}
        />

        {formError && <FormAlert>{formError}</FormAlert>}
        {done && <FormAlert tone="success">Mật khẩu đã được thay đổi thành công!</FormAlert>}

        <Button type="submit" size="lg" fullWidth loading={submitting} disabled={done}>
          Xác nhận
        </Button>
      </form>
    </AuthShell>
  );
}
