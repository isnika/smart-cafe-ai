import { AlertCircle, X } from "lucide-react";
import { useDineInCartStore } from "../store";

/** Lỗi thao tác giỏ (hết món theo tên món, mất mạng, phiên hết hạn…). Rollback đã được store xử lý. */
export function CartErrorAlert({ className }: { className?: string }) {
  const error = useDineInCartStore((s) => s.error);
  const clearError = useDineInCartStore((s) => s.clearError);
  if (!error) return null;
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-lg border border-error/30 bg-error-soft p-3 text-body text-error-strong ${className ?? ""}`}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="flex-1">{error.message}</p>
      <button type="button" onClick={clearError} aria-label="Đóng thông báo" className="rounded-sm p-0.5 hover:bg-white/60">
        <X className="size-4" />
      </button>
    </div>
  );
}
