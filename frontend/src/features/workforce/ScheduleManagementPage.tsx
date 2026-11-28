import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarCheck, CalendarClock, CalendarDays, ChevronDown, Clock3, Plus, UsersRound } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store';
import { listAdminBranches, type AdminStaffProfile } from '@/shared/api/admin';
import { http } from '@/shared/api/http';
import { Button, Card, Input } from '@/shared/ui';

type Shift = { id: number; branchId: number; name: string; startTime: string; endTime: string; isOvernight: boolean; isActive: boolean };
type Status = 'Scheduled' | 'Completed' | 'Absent' | 'Leave' | 'Cancelled';
type Schedule = { id: number; branchId: number; staffId: number; shiftId: number; workDate: string; status: Status; confirmationStatus?: 'PENDING' | 'CONFIRMED'; confirmedAt?: string | null; shift?: Shift; staff?: AdminStaffProfile };
type BulkResult = { createdCount: number; conflicts: string[] };
const presets = [
  { key: 'morning', name: 'Ca sáng', start: '06:00', end: '12:00' },
  { key: 'afternoon', name: 'Ca chiều', start: '12:00', end: '18:00' },
  { key: 'evening', name: 'Ca tối', start: '18:00', end: '22:00' },
] as const;
const presetName = (preset: typeof presets[number]) => `${preset.name} (${preset.start}–${preset.end})`;
const matchesPreset = (shift: Shift, preset: typeof presets[number]) =>
  (shift.name === preset.name || shift.name === presetName(preset)) && shift.startTime.slice(0, 5) === preset.start && shift.endTime.slice(0, 5) === preset.end;
const statuses: Record<Status, string> = { Scheduled: 'Đã xếp', Completed: 'Hoàn thành', Absent: 'Vắng mặt', Leave: 'Nghỉ phép', Cancelled: 'Đã hủy' };
const selectClass = 'mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-body';
const localDate = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const nameOf = (s: AdminStaffProfile) => s.userInfo?.fullName?.trim() || s.employeeCode || `Nhân viên #${s.id}`;
const staffLabel = (s: AdminStaffProfile) => `${nameOf(s)} - ${s.jobTitle?.trim() || 'Chưa có chức vụ'}`;
const message = (e: unknown) => e instanceof Error ? e.message : 'Không thể thực hiện thao tác';
const canEdit = (s: Schedule) => s.status === 'Scheduled' && !!s.shift && new Date(`${s.workDate}T${s.shift.startTime}`).getTime() > Date.now();
const dateOffset = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const interval = (date: string, start: string, end: string) => {
  const from = new Date(`${date}T${start.slice(0, 5)}:00`).getTime();
  const endDate = end.slice(0, 5) < start.slice(0, 5) ? dateOffset(date, 1) : date;
  return [from, new Date(`${endDate}T${end.slice(0, 5)}:00`).getTime()] as const;
};

function ConfirmationBadge({ value }: { value?: Schedule['confirmationStatus'] }) {
  const confirmed = value === 'CONFIRMED';
  const pending = value === 'PENDING';
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${confirmed ? 'bg-emerald-50 text-emerald-700' : pending ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
    <span className={`size-1.5 rounded-full ${confirmed ? 'bg-emerald-500' : pending ? 'bg-amber-500' : 'bg-gray-400'}`}/>{confirmed ? 'Đã xác nhận' : pending ? 'Chưa xác nhận' : 'Chưa có dữ liệu'}
  </span>;
}

function StaffSelect({ staff, selected, onChange }: { staff: AdminStaffProfile[]; selected: number[]; onChange: (ids: number[]) => void }) {
  const [open, setOpen] = useState(false);
  const selectedStaff = staff.filter((person) => selected.includes(person.id));
  const label = selectedStaff.length === 0 ? 'Chọn nhân viên' : selectedStaff.length === 1 ? staffLabel(selectedStaff[0]!) : `Đã chọn ${selectedStaff.length} nhân viên`;
  return <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); event.stopPropagation(); } }}>
    <span id="staff-select-label" className="font-medium">Nhân viên</span>
    <button type="button" aria-labelledby="staff-select-label staff-select-value" aria-expanded={open} aria-controls="staff-select-options" onClick={() => setOpen(!open)} className={`${selectClass} flex items-center justify-between gap-2 text-left focus:outline-none focus:ring-2 focus:ring-primary-500`}>
      <span id="staff-select-value" className="truncate">{label}</span><ChevronDown size={16} className="shrink-0" aria-hidden="true" />
    </button>
    {open && <div id="staff-select-options" role="group" aria-label="Chọn nhân viên" className="absolute z-20 mt-1 max-h-64 w-full min-w-64 overflow-y-auto rounded-md border border-gray-300 bg-white py-1 shadow-lg">
      {staff.length === 0 ? <p className="px-3 py-2 text-gray-600">Không có nhân viên đang hoạt động.</p> : staff.map((person) => <label key={person.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 font-normal hover:bg-gray-50">
        <input type="checkbox" className="size-4 shrink-0 accent-primary-700" checked={selected.includes(person.id)} onChange={(event) => onChange(event.target.checked ? [...selected, person.id] : selected.filter((id) => id !== person.id))} />
        <span>{staffLabel(person)}</span>
      </label>)}
    </div>}
  </div>;
}

