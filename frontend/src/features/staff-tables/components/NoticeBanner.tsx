import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { SessionNotice } from '../hooks/useStaffTables';

const STYLE: Record<SessionNotice['tone'], string> = {
  success: 'bg-success-soft text-success-strong',
  warning: 'bg-warning-soft text-warning-strong',
  error: 'bg-error-soft text-error-strong',
};
const ICON = { success: CheckCircle2, warning: AlertTriangle, error: XCircle } as const;

/** Thông báo kết quả thao tác phiên. error/warning dùng role=alert để trình đọc màn hình đọc ngay. */
export function NoticeBanner({ notice }: { notice: SessionNotice | null }) {
  if (!notice) return null;
  const Icon = ICON[notice.tone];
  return (
    <p role={notice.tone === 'success' ? 'status' : 'alert'} className={cn('flex gap-2 rounded-md p-3 text-body font-medium', STYLE[notice.tone])}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      {notice.text}
    </p>
  );
}
