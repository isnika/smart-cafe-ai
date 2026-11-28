import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileText, History, MapPin, Send, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/features/auth/store';
import { storeApi } from '@/shared/api';
import { Button, Card, Input } from '@/shared/ui';
import type { LeaveType, ScheduleView } from '@/shared/types';

const leaveTypes: { value: LeaveType; label: string }[] = [
  { value: 'Annual', label: 'Phép năm' }, { value: 'Sick', label: 'Nghỉ ốm' },
  { value: 'Unpaid', label: 'Nghỉ không lương' }, { value: 'Other', label: 'Khác' },
];
const statusLabels: Record<string, string> = {
  Scheduled: 'Đã phân công', Completed: 'Hoàn thành', Absent: 'Vắng mặt', Leave: 'Nghỉ phép', Cancelled: 'Đã hủy',
};
const leaveLabels: Record<string, string> = { Pending: 'Chờ duyệt', Approved: 'Đã duyệt', Rejected: 'Từ chối', Cancelled: 'Đã rút' };
const dateString = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shiftDate = (d: Date, days: number) => { const copy = new Date(d); copy.setDate(copy.getDate() + days); return copy; };
const formatDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('vi-VN');
const startOfWeek = () => { const d = new Date(); return shiftDate(d, -((d.getDay() + 6) % 7)); };
const canConfirm = (s: ScheduleView) => s.status === 'Scheduled' && !!s.shift && new Date(`${s.workDate}T${s.shift.startTime}+07:00`).getTime() > Date.now();
const timeRange = (s: ScheduleView) => s.shift ? `${s.shift.startTime.slice(0, 5)} – ${s.shift.endTime.slice(0, 5)}` : 'Chưa có giờ ca';

