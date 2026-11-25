import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthStore } from '@/features/auth/store';
import { listAdminBranches, type AdminStaffProfile } from '@/shared/api/admin';
import { http } from '@/shared/api/http';
import { Button, Card, Input } from '@/shared/ui';

type Shift = { id: number; branchId: number; name: string; startTime: string; endTime: string; isOvernight: boolean; isActive: boolean };
type Status = 'Scheduled' | 'Completed' | 'Absent' | 'Leave';
type Schedule = { id: number; staffId: number; shiftId: number; workDate: string; status: Status; shift?: Shift };
type Assignment = { staffId: number; shiftId: number; workDate: string };
const statuses: Record<Status, string> = { Scheduled: 'Đã xếp', Completed: 'Hoàn thành', Absent: 'Vắng mặt', Leave: 'Nghỉ phép' };
const selectClass = 'mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-body';
const localDate = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const nameOf = (s: AdminStaffProfile) => s.userInfo?.fullName?.trim() || s.employeeCode || `Nhân viên #${s.id}`;
const staffOption = (s: AdminStaffProfile) => s.userInfo?.fullName?.trim() && s.employeeCode ? `${s.userInfo.fullName.trim()} · ${s.employeeCode}` : nameOf(s);
const message = (e: unknown) => e instanceof Error ? e.message : 'Không thể thực hiện thao tác';

