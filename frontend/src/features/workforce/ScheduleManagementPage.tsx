import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store';
import { listAdminBranches, type AdminStaffProfile } from '@/shared/api/admin';
import { http } from '@/shared/api/http';
import { Button, Card, Input } from '@/shared/ui';

type Shift = { id: number; branchId: number; name: string; startTime: string; endTime: string; isOvernight: boolean; isActive: boolean };
type Status = 'Scheduled' | 'Completed' | 'Absent' | 'Leave';
type Schedule = { id: number; branchId: number; staffId: number; shiftId: number; workDate: string; status: Status; shift?: Shift; staff?: AdminStaffProfile };
type BulkResult = { createdCount: number; conflicts: string[] };
const presets = [
  { key: 'morning', name: 'Ca sáng', start: '06:00', end: '12:00' },
  { key: 'afternoon', name: 'Ca chiều', start: '12:00', end: '18:00' },
  { key: 'evening', name: 'Ca tối', start: '18:00', end: '22:00' },
] as const;
const presetName = (preset: typeof presets[number]) => `${preset.name} (${preset.start}–${preset.end})`;
const matchesPreset = (shift: Shift, preset: typeof presets[number]) =>
  (shift.name === preset.name || shift.name === presetName(preset)) && shift.startTime.slice(0, 5) === preset.start && shift.endTime.slice(0, 5) === preset.end;
