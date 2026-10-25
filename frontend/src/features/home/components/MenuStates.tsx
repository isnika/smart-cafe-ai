import { isApiError } from "@/shared/api";
import { Button, Skeleton } from "@/shared/ui";

export function MenuSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3" aria-busy aria-label="Đang tải thực đơn">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-48" />
      ))}
    </div>
  );
}

export function MenuError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-primary-100 bg-white p-6 text-center">
      <p className="font-semibold">Không tải được thực đơn</p>
      <p className="mt-1 text-body text-gray-600">{isApiError(error) ? error.message : "Vui lòng thử lại."}</p>
      <Button className="mt-3" variant="outline" onClick={onRetry}>
        Thử lại
      </Button>
    </div>
  );
}

export function MenuEmpty({ children }: { children: string }) {
  return (
    <p role="status" className="rounded-xl border border-dashed border-primary-200 bg-white p-6 text-center text-body text-gray-600">
      {children}
    </p>
  );
}
