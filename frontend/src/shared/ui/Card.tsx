import type { HTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg";
  interactive?: boolean;
  accent?: "info" | "success" | "warning" | "error";
}

const paddings = { none: "", sm: "p-3", md: "p-4", lg: "p-6" };
const accents = {
  info: "border-l-4 border-l-info",
  success: "border-l-4 border-l-success",
  warning: "border-l-4 border-l-warning",
  error: "border-l-4 border-l-error",
};

export function Card({
  padding = "md",
  interactive,
  accent,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-gray-200 bg-white shadow-card",
        paddings[padding],
        accent && accents[accent],
        interactive && "cursor-pointer transition-shadow hover:shadow-dropdown",
        className,
      )}
      {...props}
    />
  );
}