const statuses: Record<Status, string> = { Scheduled: 'Đã xếp', Completed: 'Hoàn thành', Absent: 'Vắng mặt', Leave: 'Nghỉ phép' };
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
        if (!staffIds.includes(item.staffId) || item.id === editingSchedule?.id || item.status === 'Leave' || !item.shift) return false;
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
  return <div className="mx-auto max-w-6xl space-y-5">
    <header><h1 className="text-h2">{manager ? 'Quản lý ca làm việc' : 'Giám sát ca làm việc'}</h1><p className="mt-1 text-gray-600">{manager ? 'Thiết lập khung ca và phân lịch nhân viên tại chi nhánh.' : 'Theo dõi lịch và nhân viên được phân công trên toàn hệ thống.'}</p></header>
    <Card><div className="grid gap-4 md:grid-cols-4"><label className="font-medium">Chi nhánh<select aria-label="Chi nhánh" className={selectClass} value={branch} disabled={manager} onChange={(e) => { setSelectedBranch(e.target.value); setDetail(null); setError(''); }}><option value="">{manager ? 'Chưa được gán chi nhánh' : 'Tất cả chi nhánh'}</option>{branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}{assignedBranch && !branches.data?.some((b) => b.id === assignedBranch) && <option value={assignedBranch}>Chi nhánh #{assignedBranch}</option>}</select></label><Input label="Từ ngày" type="date" value={from} onChange={(e) => setFrom(e.target.value)}/><Input label="Đến ngày" type="date" value={to} onChange={(e) => setTo(e.target.value)}/><label className="font-medium">Trạng thái<select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tất cả</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>{branches.isError && <p role="alert" className="mt-2 text-error-strong">Không tải được chi nhánh. <button className="underline" onClick={() => void branches.refetch()}>Thử lại</button></p>}{from > to && <p role="alert" className="mt-2 text-error-strong">Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</p>}</Card>
    {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-error-strong">{error}</p>}
    {manager && !branch ? <p className="text-gray-600">Tài khoản chưa được gán chi nhánh quản lý.</p> : <>
      {manager && <><Card><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-h3">Khung ca làm việc</h2><Button type="button" variant="outline" onClick={() => { setEditingShift(null); setShowShiftForm(true); }}>Thêm ca làm việc mới</Button></div><p className="mt-2 text-gray-600">Chọn một trong ba ca cố định khi phân lịch. Bạn cũng có thể thêm khung ca khác.</p>
        <ul className="mt-3 divide-y divide-gray-100">{presets.map((p) => <li key={p.key} className="py-3"><p className="font-semibold">{p.name} <span className="text-caption font-normal text-gray-600">Ca cố định</span></p><p className="text-gray-600">{p.start} – {p.end}</p></li>)}</ul>
        {showShiftForm && <form key={editingShift?.id ?? 'new-shift'} onSubmit={submitShift} className="mt-4 grid items-end gap-3 md:grid-cols-4"><Input name="name" label="Tên ca" required maxLength={50} defaultValue={editingShift?.name}/><Input name="startTime" label="Bắt đầu" type="time" required defaultValue={editingShift?.startTime.slice(0, 5)}/><Input name="endTime" label="Kết thúc" type="time" required defaultValue={editingShift?.endTime.slice(0, 5)}/><div className="flex gap-2"><Button type="submit" loading={mutation.isPending}>{editingShift ? 'Lưu ca' : 'Thêm ca'}</Button><Button type="button" variant="outline" onClick={() => { setEditingShift(null); setShowShiftForm(false); }}>Hủy</Button></div><p className="text-caption text-gray-600 md:col-span-4">Giờ kết thúc trước giờ bắt đầu là ca qua đêm.</p></form>}
        {shifts.isPending ? <p className="mt-4">Đang tải ca…</p> : shifts.isError ? <p role="alert">Không tải được ca.</p> : <ul className="mt-4 divide-y divide-gray-100">{shiftList.filter((s) => !presets.some((p) => matchesPreset(s, p))).map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{s.name} <span className="text-caption font-normal text-gray-600">{s.isActive ? 'Đang hoạt động' : 'Đã ngừng'}</span></p><p className="text-gray-600">{s.startTime.slice(0, 5)} – {s.endTime.slice(0, 5)}{s.isOvernight ? ' · Qua đêm' : ''}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setEditingShift(s); setShowShiftForm(true); }}>Sửa</Button><Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate(() => http.patch(`/shifts/${s.id}/active`, { isActive: !s.isActive }, { snake: true }))}>{s.isActive ? 'Ngừng' : 'Kích hoạt'}</Button></div></li>)}</ul>}
      </Card><Card><h2 className="text-h3">{editingSchedule ? 'Sửa lịch làm việc' : 'Phân lịch làm việc'}</h2>
        {staff.isError && <p role="alert">Không tải được nhân viên. <button className="underline" onClick={() => void staff.refetch()}>Thử lại</button></p>}
        <form key={editingSchedule?.id ?? 'new-schedule'} onSubmit={submitSchedule} className="mt-4 grid items-end gap-3 md:grid-cols-4">{editingSchedule ? <div><span className="font-medium">Nhân viên</span><p className="mt-2">{staffFor(editingSchedule) ? staffLabel(staffFor(editingSchedule)!) : `Nhân viên #${editingSchedule.staffId}`}</p></div> : <StaffSelect staff={staffList.filter((s) => s.status === 'Active')} selected={selectedStaff} onChange={setSelectedStaff} />}<label className="font-medium">Ca<select name="shiftId" required className={selectClass} defaultValue={editingSchedule?.shiftId ?? ''}><option value="">Chọn ca</option><optgroup label="Ca cố định">{presets.map((p) => <option key={p.key} value={`preset:${p.key}`}>{p.name} ({p.start}–{p.end})</option>)}</optgroup><optgroup label="Ca khác">{shiftList.filter((s) => s.isActive && (!presets.some((p) => matchesPreset(s, p)) || s.id === editingSchedule?.shiftId)).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)})</option>)}</optgroup></select></label><Input name="workDate" label="Ngày làm" type="date" required defaultValue={editingSchedule?.workDate ?? from}/><div className="flex gap-2"><Button type="submit" loading={mutation.isPending} disabled={staff.isPending || shifts.isPending || shifts.isError}>{editingSchedule ? 'Lưu lịch' : 'Phân lịch'}</Button>{editingSchedule && <Button type="button" variant="outline" onClick={() => setEditingSchedule(null)}>Hủy</Button>}</div></form>{error && <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-error-strong">{error}</p>}
      </Card></>}
      <Card><h2 className="text-h3">Lịch đã phân</h2>{schedules.isPending && from <= to ? <p className="mt-3">Đang tải lịch…</p> : schedules.isError ? <p role="alert" className="mt-3">Không tải được lịch. <button className="underline" onClick={() => void schedules.refetch()}>Thử lại</button></p> : !rows.length ? <p className="mt-3 text-gray-600">Không có lịch trong khoảng ngày đã chọn.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-body"><thead><tr className="border-b text-gray-600"><th className="p-2">Ngày</th><th className="p-2">Chi nhánh</th><th className="p-2">Nhân viên</th><th className="p-2">Ca</th><th className="p-2">Trạng thái</th><th className="p-2">Chi tiết</th></tr></thead><tbody>{rows.map((s) => <tr key={s.id} className="border-b border-gray-100"><td className="p-2">{s.workDate}</td><td className="p-2">{branches.data?.find((b) => b.id === s.branchId)?.name ?? `#${s.branchId}`}</td><td className="p-2">{staffFor(s) ? nameOf(staffFor(s)!) : `Nhân viên #${s.staffId}`}</td><td className="p-2">{shiftFor(s)?.name ?? `Ca #${s.shiftId}`}</td><td className="p-2">{statuses[s.status]}</td><td className="p-2"><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setDetail(s)}>Xem</Button>{manager && canEdit(s) && <><Button size="sm" variant="outline" onClick={() => setEditingSchedule(s)}>Sửa</Button><Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => { if (window.confirm('Hủy lịch làm việc này?')) mutation.mutate(() => http.delete(`/schedules/${s.id}`)); }}>Hủy lịch</Button></>}</div></td></tr>)}</tbody></table></div>}</Card>
      {detail && <Card><div className="flex items-center justify-between"><h2 className="text-h3">Chi tiết {shiftFor(detail)?.name ?? `ca #${detail.shiftId}`} · {detail.workDate}</h2><Button size="sm" variant="outline" onClick={() => setDetail(null)}>Đóng</Button></div><p className="mt-2 text-gray-600">{shiftFor(detail)?.startTime.slice(0, 5)} – {shiftFor(detail)?.endTime.slice(0, 5)}</p>{detailSchedules.isPending ? <p>Đang tải nhân viên…</p> : detailSchedules.isError ? <p role="alert">Không tải được danh sách nhân viên. <button className="underline" onClick={() => void detailSchedules.refetch()}>Thử lại</button></p> : <ul className="mt-3 divide-y divide-gray-100">{group.map((s) => { const p = staffFor(s); return <li key={s.id} className="py-2">{p ? nameOf(p) : `Nhân viên #${s.staffId}`} · {p?.jobTitle ?? 'Chưa có chức vụ'} · {statuses[s.status]}</li>; })}</ul>}</Card>}
    </>}
  </div>;
}
