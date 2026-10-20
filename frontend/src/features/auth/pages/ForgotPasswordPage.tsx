import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock, Mail } from "lucide-react";
import { isApiError } from "@/shared/api/http";
import { Button, Input } from "@/shared/ui";
import { authFlowApi } from "../api";
import { useRecoveryStore } from "../recovery-store";
import { AuthHeading, AuthShell, authLinkMuted } from "../components/AuthShell";
import { FormAlert } from "../components/FormAlert";
import { normalizeIdentifier, validateIdentifier } from "../validators";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const start = useRecoveryStore((s) => s.start);
  const [identifier, setIdentifier] = useState(useRecoveryStore.getState().identifier ?? "");
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const err = validateIdentifier(identifier);
    setError(err);
    if (err) return;

    setFormError(null);
    setSubmitting(true);
    const normalized = normalizeIdentifier(identifier);
    try {
      await authFlowApi.requestOtp(normalized);
      start(normalized);
      navigate("/verify-otp");
    } catch (e) {
      setFormError(isApiError(e) ? e.message : "Không thể gửi mã, vui lòng thử lại");
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      footer={
        <Link to="/login" className={authLinkMuted}>
          Quay lại Đăng nhập
        </Link>
      }
    >
      <AuthHeading
        icon={<Lock />}
        tone="warning"
        title="Quên mật khẩu"
        subtitle="Nhập email hoặc số điện thoại đã đăng ký để nhận mã xác nhận OTP"
      />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <FormAlert>{formError}</FormAlert>}
        <Input
          label="Email hoặc Số điện thoại"
          placeholder="Nhập thông tin của bạn"
          leftIcon={<Mail />}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            if (error) setError(undefined);
          }}
          error={error}
        />
        <Button type="submit" size="lg" fullWidth loading={submitting}>
          Gửi mã xác nhận
        </Button>
      </form>
    </AuthShell>
  );
}