export function ScheduleManagementPage() {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.roleName);
  const accountId = useAuthStore((s) => s.user?.id);
  const assignedBranch = useAuthStore((s) => s.branchId);
  const [selectedBranch, setSelectedBranch] = useState('');
  const branch = role === 'Manager' && assignedBranch ? String(assignedBranch) : selectedBranch;
  const [from, setFrom] = useState(() => localDate());
  const [to, setTo] = useState(() => localDate(14));
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [error, setError] = useState('');
  const branches = useQuery({ queryKey: ['schedule-branches', accountId], queryFn: ({ signal }) => listAdminBranches(signal) });
  const shifts = useQuery({ queryKey: ['work-shifts', accountId, branch], enabled: !!branch, queryFn: ({ signal }) => http.get<Shift[]>('/shifts', { query: { branch_id: branch }, signal }) });
  const staff = useQuery({ queryKey: ['schedule-staff', accountId, branch], enabled: !!branch, queryFn: ({ signal }) => http.get<AdminStaffProfile[]>('/staff-profiles', { query: { branch_id: branch }, signal }) });
  const schedules = useQuery({ queryKey: ['work-schedules', accountId, branch, from, to], enabled: !!branch && !!from && !!to && from <= to, queryFn: ({ signal }) => http.get<Schedule[]>('/schedules', { query: { branch_id: branch, from, to }, signal }) });
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['work-shifts'] }); void qc.invalidateQueries({ queryKey: ['work-schedules'] }); };
  const mutation = useMutation({ mutationFn: (action: () => Promise<unknown>) => action(), onSuccess: () => { setError(''); setEditingShift(null); setEditingSchedule(null); invalidate(); toast.success('Đã lưu thay đổi'); }, onError: (e) => setError(message(e)) });
  const submitShift = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const start = String(f.get('startTime')); const end = String(f.get('endTime'));
    if (start === end) { setError('Giờ bắt đầu và kết thúc không được trùng nhau.'); return; }
    const input = { branchId: Number(branch), name: String(f.get('name')).trim(), startTime: `${start}:00`, endTime: `${end}:00`, isActive: editingShift?.isActive ?? true };
    if (!input.name) { setError('Vui lòng nhập tên ca.'); return; }
    setError(''); mutation.mutate(() => editingShift ? http.put(`/shifts/${editingShift.id}`, input, { snake: true }) : http.post('/shifts', input, { snake: true }));
  };
  const submitSchedule = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const input: Assignment = { staffId: Number(f.get('staffId')), shiftId: Number(f.get('shiftId')), workDate: String(f.get('workDate')) };
    setError(''); mutation.mutate(() => editingSchedule ? http.put(`/schedules/${editingSchedule.id}`, input, { snake: true }) : http.post('/schedules', input, { snake: true }));
  };
  const staffList = staff.data ?? []; const shiftList = shifts.data ?? [];
  return <div className="mx-auto max-w-6xl space-y-5">
    <header><h1 className="text-h2">Quản lý ca làm việc</h1><p className="mt-1 text-gray-600">Thiết lập ca và phân lịch làm việc cho nhân viên theo chi nhánh.</p></header>
    <Card><div className="grid gap-4 md:grid-cols-3"><label className="font-medium">Chi nhánh<select aria-label="Chi nhánh" className={selectClass} value={branch} disabled={role === 'Manager' && !!assignedBranch} onChange={(e) => { setSelectedBranch(e.target.value); setEditingShift(null); setEditingSchedule(null); setError(''); }}><option value="">Chọn chi nhánh</option>{branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}{assignedBranch && !branches.data?.some((b) => b.id === assignedBranch) && <option value={assignedBranch}>Chi nhánh #{assignedBranch}</option>}</select></label><Input label="Từ ngày" type="date" value={from} onChange={(e) => setFrom(e.target.value)}/><Input label="Đến ngày" type="date" value={to} onChange={(e) => setTo(e.target.value)}/></div>{branches.isError && <p role="alert" className="mt-2 text-error-strong">Không tải được chi nhánh. <button className="underline" onClick={() => void branches.refetch()}>Thử lại</button></p>}{from > to && <p role="alert" className="mt-2 text-error-strong">Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</p>}</Card>
    {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-error-strong">{error}</p>}
    {!branch ? <p className="text-gray-600">Chọn chi nhánh để quản lý ca và lịch làm việc.</p> : <>
      <Card><h2 className="text-h3">Ca làm việc</h2><p className="mb-4 text-gray-600">Ca kết thúc trước giờ bắt đầu được tính là ca qua đêm.</p>
        <form key={editingShift?.id ?? 'new-shift'} onSubmit={submitShift} className="grid items-end gap-3 md:grid-cols-4"><Input name="name" label="Tên ca" required maxLength={50} defaultValue={editingShift?.name}/><Input name="startTime" label="Bắt đầu" type="time" required defaultValue={editingShift?.startTime.slice(0, 5)}/><Input name="endTime" label="Kết thúc" type="time" required defaultValue={editingShift?.endTime.slice(0, 5)}/><div className="flex gap-2"><Button type="submit" loading={mutation.isPending}>{editingShift ? 'Lưu ca' : 'Thêm ca'}</Button>{editingShift && <Button variant="outline" onClick={() => setEditingShift(null)}>Hủy</Button>}</div></form>
        {shifts.isPending ? <p className="mt-4">Đang tải ca…</p> : shifts.isError ? <p role="alert" className="mt-4">Không tải được ca. <button className="underline" onClick={() => void shifts.refetch()}>Thử lại</button></p> : !shiftList.length ? <p className="mt-4 text-gray-600">Chưa có ca làm việc.</p> : <ul className="mt-4 divide-y divide-gray-100">{shiftList.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{s.name} <span className="text-caption font-normal text-gray-600">{s.isActive ? 'Đang hoạt động' : 'Đã ngừng'}</span></p><p className="text-gray-600">{s.startTime.slice(0, 5)} – {s.endTime.slice(0, 5)}{s.isOvernight ? ' · Qua đêm' : ''}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setEditingShift(s)}>Sửa</Button><Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate(() => http.patch(`/shifts/${s.id}/active`, { isActive: !s.isActive }, { snake: true }))}>{s.isActive ? 'Ngừng' : 'Kích hoạt'}</Button></div></li>)}</ul>}
      </Card>
      <Card><h2 className="text-h3">{editingSchedule ? 'Sửa lịch làm việc' : 'Phân lịch làm việc'}</h2><p className="mb-4 text-gray-600">Mỗi nhân viên chỉ có một lịch trong một ngày.</p>
        {staff.isError && <p role="alert">Không tải được nhân viên. <button className="underline" onClick={() => void staff.refetch()}>Thử lại</button></p>}
        <form key={editingSchedule?.id ?? 'new-schedule'} onSubmit={submitSchedule} className="grid items-end gap-3 md:grid-cols-4"><label className="font-medium">Nhân viên<select name="staffId" required className={selectClass} defaultValue={editingSchedule?.staffId ?? ''} disabled={!!editingSchedule}><option value="">Chọn nhân viên</option>{staffList.filter((s) => s.status === 'Active' || s.id === editingSchedule?.staffId).map((s) => <option key={s.id} value={s.id}>{staffOption(s)}</option>)}</select>{editingSchedule && <input type="hidden" name="staffId" value={editingSchedule.staffId}/>}</label><label className="font-medium">Ca<select name="shiftId" required className={selectClass} defaultValue={editingSchedule?.shiftId ?? ''}><option value="">Chọn ca</option>{shiftList.filter((s) => s.isActive || s.id === editingSchedule?.shiftId).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)})</option>)}</select></label><Input name="workDate" label="Ngày làm" type="date" required defaultValue={editingSchedule?.workDate ?? from}/><div className="flex gap-2"><Button type="submit" loading={mutation.isPending} disabled={staff.isPending || shifts.isPending}>{editingSchedule ? 'Lưu lịch' : 'Phân lịch'}</Button>{editingSchedule && <Button variant="outline" onClick={() => setEditingSchedule(null)}>Hủy</Button>}</div></form>
      </Card>
      <Card><h2 className="text-h3">Lịch đã phân</h2>{schedules.isPending && from <= to ? <p className="mt-3">Đang tải lịch…</p> : schedules.isError ? <p role="alert" className="mt-3">Không tải được lịch. <button className="underline" onClick={() => void schedules.refetch()}>Thử lại</button></p> : !schedules.data?.length ? <p className="mt-3 text-gray-600">Không có lịch trong khoảng ngày đã chọn.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-body"><thead><tr className="border-b text-gray-600"><th className="p-2">Ngày</th><th className="p-2">Nhân viên</th><th className="p-2">Ca</th><th className="p-2">Trạng thái</th><th className="p-2">Thao tác</th></tr></thead><tbody>{[...schedules.data].sort((a, b) => a.workDate.localeCompare(b.workDate)).map((s) => <tr key={s.id} className="border-b border-gray-100"><td className="p-2">{s.workDate}</td><td className="p-2">{staffList.find((p) => p.id === s.staffId) ? nameOf(staffList.find((p) => p.id === s.staffId)!) : `Nhân viên #${s.staffId}`}</td><td className="p-2">{s.shift?.name ?? shiftList.find((x) => x.id === s.shiftId)?.name ?? `Ca #${s.shiftId}`}</td><td className="p-2"><select aria-label={`Trạng thái lịch ${s.id}`} value={s.status} disabled={mutation.isPending} className={selectClass} onChange={(e) => mutation.mutate(() => http.patch(`/schedules/${s.id}/status`, { status: e.target.value }))}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td className="p-2"><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setEditingSchedule(s)}>Sửa</Button><Button size="sm" variant="outline" disabled={mutation.isPending || s.workDate <= localDate()} onClick={() => { if (window.confirm('Xóa lịch làm việc này?')) mutation.mutate(() => http.delete(`/schedules/${s.id}`)); }}>Xóa</Button></div></td></tr>)}</tbody></table></div>}</Card>
    </>}
  </div>;
}
