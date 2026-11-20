import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { storeApi } from '@/shared/api';
import { useAuthStore } from '@/features/auth/store';
import { Button, Card, Input } from '@/shared/ui';
import type { LeaveType } from '@/shared/types';

const types: { value: LeaveType; label: string }[] = [
  { value: 'Annual', label: 'Phép năm' }, { value: 'Sick', label: 'Nghỉ ốm' }, { value: 'Unpaid', label: 'Nghỉ không lương' }, { value: 'Other', label: 'Khác' },
];

export function StaffLeavePage() {
  const qc = useQueryClient(); const userId = useAuthStore((s) => s.user?.id); const [error, setError] = useState('');
  const requests = useQuery({ queryKey: ['leave-requests', 'me', userId], queryFn: () => storeApi.getMyLeaveRequests() });
  const create = useMutation({ mutationFn: storeApi.createLeaveRequest, onSuccess: () => { toast.success('Đã gửi yêu cầu nghỉ phép'); void qc.invalidateQueries({ queryKey: ['leave-requests'] }); }, onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Không thể gửi yêu cầu') });
  const cancel = useMutation({ mutationFn: storeApi.cancelLeaveRequest, onSuccess: () => { toast.success('Đã rút yêu cầu'); void qc.invalidateQueries({ queryKey: ['leave-requests'] }); } });
  function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); setError(''); create.mutate({ leaveType: String(f.get('leaveType')) as LeaveType, startDate: String(f.get('startDate')), endDate: String(f.get('endDate')), reason: String(f.get('reason')).trim() }); }
  return <div className="mx-auto max-w-3xl space-y-5"><header><h1 className="text-h2">Lịch làm việc &amp; nghỉ phép</h1><p className="text-body text-gray-600">Xem lịch ca, gửi yêu cầu nghỉ và theo dõi phản hồi.</p></header>
    <Card><h2 className="mb-3 text-h3">Lịch ca của tôi</h2>{}<p className="text-body text-gray-600">Lịch và giờ check-in được xem tại <a className="font-medium text-primary-700 underline" href="/staff/checkin">Check-in QR</a>.</p></Card>
    <Card><h2 className="mb-3 text-h3">Gửi yêu cầu nghỉ phép</h2><form onSubmit={submit} className="grid gap-3 sm:grid-cols-2"><label className="text-caption">Loại nghỉ<select name="leaveType" className="mt-1 h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-body">{types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label><Input name="startDate" type="date" label="Từ ngày" required/><Input name="endDate" type="date" label="Đến ngày" required/><label className="text-caption sm:col-span-2">Lý do<textarea name="reason" required maxLength={500} rows={3} className="mt-1 w-full rounded-md border border-gray-300 p-3 text-body"/></label>{error && <p role="alert" className="text-caption text-error-strong sm:col-span-2">{error}</p>}<div className="sm:col-span-2"><Button loading={create.isPending}>Gửi yêu cầu</Button></div></form></Card>
    <Card><h2 className="mb-3 text-h3">Yêu cầu của tôi</h2>{requests.isError ? <p role="alert" className="text-error-strong">Không tải được yêu cầu. <button className="underline" onClick={() => void requests.refetch()}>Thử lại</button></p> : requests.isPending ? <p>Đang tải…</p> : !requests.data?.length ? <p className="text-gray-600">Chưa có yêu cầu.</p> : <ul className="divide-y divide-gray-100">{requests.data.map((r) => <li key={r.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-medium">{r.startDate} – {r.endDate} · {types.find((t) => t.value === r.leaveType)?.label}</p><p className="text-caption text-gray-600">{r.reason} · {r.status === 'Pending' ? 'Đang chờ duyệt' : r.status === 'Approved' ? 'Đã duyệt' : r.status === 'Rejected' ? 'Từ chối' : 'Đã rút'}</p></div>{r.status === 'Pending' && <Button size="sm" variant="outline" onClick={() => cancel.mutate(r.id)}>Rút đơn</Button>}</li>)}</ul>}</Card>
  </div>;
}

export function ManagerLeavePage() {
  const qc = useQueryClient(); const [status, setStatus] = useState('Pending');
  const requests = useQuery({ queryKey: ['leave-requests', 'manager', status], queryFn: () => storeApi.listLeaveRequests({ status: status || undefined }) });
  const decide = useMutation({ mutationFn: ({ id, next }: { id: number; next: 'Approved' | 'Rejected' }) => storeApi.decideLeaveRequest(id, { status: next }), onSuccess: () => { toast.success('Đã cập nhật quyết định'); void qc.invalidateQueries({ queryKey: ['leave-requests'] }); }, onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Không thể duyệt yêu cầu') });
  return <div className="mx-auto max-w-4xl space-y-5"><header><h1 className="text-h2">Duyệt nghỉ phép</h1><p className="text-body text-gray-600">Xem và xử lý yêu cầu của nhân viên.</p></header><div className="flex items-center gap-2"><CalendarDays className="size-5 text-primary-700"/><select aria-label="Lọc trạng thái" value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-3"><option value="Pending">Chờ duyệt</option><option value="Approved">Đã duyệt</option><option value="Rejected">Từ chối</option><option value="">Tất cả</option></select></div><Card>{requests.isError ? <p role="alert">Không tải được yêu cầu. <button className="underline" onClick={() => void requests.refetch()}>Thử lại</button></p> : requests.isPending ? <p>Đang tải…</p> : !requests.data?.length ? <p className="text-gray-600">Không có yêu cầu.</p> : <ul className="divide-y divide-gray-100">{requests.data.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="font-semibold">{r.staff?.userInfo?.fullName ?? r.employeeCode ?? `Nhân viên #${r.staffId}`}</p><p className="text-body">{r.startDate} – {r.endDate} · {types.find((t) => t.value === r.leaveType)?.label}</p><p className="text-caption text-gray-600">{r.reason} · {r.status}</p></div>{r.status === 'Pending' && <div className="flex gap-2"><Button size="sm" leftIcon={<Check className="size-4"/>} onClick={() => decide.mutate({ id: r.id, next: 'Approved' })}>Duyệt</Button><Button size="sm" variant="outline" leftIcon={<X className="size-4"/>} onClick={() => decide.mutate({ id: r.id, next: 'Rejected' })}>Từ chối</Button></div>}</li>)}</ul>}</Card></div>;
}
