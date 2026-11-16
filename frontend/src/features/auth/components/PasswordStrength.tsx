import { cn } from "@/shared/lib/cn";
import { passwordStrength } from "../validators";

const fill = { error: "bg-error", warning: "bg-warning", success: "bg-success" } as const;
const text = { error: "text-error-strong", warning: "text-warning-strong", success: "text-success-strong" } as const;

/** 4 thanh + nhãn độ mạnh. Chỉ hiện khi đã nhập. */
export function PasswordStrength({ value }: { value: string }) {
  if (!value) return null;
  const { score, label, tone } = passwordStrength(value);

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1.5" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn("h-1 flex-1 rounded-full transition-colors", i <= score ? fill[tone] : "bg-gray-200")}
          />
        ))}
      </div>
      <p className={cn("mt-1 text-caption font-medium", text[tone])}>{label}</p>
    </div>
  );
}
