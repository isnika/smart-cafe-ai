import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/ui';

/** Lỗi tải một section: giữ nguyên các section khác, chỉ section này có nút "Thử lại". */
export function SectionError({ title, message, onRetry, retrying }: { title: string; message?: string; onRetry: () => void; retrying?: boolean }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-lg border border-error/30 bg-error-soft p-4 text-center text-error-strong">
      <AlertTriangle aria-hidden className="size-6 text-error" />
      <p className="font-medium">{title}</p>
      <p className="text-body">{message ?? 'Vui lòng thử lại.'}</p>
      <Button variant="outline" size="sm" leftIcon={<RefreshCw className="size-4" />} onClick={onRetry} loading={retrying}>
        Thử lại
      </Button>
    </div>
  );
}

export function SectionEmpty({ children }: { children: string }) {
  return (
    <p role="status" className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-gray-500">
      {children}
    </p>
  );
}

/** Dòng cảnh báo khi đã có dữ liệu cũ nhưng lần tải lại gần nhất thất bại. */
export function StaleNote({ children, onRetry }: { children: string; onRetry: () => void }) {
  return (
    <p role="alert" className="rounded-md bg-warning-soft p-2 text-caption text-warning-strong">
      {children}{' '}
      <button type="button" onClick={onRetry} className="underline">
        Thử lại
      </button>
    </p>
  );
}
