import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { storeApi } from '@/shared/api';
import { Button, Card } from '@/shared/ui';
import type { LeaveType } from '@/shared/types';

export { StaffLeavePage } from './StaffLeavePage';

const types: { value: LeaveType; label: string }[] = [
  { value: 'Annual', label: 'Phép năm' }, { value: 'Sick', label: 'Nghỉ ốm' }, { value: 'Unpaid', label: 'Nghỉ không lương' }, { value: 'Other', label: 'Khác' },
];

export function ManagerLeavePage() {
  const qc = useQueryClient(); const [status, setStatus] = useState('Pending');
  const requests = useQuery({ queryKey: ['leave-requests', 'manager', status], queryFn: () => storeApi.listLeaveRequests({ status: status || undefined }) });
  const decide = useMutation({ mutationFn: ({ id, next }: { id: number; next: 'Approved' | 'Rejected' }) => storeApi.decideLeaveRequest(id, { status: next }), onSuccess: () => { toast.success('Đã cập nhật quyết định'); void qc.invalidateQueries({ queryKey: ['leave-requests'] }); }, onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Không thể duyệt yêu cầu') });
  return <div className="mx-auto max-w-4xl space-y-5"><header><h1 className="text-h2">Duyệt nghỉ phép</h1><p className="text-body text-gray-600">Xem và xử lý yêu cầu của nhân viên.</p></header><div className="flex items-center gap-2"><CalendarDays className="size-5 text-primary-700"/><select aria-label="Lọc trạng thái" value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-3"><option value="Pending">Chờ duyệt</option><option value="Approved">Đã duyệt</option><option value="Rejected">Từ chối</option><option value="">Tất cả</option></select></div><Card>{requests.isError ? <p role="alert">Không tải được yêu cầu. <button className="underline" onClick={() => void requests.refetch()}>Thử lại</button></p> : requests.isPending ? <p>Đang tải…</p> : !requests.data?.length ? <p className="text-gray-600">Không có yêu cầu.</p> : <ul className="divide-y divide-gray-100">{requests.data.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="font-semibold">{r.staff?.userInfo?.fullName ?? r.employeeCode ?? `Nhân viên #${r.staffId}`}</p><p className="text-body">{r.startDate} – {r.endDate} · {types.find((t) => t.value === r.leaveType)?.label}</p><p className="text-caption text-gray-600">{r.reason} · {r.status}</p></div>{r.status === 'Pending' && <div className="flex gap-2"><Button size="sm" leftIcon={<Check className="size-4"/>} onClick={() => decide.mutate({ id: r.id, next: 'Approved' })}>Duyệt</Button><Button size="sm" variant="outline" leftIcon={<X className="size-4"/>} onClick={() => decide.mutate({ id: r.id, next: 'Rejected' })}>Từ chối</Button></div>}</li>)}</ul>}</Card></div>;
}