export function ScheduleManagementPage() {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.roleName);
  const accountId = useAuthStore((s) => s.user?.id);
  const assignedBranch = useAuthStore((s) => s.branchId);
  const manager = role === 'Manager';
  const [selectedBranch, setSelectedBranch] = useState('');
  const branch = manager ? (assignedBranch ? String(assignedBranch) : '') : selectedBranch;
  const [from, setFrom] = useState(() => localDate());
  const [to, setTo] = useState(() => localDate(7));
  const [status, setStatus] = useState('');
  const [confirmationFilter, setConfirmationFilter] = useState('');
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<number[]>([]);
  const [detail, setDetail] = useState<Schedule | null>(null);
  const [error, setError] = useState('');
  const branches = useQuery({ queryKey: ['schedule-branches', accountId], queryFn: ({ signal }) => listAdminBranches(signal) });
  const shifts = useQuery({ queryKey: ['work-shifts', accountId, branch, role], enabled: !manager || !!branch, queryFn: ({ signal }) => http.get<Shift[]>('/shifts', { query: { branch_id: branch || undefined }, signal }) });
  const staff = useQuery({ queryKey: ['schedule-staff', accountId, branch, role], enabled: !manager || !!branch, queryFn: ({ signal }) => http.get<AdminStaffProfile[]>('/staff-profiles', { query: { branch_id: branch || undefined }, signal }) });
  const schedules = useQuery({ queryKey: ['work-schedules', accountId, branch, from, to, status, role], enabled: (!manager || !!branch) && !!from && !!to && from <= to, queryFn: ({ signal }) => http.get<Schedule[]>('/schedules', { query: { branch_id: branch || undefined, from, to, status: status || undefined }, signal }) });
  const detailSchedules = useQuery({ queryKey: ['work-schedule-detail', accountId, detail?.branchId, detail?.shiftId, detail?.workDate], enabled: !!detail, queryFn: ({ signal }) => http.get<Schedule[]>('/schedules', { query: { branch_id: detail!.branchId, shift_id: detail!.shiftId, from: detail!.workDate, to: detail!.workDate }, signal }) });
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['work-shifts'] }); void qc.invalidateQueries({ queryKey: ['work-schedules'] }); void qc.invalidateQueries({ queryKey: ['work-schedule-detail'] }); };
  const mutation = useMutation({ mutationFn: (action: () => Promise<unknown>) => action(), onSuccess: (result) => {
    setEditingShift(null); setShowShiftForm(false); setEditingSchedule(null); invalidate();
    const bulk = result as BulkResult | undefined;
    if (bulk?.conflicts?.length) { setError(`Đã phân ${bulk.createdCount} lịch. ${bulk.conflicts.join('; ')}`); }
    else { if (bulk && typeof bulk.createdCount === 'number') setSelectedStaff([]); setError(''); toast.success('Đã lưu thay đổi'); }
  }, onError: (e) => { invalidate(); setError(message(e)); } });
  const submitShift = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const start = String(f.get('startTime')); const end = String(f.get('endTime'));
    if (start === end) { setError('Giờ bắt đầu và kết thúc không được trùng nhau.'); return; }
    const input = { branchId: Number(branch), name: String(f.get('name')).trim(), startTime: `${start}:00`, endTime: `${end}:00`, isActive: editingShift?.isActive ?? true };
    if (!input.name) { setError('Vui lòng nhập tên ca.'); return; }
    setError(''); mutation.mutate(() => editingShift ? http.put(`/shifts/${editingShift.id}`, input, { snake: true }) : http.post('/shifts', input, { snake: true }));
  };
  const submitSchedule = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const selectedShift = String(f.get('shiftId')); const workDate = String(f.get('workDate'));
    const staffIds = editingSchedule ? [editingSchedule.staffId] : selectedStaff;
    if (!staffIds.length) { setError('Vui lòng chọn nhân viên.'); return; }
    setError('');
    mutation.mutate(async () => {
      const preset = presets.find((item) => selectedShift === `preset:${item.key}`);
      let shiftId = Number(selectedShift);
      const chosenShift = preset ? { startTime: preset.start, endTime: preset.end } : shiftList.find((item) => item.id === shiftId);
      if (!chosenShift) throw new Error('Không tìm thấy ca đã chọn. Vui lòng tải lại danh sách ca.');
      const existing = await http.get<Schedule[]>('/schedules', { query: { branch_id: branch, from: dateOffset(workDate, -1), to: dateOffset(workDate, 1) } });
      const [start, end] = interval(workDate, chosenShift.startTime, chosenShift.endTime);
      const conflict = existing.find((item) => {
        if (!staffIds.includes(item.staffId) || item.id === editingSchedule?.id || (item.status === 'Leave' || item.status === 'Cancelled') || !item.shift) return false;
        const [otherStart, otherEnd] = interval(item.workDate, item.shift.startTime, item.shift.endTime);
        return start < otherEnd && end > otherStart;
      });
      if (conflict?.shift) {
        const person = staffList.find((item) => item.id === conflict.staffId) ?? conflict.staff;
        throw new Error(`${person ? nameOf(person) : `Nhân viên #${conflict.staffId}`} đã có ca ${conflict.shift.name} ngày ${conflict.workDate}, ${conflict.shift.startTime.slice(0, 5)}–${conflict.shift.endTime.slice(0, 5)}${conflict.shift.isOvernight ? ' (qua đêm)' : ''}. Ca này trùng với giờ bạn chọn.`);
      }
      if (preset) {
        let shift = shiftList.find((item) => matchesPreset(item, preset) && item.isActive);
        if (!shift) {
          const inactive = shiftList.find((item) => matchesPreset(item, preset));
          if (inactive) {
            await http.patch(`/shifts/${inactive.id}/active`, { isActive: true }, { snake: true });
            shift = inactive;
          } else {
            shift = await http.post<Shift>('/shifts', { branchId: Number(branch), name: presetName(preset), startTime: `${preset.start}:00`, endTime: `${preset.end}:00`, isActive: true }, { snake: true });
          }
        }
        shiftId = shift.id;
      }
      return editingSchedule
        ? http.put(`/schedules/${editingSchedule.id}`, { staffId: editingSchedule.staffId, shiftId, workDate }, { snake: true })
        : http.post<BulkResult>('/schedules/bulk', { items: staffIds.map((staffId) => ({ staffId, shiftId, workDate })) }, { snake: true });
    });
  };
  const staffList = staff.data ?? []; const shiftList = shifts.data ?? [];
  const staffFor = (s: Schedule) => staffList.find((p) => p.id === s.staffId) ?? s.staff;
  const shiftFor = (s: Schedule) => s.shift ?? shiftList.find((p) => p.id === s.shiftId);
  const rows = schedules.data ?? [];
  const group = detailSchedules.data ?? [];
  const activeRows = rows.filter((s) => s.status !== 'Cancelled');
  const visibleRows = confirmationFilter ? rows.filter((s) => s.confirmationStatus === confirmationFilter) : rows;
  const editSchedule = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    requestAnimationFrame(() => document.getElementById('schedule-assignment')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  };
  const summaries = [
    { label: 'Lịch đã phân', value: activeRows.length, icon: UsersRound, tone: 'bg-primary-50 text-primary-700' },
    { label: 'Đã xác nhận', value: activeRows.filter((s) => s.confirmationStatus === 'CONFIRMED').length, icon: CalendarCheck, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Chưa xác nhận', value: activeRows.filter((s) => s.confirmationStatus === 'PENDING').length, icon: CalendarClock, tone: 'bg-amber-50 text-amber-700' },
  ];
  const dataUnavailable = schedules.isPending || schedules.isError || from > to || (manager && !branch);
  return <div className="mx-auto max-w-6xl space-y-5 pb-8">
    <header><p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary-700">{manager ? 'Không gian quản lý' : 'Không gian quản trị'}</p><h1 className="text-h2">{manager ? 'Quản lý ca làm việc' : 'Giám sát ca làm việc'}</h1><p className="mt-1 text-gray-600">{manager ? 'Phân lịch và theo dõi xác nhận nhận ca của nhân viên.' : 'Theo dõi lịch và xác nhận của nhân viên trên toàn hệ thống.'}</p></header>
    <div className="grid gap-3 sm:grid-cols-3">{summaries.map(({ label, value, icon: Icon, tone }) => <Card key={label} className="flex items-center gap-4 p-4 sm:p-5"><span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="size-5"/></span><div><p className="text-sm text-gray-600">{label}</p><p className="mt-0.5 font-heading text-2xl font-bold">{dataUnavailable ? '—' : value}</p></div></Card>)}</div>
    {!dataUnavailable && activeRows.some((s) => !s.confirmationStatus) && <p className="text-sm text-gray-600">Một số lịch chưa có dữ liệu xác nhận và không được tính vào số đã hoặc chưa xác nhận.</p>}
    <Card padding="lg"><div className="mb-4"><h2 className="font-heading text-lg font-semibold">Bộ lọc lịch làm việc</h2><p className="mt-1 text-sm text-gray-600">Tổng quan và danh sách theo chi nhánh, ngày và trạng thái ca.</p></div><div className="grid gap-4 md:grid-cols-4"><label className="font-medium">Chi nhánh<select aria-label="Chi nhánh" className={selectClass} value={branch} disabled={manager} onChange={(e) => { setSelectedBranch(e.target.value); setDetail(null); setError(''); }}><option value="">{manager ? 'Chưa được gán chi nhánh' : 'Tất cả chi nhánh'}</option>{branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}{assignedBranch && !branches.data?.some((b) => b.id === assignedBranch) && <option value={assignedBranch}>Chi nhánh #{assignedBranch}</option>}</select></label><Input label="Từ ngày" type="date" value={from} onChange={(e) => setFrom(e.target.value)}/><Input label="Đến ngày" type="date" value={to} onChange={(e) => setTo(e.target.value)}/><label className="font-medium">Trạng thái ca<select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tất cả</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>{branches.isError && <p role="alert" className="mt-2 text-error-strong">Không tải được chi nhánh. <button className="underline" onClick={() => void branches.refetch()}>Thử lại</button></p>}{from > to && <p role="alert" className="mt-2 text-error-strong">Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</p>}</Card>
    {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-error-strong">{error}</p>}
    {manager && !branch ? <p className="text-gray-600">Tài khoản chưa được gán chi nhánh quản lý.</p> : <>
      <Card padding="none" className="overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-6"><div><h2 className="font-heading text-lg font-semibold">Lịch đã phân</h2><p className="mt-1 text-sm text-gray-600">Theo dõi trạng thái nhận lịch của từng nhân viên.</p></div><label className="text-sm font-medium">Xác nhận nhận ca<select aria-label="Xác nhận nhận ca" className={`${selectClass} min-w-44`} value={confirmationFilter} onChange={(e) => setConfirmationFilter(e.target.value)}><option value="">Tất cả</option><option value="CONFIRMED">Đã xác nhận</option><option value="PENDING">Chưa xác nhận</option></select></label></div>
        {schedules.isPending && from <= to ? <p className="p-6 text-gray-600">Đang tải lịch…</p> : schedules.isError ? <p role="alert" className="p-6">Không tải được lịch. <button className="underline" onClick={() => void schedules.refetch()}>Thử lại</button></p> : from > to ? <p className="p-6 text-gray-600">Vui lòng chọn khoảng ngày hợp lệ.</p> : !visibleRows.length ? <p className="m-5 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-5 py-8 text-center text-sm text-gray-600">Không có lịch phù hợp với bộ lọc.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-gray-50/80 text-xs text-gray-600"><tr><th className="px-5 py-3 font-semibold">Nhân viên</th><th className="px-4 py-3 font-semibold">Ngày làm</th><th className="px-4 py-3 font-semibold">Ca làm việc</th><th className="px-4 py-3 font-semibold">Xác nhận nhận ca</th><th className="px-4 py-3 font-semibold">Trạng thái ca</th><th className="px-4 py-3 font-semibold">Thao tác</th></tr></thead><tbody className="divide-y divide-gray-100">{visibleRows.map((s) => { const person = staffFor(s); const shift = shiftFor(s); return <tr key={s.id} className="hover:bg-gray-50/60"><td className="px-5 py-4"><p className="font-semibold text-gray-900">{person ? nameOf(person) : `Nhân viên #${s.staffId}`}</p><p className="mt-1 text-xs text-gray-600">{person?.jobTitle || 'Chưa có chức vụ'}{!manager && <> · {branches.data?.find((b) => b.id === s.branchId)?.name ?? `Chi nhánh #${s.branchId}`}</>}</p></td><td className="whitespace-nowrap px-4 py-4 text-gray-700">{s.workDate}</td><td className="px-4 py-4"><p className="font-medium">{shift?.name ?? `Ca #${s.shiftId}`}</p>{shift && <p className="mt-1 flex items-center gap-1 text-xs text-gray-600"><Clock3 className="size-3"/>{shift.startTime.slice(0, 5)} – {shift.endTime.slice(0, 5)}</p>}</td><td className="px-4 py-4"><ConfirmationBadge value={s.confirmationStatus}/>{s.confirmedAt && <p className="mt-1 text-xs text-gray-600">{new Date(s.confirmedAt).toLocaleString('vi-VN')}</p>}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.status === 'Cancelled' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'}`}>{statuses[s.status] ?? s.status}</span></td><td className="px-4 py-4"><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setDetail(s)}>Xem</Button>{manager && canEdit(s) && <><Button size="sm" variant="outline" onClick={() => editSchedule(s)}>Sửa</Button><Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => { if (window.confirm('Hủy lịch làm việc này?')) mutation.mutate(() => http.delete(`/schedules/${s.id}`)); }}>Hủy lịch</Button></>}</div></td></tr>; })}</tbody></table></div>}
      </Card>
      {detail && <Card padding="lg"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Chi tiết ca</p><h2 className="mt-1 font-heading text-lg font-semibold">{shiftFor(detail)?.name ?? `Ca #${detail.shiftId}`} · {detail.workDate}</h2><p className="mt-1 text-sm text-gray-600">{shiftFor(detail)?.startTime.slice(0, 5)} – {shiftFor(detail)?.endTime.slice(0, 5)}</p></div><Button size="sm" variant="outline" onClick={() => setDetail(null)}>Đóng</Button></div>
        {detailSchedules.isPending ? <p className="mt-4 text-gray-600">Đang tải nhân viên…</p> : detailSchedules.isError ? <p role="alert" className="mt-4">Không tải được danh sách nhân viên. <button className="underline" onClick={() => void detailSchedules.refetch()}>Thử lại</button></p> : <><div className="mt-4 flex flex-wrap gap-2 text-sm"><span className="rounded-lg bg-gray-100 px-3 py-2">Tổng: <strong>{group.length}</strong></span><span className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">Đã xác nhận: <strong>{group.filter((s) => s.confirmationStatus === 'CONFIRMED').length}</strong></span><span className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">Chưa xác nhận: <strong>{group.filter((s) => s.confirmationStatus === 'PENDING').length}</strong></span></div><ul className="mt-4 divide-y divide-gray-100">{group.map((s) => { const p = staffFor(s); return <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{p ? nameOf(p) : `Nhân viên #${s.staffId}`}</p><p className="mt-1 text-sm text-gray-600">{p?.jobTitle ?? 'Chưa có chức vụ'} · {statuses[s.status]}</p></div><div><ConfirmationBadge value={s.confirmationStatus}/>{s.confirmedAt && <p className="mt-1 text-xs text-gray-600">{new Date(s.confirmedAt).toLocaleString('vi-VN')}</p>}</div></li>; })}</ul></>}
      </Card>}
      {manager && <><Card id="schedule-assignment" padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-heading text-lg font-semibold">{editingSchedule ? 'Sửa lịch làm việc' : 'Phân lịch làm việc'}</h2><p className="mt-1 text-sm text-gray-600">Chọn nhân viên, ca và ngày làm để phân công.</p></div><span className="grid size-10 place-items-center rounded-xl bg-primary-50 text-primary-700"><CalendarDays className="size-5"/></span></div>
        {staff.isError && <p role="alert" className="mt-3">Không tải được nhân viên. <button className="underline" onClick={() => void staff.refetch()}>Thử lại</button></p>}
        <form key={editingSchedule?.id ?? 'new-schedule'} onSubmit={submitSchedule} className="mt-4 grid items-end gap-3 md:grid-cols-4">{editingSchedule ? <div><span className="font-medium">Nhân viên</span><p className="mt-2">{staffFor(editingSchedule) ? staffLabel(staffFor(editingSchedule)!) : `Nhân viên #${editingSchedule.staffId}`}</p></div> : <StaffSelect staff={staffList.filter((s) => s.status === 'Active')} selected={selectedStaff} onChange={setSelectedStaff} />}<label className="font-medium">Ca<select name="shiftId" required className={selectClass} defaultValue={editingSchedule?.shiftId ?? ''}><option value="">Chọn ca</option><optgroup label="Ca cố định">{presets.map((p) => <option key={p.key} value={`preset:${p.key}`}>{p.name} ({p.start}–{p.end})</option>)}</optgroup><optgroup label="Ca khác">{shiftList.filter((s) => s.isActive && (!presets.some((p) => matchesPreset(s, p)) || s.id === editingSchedule?.shiftId)).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)})</option>)}</optgroup></select></label><Input name="workDate" label="Ngày làm" type="date" required defaultValue={editingSchedule?.workDate ?? from}/><div className="flex gap-2"><Button type="submit" loading={mutation.isPending} disabled={staff.isPending || shifts.isPending || shifts.isError}>{editingSchedule ? 'Lưu lịch' : 'Phân lịch'}</Button>{editingSchedule && <Button type="button" variant="outline" onClick={() => setEditingSchedule(null)}>Hủy</Button>}</div></form>
        {error && <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-error-strong">{error}</p>}
      </Card>
      <Card padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-heading text-lg font-semibold">Khung ca làm việc</h2><p className="mt-1 text-sm text-gray-600">Các ca cố định và khung ca khác tại chi nhánh.</p></div><Button type="button" variant="outline" leftIcon={<Plus className="size-4"/>} onClick={() => { setEditingShift(null); setShowShiftForm(true); }}>Thêm ca làm việc mới</Button></div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">{presets.map((p) => <li key={p.key} className="rounded-xl border border-primary-100 bg-primary-50/50 p-4"><p className="font-semibold">{p.name}</p><p className="mt-2 flex items-center gap-1.5 text-sm text-gray-600"><Clock3 className="size-4"/>{p.start} – {p.end}</p><span className="mt-3 inline-block rounded-full bg-white px-2.5 py-1 text-xs font-medium text-primary-700">Ca cố định</span></li>)}</ul>
        {showShiftForm && <form key={editingShift?.id ?? 'new-shift'} onSubmit={submitShift} className="mt-4 grid items-end gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4 md:grid-cols-4"><Input name="name" label="Tên ca" required maxLength={50} defaultValue={editingShift?.name}/><Input name="startTime" label="Bắt đầu" type="time" required defaultValue={editingShift?.startTime.slice(0, 5)}/><Input name="endTime" label="Kết thúc" type="time" required defaultValue={editingShift?.endTime.slice(0, 5)}/><div className="flex gap-2"><Button type="submit" loading={mutation.isPending}>{editingShift ? 'Lưu ca' : 'Thêm ca'}</Button><Button type="button" variant="outline" onClick={() => { setEditingShift(null); setShowShiftForm(false); }}>Hủy</Button></div><p className="text-caption text-gray-600 md:col-span-4">Giờ kết thúc trước giờ bắt đầu là ca qua đêm.</p></form>}
        {shifts.isPending ? <p className="mt-4 text-gray-600">Đang tải ca…</p> : shifts.isError ? <p role="alert" className="mt-4">Không tải được ca.</p> : <ul className="mt-4 divide-y divide-gray-100">{shiftList.filter((s) => !presets.some((p) => matchesPreset(s, p))).map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{s.name} <span className="text-caption font-normal text-gray-600">· {s.isActive ? 'Đang hoạt động' : 'Đã ngừng'}</span></p><p className="mt-1 text-sm text-gray-600">{s.startTime.slice(0, 5)} – {s.endTime.slice(0, 5)}{s.isOvernight ? ' · Qua đêm' : ''}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setEditingShift(s); setShowShiftForm(true); }}>Sửa</Button><Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate(() => http.patch(`/shifts/${s.id}/active`, { isActive: !s.isActive }, { snake: true }))}>{s.isActive ? 'Ngừng' : 'Kích hoạt'}</Button></div></li>)}</ul>}
      </Card></>}
    </>}
  </div>;
}
