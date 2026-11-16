import { useState, type FormEvent } from 'react';
import { CalendarOff, LogIn, LogOut } from 'lucide-react';
import { Button, Card, Input, Skeleton } from '@/shared/ui';
import { CheckinScanner } from '../components/CheckinScanner';
import { ShiftSummary } from '../components/ShiftSummary';
import { useStaffCheckin } from '../hooks/useStaffCheckin';
import { formatClock } from '../model';

export default function StaffCheckinPage() {
  const c = useStaffCheckin();
  const [code, setCode] = useState('');
  const out = c.active?.timekeeping?.checkIn != null && c.active.timekeeping.checkOut == null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (await c.submitCode(code)) setCode('');
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-4 p-4">
      <header>
        <h1 className="text-h2">Check-in QR</h1>
        <p className="text-body text-gray-600">Quét QR ca làm việc để ghi nhận giờ vào hoặc giờ ra.</p>
      </header>

      {c.isLoading ? (
        <div aria-busy="true" aria-label="Đang tải ca làm việc" className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : c.loadError ? (
        <Card accent="error" role="alert" className="space-y-3">
          <p className="text-body text-error-strong">{c.loadError.message}</p>
          <Button variant="outline" onClick={c.reload}>
            Thử lại
          </Button>
        </Card>
      ) : (
        <>
          <Card>
            {c.active ? (
              <ShiftSummary schedule={c.active} phase={c.phase} />
            ) : (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <CalendarOff className="size-8 text-gray-500" aria-hidden />
                <p className="text-body font-medium text-gray-800">
                  <>Hôm nay bạn không có lịch làm việc</>
                </p>
              </div>
            )}
          </Card>

          {c.active && c.phase !== 'done' && (
            <Card className="space-y-4">
              <h2 className="text-h3">{out ? 'Check-out' : 'Check-in'}</h2>
              <CheckinScanner paused={c.submitting} onScan={(raw) => void c.submitCode(raw)} />
              <form onSubmit={onSubmit} className="space-y-3">
                <Input
                  label="Hoặc nhập mã ca"
                  placeholder="QR ca làm việc"
                  value={code}
                  autoComplete="off"
                  autoCapitalize="none"
                  disabled={c.submitting}
                  onChange={(e) => {
                    setCode(e.target.value);
                    if (c.actionError) c.clearActionError();
                  }}
                />
                {c.actionError && (
                  <div role="alert" className="rounded-md bg-error-soft p-2 text-caption text-error-strong">
                    {c.actionError.message}
                    {c.actionError.retryable && (
                      <button type="submit" className="ml-2 font-semibold underline">
                        Thử lại
                      </button>
                    )}
                  </div>
                )}
                <Button
                  type="submit"
                  size="lg"
                  fullWidth
                  variant={out ? 'secondary' : 'primary'}
                  loading={c.submitting}
                  disabled={c.submitting}
                  leftIcon={out ? <LogOut className="size-5" /> : <LogIn className="size-5" />}
                >
                  {out ? 'Check-out' : 'Check-in'}
                </Button>
              </form>
            </Card>
          )}
          <Card className="space-y-3">
            <h2 className="text-h3">Lịch sử chấm công</h2>
            {c.history.length === 0 ? (
              <p className="text-body text-gray-600">Chưa có dữ liệu chấm công.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {c.history.map((record) => (
                  <li key={record.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                    <div className="flex justify-between gap-3 text-body">
                      <span className="font-medium">{record.workDate ?? record.schedule?.workDate ?? '—'}</span>
                      <span className="text-gray-600">{record.status ?? record.schedule?.status ?? '—'}</span>
                    </div>
                    <div className="flex justify-between gap-3 text-caption text-gray-600">
                      <span>Giờ vào: {formatClock(record.checkIn)}</span>
                      <span>Giờ ra: {formatClock(record.checkOut)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
