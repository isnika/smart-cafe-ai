import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/shared/lib/cn";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}

/**
 * Ô nhập OTP. Mô hình dữ liệu: `value` luôn là chuỗi số LIÊN TỤC (không có ô trống ở giữa),
 * nên focus luôn được đẩy về ô trống đầu tiên → gõ, xoá, dán, autofill SMS đều nhất quán.
 */
export function OtpInput({ value, onChange, length = 6, disabled, invalid, autoFocus }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const focusAt = (i: number) => {
    const el = refs.current[Math.max(0, Math.min(i, length - 1))];
    el?.focus();
    el?.select();
  };

  const commit = (next: string, focusIndex = next.length) => {
    onChange(next.slice(0, length));
    focusAt(focusIndex);
  };

  const handleChange = (i: number, raw: string) => {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return;
    if (typed.length === 1 && i < value.length) {
      // sửa một chữ số ở giữa: giữ nguyên các số phía sau
      commit(value.slice(0, i) + typed + value.slice(i + 1), i + 1);
    } else {
      commit(value.slice(0, i) + typed);
    }
  };

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const target = digits[i] ? i : i - 1;
      if (target >= 0) commit(value.slice(0, target) + value.slice(target + 1), target);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusAt(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusAt(i + 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (pasted) commit(pasted);
  };

  return (
    <div role="group" aria-label="Mã xác nhận OTP" className="flex justify-center gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          placeholder="–"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          aria-label={`Chữ số ${i + 1}`}
          aria-invalid={invalid || undefined}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          // luôn đưa con trỏ về ô trống đầu tiên, tránh để lại "lỗ hổng"
          onFocus={(e) => {
            if (i > value.length) focusAt(value.length);
            else e.currentTarget.select();
          }}
          className={cn(
            "h-12 w-10 rounded-md border bg-white text-center text-h3 font-semibold text-gray-900 placeholder:text-gray-300",
            "transition-colors focus:outline-none focus:ring-2 focus:ring-primary-200",
            "disabled:cursor-not-allowed disabled:bg-gray-100",
            invalid
              ? "border-error focus:ring-error-soft"
              : d
                ? "border-[#a9683b]"
                : "border-gray-200 focus:border-primary-500",
          )}
        />
      ))}
    </div>
  );
}
