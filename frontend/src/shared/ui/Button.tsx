import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/cn";

export type ButtonVariant =
  "primary" | "secondary" | "outline" | "ghost" | "danger" | "ai";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800",
  secondary:
    "bg-secondary-700 text-white hover:bg-secondary-800 active:bg-secondary-900",
  outline:
    "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 active:bg-gray-100",
  ghost: "text-gray-700 hover:bg-gray-100 active:bg-gray-200",
  danger: "bg-error text-white hover:bg-error-strong",
  ai: "bg-ai-gradient text-white hover:brightness-110 active:brightness-95",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-body gap-1.5 rounded-sm",
  md: "h-10 px-4 text-body font-medium gap-2 rounded-md",
  lg: "h-12 px-6 text-body-lg font-medium gap-2 rounded-md", // 48px: dễ bấm trên mobile
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading,
      fullWidth,
      leftIcon,
      rightIcon,
      className,
      children,
      disabled,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-50",
          variants[variant],
          sizes[size],
          fullWidth && "w-full",
          className,
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          leftIcon
        )}
        {children}
        {!loading && rightIcon}
      </button>
    );
  },
);
