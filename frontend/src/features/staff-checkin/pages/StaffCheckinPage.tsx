import { useState, type FormEvent } from 'react';
import { CalendarOff, LogIn, LogOut } from 'lucide-react';
import { Button, Card, Input, Skeleton } from '@/shared/ui';
import { CheckinScanner } from '../components/CheckinScanner';
import { ShiftSummary } from '../components/ShiftSummary';
import { useStaffCheckin } from '../hooks/useStaffCheckin';
import { hhmm } from '../model';

export default function StaffCheckinPage() {
  const c = useStaffCheckin();
  const [code, setCode] = useState('');
  const out = c.phase === 'in';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (await c.submitCode(code)) setCode('');
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-4 p-4">
      <header>
        <h1 className="text-h2">Check-in QR</h1>
        <p className="text-body text-gray-600">Quét QR ca in tại quầy, hoặc nhập mã ca nếu không dùng được camera.</p>
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
            {c.active && c.activeShift ? (
              <ShiftSummary schedule={c.active} shift={c.activeShift} phase={c.phase} />
            ) : (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <CalendarOff className="size-8 text-gray-400" aria-hidden />
                <p className="text-body font-medium text-gray-800">
                  {c.shifts.length === 0 ? 'Chi nhánh không có ca nào hôm nay' : 'Hôm nay bạn không có lịch làm việc'}
                </p>
                {c.shifts.length > 0 && (
                  <p className="text-caption text-gray-500">
                    Ca của chi nhánh: {c.shifts.map((s) => `${s.name} ${hhmm(s.startTime)}–${hhmm(s.endTime)}`).join(' · ')}
                  </p>
                )}
              </div>
            )}
          </Card>

          {c.phase !== 'done' && c.phase !== 'none' && (
            <Card className="space-y-4">
              <h2 className="text-h3">{out ? 'Check-out' : 'Check-in'}</h2>
              <CheckinScanner paused={c.submitting} onScan={(raw) => void c.submitCode(raw)} />
              <form onSubmit={onSubmit} className="space-y-3">
                <Input
                  label="Hoặc nhập mã ca"
                  placeholder="shift-qr:…"
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
        </>
      )}
    </div>
  );
}