function StatusBadge({ confirmed }: { confirmed: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${confirmed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
    <span className={`size-1.5 rounded-full ${confirmed ? 'bg-emerald-500' : 'bg-amber-500'}`}/>{confirmed ? 'Đã xác nhận' : 'Chưa xác nhận'}
  </span>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-5 py-8 text-center text-sm text-gray-600">{children}</div>;
}

function ScheduleList({ items, onSelect }: { items: ScheduleView[]; onSelect: (id: number) => void }) {
  if (!items.length) return <EmptyState>Không có ca làm việc trong khoảng thời gian này.</EmptyState>;
  return <div className="space-y-3">{items.map((s) => <div key={s.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-primary-200">
    <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary-50 text-primary-700">
      <span className="text-[10px] font-semibold uppercase">Th {Number(s.workDate.slice(5, 7))}</span>
      <span className="text-lg font-bold leading-5">{s.workDate.slice(8, 10)}</span>
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-gray-900">{s.shift?.name ?? `Ca #${s.shiftId}`}</p><StatusBadge confirmed={s.confirmationStatus === 'CONFIRMED'}/></div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600"><span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5"/>{timeRange(s)}</span><span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5"/>{s.branchName ?? `Chi nhánh #${s.branchId}`}</span><span>{statusLabels[s.status] ?? s.status}</span></div>
    </div>
    <Button size="sm" variant="outline" onClick={() => onSelect(s.id)}>Chi tiết</Button>
  </div>)}</div>;
}

function ScheduleDetail({ schedule, onClose, onConfirm, busy }: { schedule: ScheduleView; onClose: () => void; onConfirm: () => void; busy: boolean }) {
  return <Card padding="none" className="overflow-hidden border-primary-100">
    <div className="flex items-start justify-between gap-3 border-b border-primary-100 bg-primary-50/70 px-5 py-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Thông tin ca</p><h3 className="mt-1 font-heading text-lg font-semibold text-gray-900">{schedule.shift?.name ?? `Ca #${schedule.shiftId}`}</h3></div>
      <button type="button" onClick={onClose} aria-label="Đóng chi tiết" className="rounded-md p-1.5 text-gray-600 hover:bg-white"><X className="size-4"/></button>
    </div>
    <div className="space-y-4 p-5 text-sm">
      <StatusBadge confirmed={schedule.confirmationStatus === 'CONFIRMED'}/>
      <div className="space-y-3 text-gray-700">
        <p className="flex items-center gap-2"><CalendarDays className="size-4 text-primary-600"/>{formatDate(schedule.workDate)}</p>
        <p className="flex items-center gap-2"><Clock3 className="size-4 text-primary-600"/>{timeRange(schedule)}</p>
        <p className="flex items-center gap-2"><MapPin className="size-4 text-primary-600"/>{schedule.branchName ?? `Chi nhánh #${schedule.branchId}`}</p>
        <p className="flex items-center gap-2"><UserRound className="size-4 text-primary-600"/>{schedule.staff?.jobTitle || 'Chưa cập nhật vị trí'}</p>
      </div>
      <div className="border-t border-gray-100 pt-3 text-gray-600">Trạng thái ca: <span className="font-medium text-gray-900">{statusLabels[schedule.status] ?? schedule.status}</span>{schedule.confirmedAt && <p className="mt-1">Xác nhận lúc {new Date(schedule.confirmedAt).toLocaleString('vi-VN')}</p>}</div>
      {canConfirm(schedule) && schedule.confirmationStatus !== 'CONFIRMED' && <Button fullWidth loading={busy} leftIcon={<CheckCircle2 className="size-4"/>} onClick={onConfirm}>Xác nhận nhận ca</Button>}
    </div>
  </Card>;
}

type Tab = 'schedule' | 'history' | 'leave';

export function StaffLeavePage() {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('schedule');
  const [week, setWeek] = useState(startOfWeek);
  const [selected, setSelected] = useState<number | null>(null);
  const [historyFrom, setHistoryFrom] = useState(() => dateString(shiftDate(new Date(), -30)));
  const [historyTo, setHistoryTo] = useState(() => dateString(shiftDate(new Date(), -1)));
  const [error, setError] = useState('');
  const today = dateString(new Date());
  const schedules = useQuery({ queryKey: ['my-schedules', userId], queryFn: () => storeApi.getMySchedules({ from: '1900-01-01', to: '9999-12-31' }) });
  const requests = useQuery({ queryKey: ['leave-requests', 'me', userId], queryFn: () => storeApi.getMyLeaveRequests() });
  const confirm = useMutation({ mutationFn: storeApi.confirmSchedule, onSuccess: () => { toast.success('Đã xác nhận nhận ca'); void qc.invalidateQueries({ queryKey: ['my-schedules', userId] }); }, onError: (e: unknown) => { toast.error(e instanceof Error ? e.message : 'Không thể xác nhận ca'); void qc.invalidateQueries({ queryKey: ['my-schedules', userId] }); } });
  const create = useMutation({ mutationFn: storeApi.createLeaveRequest, onSuccess: () => { toast.success('Đã gửi yêu cầu nghỉ phép'); void qc.invalidateQueries({ queryKey: ['leave-requests'] }); }, onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Không thể gửi yêu cầu') });
  const cancel = useMutation({ mutationFn: storeApi.cancelLeaveRequest, onSuccess: () => { toast.success('Đã rút yêu cầu'); void qc.invalidateQueries({ queryKey: ['leave-requests'] }); }, onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Không thể rút yêu cầu') });
  function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); setError(''); create.mutate({ leaveType: String(f.get('leaveType')) as LeaveType, startDate: String(f.get('startDate')), endDate: String(f.get('endDate')), reason: String(f.get('reason')).trim() }); }

  const rows = schedules.data ?? [];
  const upcoming = rows.filter(canConfirm);
  const weekStart = dateString(week);
  const weekEnd = dateString(shiftDate(week, 6));
  const weekRows = rows.filter((s) => s.workDate >= weekStart && s.workDate <= weekEnd);
  const otherUpcoming = upcoming.filter((s) => s.workDate < weekStart || s.workDate > weekEnd);
  const history = rows.filter((s) => s.workDate >= historyFrom && s.workDate <= historyTo && s.workDate < today);
  const detail = rows.find((s) => s.id === selected);
  const stats = [
    { label: 'Ca hôm nay', value: rows.filter((s) => s.workDate === today && s.status !== 'Cancelled').length, icon: CalendarDays, tone: 'bg-primary-50 text-primary-700' },
    { label: 'Ca sắp tới', value: upcoming.length, icon: CalendarClock, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Chưa xác nhận', value: upcoming.filter((s) => s.confirmationStatus !== 'CONFIRMED').length, icon: CalendarCheck, tone: 'bg-amber-50 text-amber-700' },
  ];
  const tabs: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
    { id: 'schedule', label: 'Lịch làm việc', icon: CalendarDays }, { id: 'history', label: 'Lịch sử', icon: History }, { id: 'leave', label: 'Nghỉ phép', icon: FileText },
  ];

  return <div className="mx-auto max-w-6xl space-y-6 pb-8">
    <header><p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary-700">Không gian nhân viên</p><h1 className="text-h2">Lịch làm việc &amp; nghỉ phép</h1><p className="mt-1 text-body text-gray-600">Theo dõi ca làm, xác nhận lịch và quản lý yêu cầu nghỉ phép.</p></header>
    <div className="grid gap-3 sm:grid-cols-3">{stats.map(({ label, value, icon: Icon, tone }) => <Card key={label} className="flex items-center gap-4 p-4 sm:p-5"><span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="size-5"/></span><div><p className="text-sm text-gray-600">{label}</p><p className="mt-0.5 font-heading text-2xl font-bold text-gray-900">{schedules.isPending || schedules.isError ? '—' : value}</p></div></Card>)}</div>
    <div role="tablist" aria-label="Lịch và nghỉ phép" className="flex gap-1 overflow-x-auto border-b border-gray-200">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setSelected(null); }} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${tab === id ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`}><Icon className="size-4"/>{label}</button>)}</div>
    {tab !== 'leave' && (schedules.isPending ? <Card><p className="py-6 text-center text-gray-600">Đang tải lịch làm việc…</p></Card> : schedules.isError ? <Card><p role="alert" className="text-error-strong">Không tải được lịch. <button className="underline" onClick={() => void schedules.refetch()}>Thử lại</button></p></Card> : <div className={`grid items-start gap-5 ${detail ? 'lg:grid-cols-[minmax(0,1fr)_300px]' : ''}`}>
      <div className="min-w-0 space-y-5">
        {tab === 'schedule' ? <>
          <Card padding="none" className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6"><div><h2 className="font-heading text-lg font-semibold">Lịch làm việc theo tuần</h2><p className="mt-1 text-sm text-gray-600">{formatDate(weekStart)} – {formatDate(weekEnd)}</p></div><div className="flex items-center gap-2"><button type="button" aria-label="Tuần trước" onClick={() => setWeek(shiftDate(week, -7))} className="grid size-9 place-items-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"><ChevronLeft className="size-4"/></button><Button size="sm" variant="outline" onClick={() => setWeek(startOfWeek())}>Tuần này</Button><button type="button" aria-label="Tuần sau" onClick={() => setWeek(shiftDate(week, 7))} className="grid size-9 place-items-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"><ChevronRight className="size-4"/></button></div></div>
            <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/60 px-2 py-3 sm:px-5">{Array.from({ length: 7 }, (_, i) => { const d = shiftDate(week, i); const value = dateString(d); const count = weekRows.filter((s) => s.workDate === value).length; return <div key={value} className="flex flex-col items-center gap-1 text-xs text-gray-600"><span>{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i]}</span><span className={`grid size-8 place-items-center rounded-full text-sm font-semibold ${value === today ? 'bg-primary-600 text-white' : 'text-gray-900'}`}>{d.getDate()}</span><span className={`h-1.5 w-1.5 rounded-full ${count ? 'bg-primary-500' : 'bg-transparent'}`} aria-label={count ? `${count} ca` : undefined}/></div>; })}</div>
            <div className="p-4 sm:p-5"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-gray-900">Ca trong tuần</h3><span className="text-sm text-gray-600">{weekRows.length} ca</span></div><ScheduleList items={weekRows} onSelect={setSelected}/></div>
          </Card>
          {otherUpcoming.length > 0 && <Card padding="lg"><div className="mb-4"><h2 className="font-heading text-lg font-semibold">Ca sắp tới khác</h2><p className="mt-1 text-sm text-gray-600">Các ca ngoài tuần đang xem.</p></div><ScheduleList items={otherUpcoming} onSelect={setSelected}/></Card>}
        </> : <Card padding="lg"><div className="mb-5"><h2 className="font-heading text-lg font-semibold">Lịch sử làm việc</h2><p className="mt-1 text-sm text-gray-600">Chọn khoảng thời gian để xem các ca trước đây.</p></div><div className="mb-5 grid gap-3 sm:grid-cols-2"><Input label="Từ ngày" type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)}/><Input label="Đến ngày" type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)}/></div>{historyFrom > historyTo ? <p role="alert" className="text-error-strong">Khoảng ngày không hợp lệ.</p> : <ScheduleList items={history} onSelect={setSelected}/>}</Card>}
      </div>
      {detail && <ScheduleDetail schedule={detail} onClose={() => setSelected(null)} onConfirm={() => confirm.mutate(detail.id)} busy={confirm.isPending}/>}
    </div>)}
    {tab === 'leave' && <div className="grid items-start gap-5 lg:grid-cols-2">
      <Card padding="lg"><div className="mb-5 flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700"><Send className="size-5"/></span><div><h2 className="font-heading text-lg font-semibold">Gửi yêu cầu nghỉ phép</h2><p className="mt-1 text-sm text-gray-600">Điền thông tin để gửi yêu cầu đến quản lý.</p></div></div>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Loại nghỉ<select name="leaveType" className="mt-1.5 h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-body">{leaveTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label><Input name="startDate" type="date" label="Từ ngày" required/><Input name="endDate" type="date" label="Đến ngày" required/><label className="text-sm font-medium sm:col-span-2">Lý do<textarea name="reason" required maxLength={500} rows={4} placeholder="Nhập lý do nghỉ phép" className="mt-1.5 w-full rounded-md border border-gray-300 p-3 text-body"/></label>{error && <p role="alert" className="text-sm text-error-strong sm:col-span-2">{error}</p>}<div className="sm:col-span-2"><Button type="submit" loading={create.isPending} leftIcon={<Send className="size-4"/>}>Gửi yêu cầu</Button></div></form>
      </Card>
      <Card padding="lg"><div className="mb-5"><h2 className="font-heading text-lg font-semibold">Yêu cầu của tôi</h2><p className="mt-1 text-sm text-gray-600">Theo dõi trạng thái các yêu cầu đã gửi.</p></div>{requests.isError ? <p role="alert" className="text-error-strong">Không tải được yêu cầu. <button className="underline" onClick={() => void requests.refetch()}>Thử lại</button></p> : requests.isPending ? <p className="text-gray-600">Đang tải…</p> : !requests.data?.length ? <EmptyState>Chưa có yêu cầu nghỉ phép nào.</EmptyState> : <ul className="space-y-3">{requests.data.map((r) => <li key={r.id} className="rounded-xl border border-gray-200 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{leaveTypes.find((t) => t.value === r.leaveType)?.label}</p><p className="mt-1 text-sm text-gray-600">{formatDate(r.startDate)} – {formatDate(r.endDate)}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' : r.status === 'Pending' ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>{leaveLabels[r.status] ?? r.status}</span></div><p className="mt-3 break-words text-sm text-gray-600">{r.reason}</p>{r.status === 'Pending' && <Button className="mt-3" size="sm" variant="outline" loading={cancel.isPending} onClick={() => cancel.mutate(r.id)}>Rút đơn</Button>}</li>)}</ul>}</Card>
    </div>}
  </div>;
}
