import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/shared/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftIcon, className, id, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error
    ? `${inputId}-error`
    : hint
      ? `${inputId}-hint`
      : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-body font-medium text-gray-800"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400 [&>svg]:size-4">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          className={cn(
            "h-10 w-full rounded-md border bg-white px-3 text-body text-gray-900 placeholder:text-gray-400",
            "transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200",
            "disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500",
            error
              ? "border-error focus:border-error focus:ring-error-soft"
              : "border-gray-300",
            leftIcon && "pl-9",
            className,
          )}
          {...props}
        />
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="text-caption text-error-strong">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-caption text-gray-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
