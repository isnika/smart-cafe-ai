import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { parseUtc } from '@/shared/lib';
import type { StaffSessionPatchStatus, StaffTable, StaffTableSession } from '@/shared/api/staff-table.types';
import { Badge, Button, Modal } from '@/shared/ui';
import { SESSION_STATUS_LABEL, SESSION_STATUS_TONE, sessionActions, tableLabelOf } from '../model';

const dateTime = (iso: string | null) => {
  const d = parseUtc(iso);
  return d ? d.toLocaleString('vi-VN', { hour12: false }) : '—';
};

interface Props {
  session: StaffTableSession;
  tables: readonly StaffTable[] | undefined;
  /** true khi đang có một PATCH chạy (mọi nút khóa để không gửi chồng). */
  busy: boolean;
  loading: boolean;
  onAct: (id: number, status: StaffSessionPatchStatus) => void;
}

export function SessionCard({ session, tables, busy, loading, onAct }: Props) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const label = tableLabelOf(session, tables);
  const actions = sessionActions(session.status);

  return (
    <article aria-label={`Phiên #${session.id} ${label}`} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-heading text-h4 text-gray-900">{label}</p>
          <p className="text-caption text-gray-500">
            Phiên #{session.id} · Mở lúc {dateTime(session.openedAt)}
            {session.closedAt ? ` · Đóng lúc ${dateTime(session.closedAt)}` : ''}
          </p>
        </div>
        <Badge tone={SESSION_STATUS_TONE[session.status]}>{SESSION_STATUS_LABEL[session.status]}</Badge>
      </div>

      {actions.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {actions.includes('Cancelled') && (
            <Button variant="outline" size="sm" disabled={busy} leftIcon={<XCircle className="size-4" aria-hidden />} onClick={() => setConfirmCancel(true)}>
              Hủy phiên
            </Button>
          )}
          {actions.includes('Completed') && (
            <Button size="sm" disabled={busy} loading={loading} leftIcon={<CheckCircle2 className="size-4" aria-hidden />} onClick={() => onAct(session.id, 'Completed')}>
              Hoàn tất phiên
            </Button>
          )}
        </div>
      )}

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title={`Hủy phiên ${label}?`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>
              Giữ phiên
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                setConfirmCancel(false);
                onAct(session.id, 'Cancelled');
              }}
            >
              Xác nhận hủy phiên
            </Button>
          </>
        }
      >
        <p className="text-body text-gray-700">Phiên sẽ bị đóng mà không hoàn tất thanh toán và khách không thể gọi thêm món bằng mã QR của phiên này.</p>
      </Modal>
    </article>
  );
}
