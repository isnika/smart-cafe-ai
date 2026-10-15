import type { HTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

export type BadgeTone =
  "neutral" | "primary" | "success" | "warning" | "error" | "info" | "ai";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-gray-100 text-gray-700",
  primary: "bg-primary-100 text-primary-800",
  success: "bg-success-soft text-success-strong",
  warning: "bg-warning-soft text-warning-strong",
  error: "bg-error-soft text-error-strong",
  info: "bg-info-soft text-info-strong",
  ai: "bg-ai-gradient text-white",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Map trạng thái đơn -> tông màu, dùng chung cho Order Queue, Tracking, Mini Card */
export const orderStatusTone: Record<string, BadgeTone> = {
  PENDING: "warning",
  CONFIRMED: "info",
  PREPARING: "primary",
  SERVING: "primary",
  READY: "success",
  DELIVERING: "info",
  COMPLETED: "success",
  CANCELLED: "error",
};
