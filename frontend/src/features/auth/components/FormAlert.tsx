import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/shared/lib/cn";

const tones = {
  error: { cls: "bg-error-soft text-error-strong", Icon: AlertCircle, role: "alert" },
  success: { cls: "bg-success-soft text-success-strong", Icon: CheckCircle2, role: "status" },
  info: { cls: "bg-info-soft text-info-strong", Icon: Info, role: "status" },
} as const;

/** Banner thông báo trong form (lỗi server, thành công, thông tin). */
export function FormAlert({
  tone = "error",
  children,
  className,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
  className?: string;
}) {
  const { cls, Icon, role } = tones[tone];
  return (
    <div
      role={role}
      className={cn("flex items-start gap-2 rounded-md px-3 py-2.5 text-caption font-medium", cls, className)}
    >
      <Icon className="mt-px size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
