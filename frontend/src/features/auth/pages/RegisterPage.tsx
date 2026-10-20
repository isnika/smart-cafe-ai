import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Mail, Phone, User } from "lucide-react";
import { roleHome } from "@/app/routes";
import { isApiError } from "@/shared/api/http";
import { Button, Input, Modal } from "@/shared/ui";
import { useAuthStore } from "../store";
import { authFlowApi } from "../api";
import { AuthHeading, AuthShell, AuthSwitch, authLinkMuted } from "../components/AuthShell";
import { FormAlert } from "../components/FormAlert";
import { PasswordInput } from "../components/PasswordInput";
import {
  PASSWORD_MIN,
  hasErrors,
  normalizePhone,
  validateConfirm,
  validateEmail,
  validateFullName,
  validateNewPassword,
  validatePhone,
} from "../validators";

type Field = "fullName" | "email" | "phone" | "password" | "confirm" | "terms";

export default function RegisterPage() {
  const status = useAuthStore((s) => s.status);
  const roleName = useAuthStore((s) => s.roleName);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const [values, setValues] = useState({ fullName: "", email: "", phone: "", password: "", confirm: "" });
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  if (status === "authenticated" && roleName) return <Navigate to={roleHome[roleName]} replace />;

  const bind = (key: keyof typeof values) => ({
    value: values[key],
    error: errors[key],
    onChange: (e: { target: { value: string } }) => {
      setValues((p) => ({ ...p, [key]: e.target.value }));
      if (errors[key]) setErrors((p) => ({ ...p, [key]: undefined }));
    },
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const next: Partial<Record<Field, string>> = {
      fullName: validateFullName(values.fullName),
      email: validateEmail(values.email),
      phone: validatePhone(values.phone),
      password: validateNewPassword(values.password),
      confirm: validateConfirm(values.password, values.confirm),
      terms: agreed ? undefined : "Bạn cần đồng ý với Điều khoản sử dụng",
    };
    setErrors(next);
    if (hasErrors(next)) return;

    setFormError(null);
    setSubmitting(true);
    const email = values.email.trim();
    try {
      await authFlowApi.register({
        fullName: values.fullName.trim(),
        email,
        phone: normalizePhone(values.phone),
        password: values.password,
      });
    } catch (err) {
      setFormError(isApiError(err) ? err.message : "Không thể tạo tài khoản, vui lòng thử lại");
      setSubmitting(false);
      return;
    }

    // Đăng ký xong → đăng nhập luôn. Nếu bước này lỗi thì đưa về trang đăng nhập kèm thông báo.
    try {
      await login({ identifier: email, password: values.password });
    } catch {
      navigate("/login", {
        replace: true,
        state: { notice: "Tạo tài khoản thành công. Hãy đăng nhập để tiếp tục." },
      });
    }
  }

  return (
    <AuthShell brand footer={<AuthSwitch text="Đã có tài khoản?" to="/login" label="Đăng nhập" />}>
      <AuthHeading title="Tạo tài khoản mới" subtitle="Trở thành thành viên để tích điểm đổi nước" className="mb-6" />

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <FormAlert>{formError}</FormAlert>}

        <Input
          label="Họ và tên"
          placeholder="Nguyễn Văn A"
          leftIcon={<User />}
          autoComplete="name"
          {...bind("fullName")}
        />
        <Input
          label="Email"
          type="email"
          placeholder="email@example.com"
          leftIcon={<Mail />}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          {...bind("email")}
        />
        <Input
          label="Số điện thoại"
          type="tel"
          inputMode="tel"
          placeholder="0901234567"
          leftIcon={<Phone />}
          autoComplete="tel"
          {...bind("phone")}
        />
        <PasswordInput
          label="Mật khẩu"
          placeholder={`Tối thiểu ${PASSWORD_MIN} ký tự`}
          autoComplete="new-password"
          {...bind("password")}
        />
        <PasswordInput
          label="Xác nhận mật khẩu"
          placeholder="Nhập lại mật khẩu"
          autoComplete="new-password"
          {...bind("confirm")}
        />

        <div>
          <label className="flex cursor-pointer items-center gap-2 text-caption text-gray-700">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked);
                if (errors.terms) setErrors((p) => ({ ...p, terms: undefined }));
              }}
              aria-invalid={!!errors.terms || undefined}
              className="size-4 rounded-sm accent-[#a9683b]"
            />
            <span>
              Tôi đồng ý với{" "}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault(); // không toggle checkbox khi mở điều khoản
                  setTermsOpen(true);
                }}
                className={authLinkMuted}
              >
                Điều khoản sử dụng
              </button>
            </span>
          </label>
          {errors.terms && <p className="mt-1 text-caption text-error-strong">{errors.terms}</p>}
        </div>

        <Button type="submit" size="lg" fullWidth loading={submitting}>
          Đăng ký
        </Button>
      </form>

      <Modal
        open={termsOpen}
        onClose={() => setTermsOpen(false)}
        title="Điều khoản sử dụng"
        footer={
          <Button
            onClick={() => {
              setAgreed(true);
              setErrors((p) => ({ ...p, terms: undefined }));
              setTermsOpen(false);
            }}
          >
            Tôi đã đọc và đồng ý
          </Button>
        }
      >
        <div className="space-y-3 text-body text-gray-700">
          <p>Smart Cafe thu thập họ tên, email và số điện thoại để quản lý tài khoản, đơn hàng và điểm tích luỹ của bạn.</p>
          <p>Bạn chịu trách nhiệm bảo mật mật khẩu. Hãy báo cho quán ngay nếu nghi ngờ tài khoản bị truy cập trái phép.</p>
          <p>Nội dung này là bản demo cho đồ án; thay bằng điều khoản chính thức trước khi triển khai.</p>
        </div>
      </Modal>
    </AuthShell>
  );
}
