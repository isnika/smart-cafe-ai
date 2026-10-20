import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Coffee } from "lucide-react";
import { cn } from "@/shared/lib/cn";

/** Màu nhấn nâu của link phụ (trùng outline focus trong tokens.css). Đổi 1 chỗ này nếu có token riêng. */
export const authLinkMuted =
  "font-semibold text-[#a9683b] hover:underline focus-visible:rounded-sm";
/** Link nhấn cam ở footer (Đăng ký / Đăng nhập). */
export const authLinkAccent =
  "font-semibold text-primary-600 hover:text-primary-700 hover:underline focus-visible:rounded-sm";

function BrandLogo() {
  return (
    <div className="mb-6 flex items-center justify-center gap-3">
      <span className="grid size-10 place-items-center rounded-lg bg-[#a9683b] text-white">
        <Coffee className="size-5" aria-hidden />
      </span>
      <span className="text-h3 font-semibold text-gray-900">Smart Cafe</span>
    </div>
  );
}

interface AuthShellProps {
  children: ReactNode;
  /** Dòng cuối trang (Chưa có tài khoản? Đăng ký, Quay lại Đăng nhập…) */
  footer?: ReactNode;
  /** Hiện logo + tên thương hiệu phía trên card (Đăng nhập / Đăng ký) */
  brand?: boolean;
}

/** Khung chung: nền kem, card trắng căn giữa, footer dính đáy, chừa safe-area cho mobile. */
export function AuthShell({ children, footer, brand }: AuthShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#fbf5ee] pt-[var(--safe-top)]">
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-6">
        {brand && <BrandLogo />}
        <div className="rounded-xl bg-white p-6 shadow-card">{children}</div>
      </main>
      {footer && (
        <footer className="px-4 pb-[calc(var(--safe-bottom)+1.5rem)] pt-2 text-center text-body text-gray-600">
          {footer}
        </footer>
      )}
    </div>
  );
}

const badgeTones = {
  warning: "bg-warning-soft text-primary-600",
  success: "bg-success-soft text-success-strong",
  info: "bg-info-soft text-info-strong",
} as const;

interface AuthHeadingProps {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  tone?: keyof typeof badgeTones;
  className?: string;
}

/** Icon tròn (tuỳ chọn) + tiêu đề + mô tả, căn giữa như Figma. */
export function AuthHeading({ title, subtitle, icon, tone = "warning", className }: AuthHeadingProps) {
  return (
    <div className={cn("mb-5 text-center", className)}>
      {icon && (
        <span
          className={cn(
            "mx-auto mb-4 grid size-14 place-items-center rounded-full [&>svg]:size-6",
            badgeTones[tone],
          )}
          aria-hidden
        >
          {icon}
        </span>
      )}
      <h1 className="text-h3 font-bold text-gray-900">{title}</h1>
      {subtitle && <p className="mt-1 text-caption text-gray-600">{subtitle}</p>}
    </div>
  );
}

/** Footer dạng "Câu hỏi? Link" */
export function AuthSwitch({ text, to, label }: { text: string; to: string; label: string }) {
  return (
    <p>
      {text}{" "}
      <Link to={to} className={authLinkAccent}>
        {label}
      </Link>
    </p>
  );
}
