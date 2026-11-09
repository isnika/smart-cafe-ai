import { useState } from 'react';
import type { MyOrderDetail } from '@/shared/api/order-me.types';
import { MAX_CANCEL_REASON_LENGTH } from '@/shared/api/order-me.types';
import { cn } from '@/shared/lib/cn';
import { Button, Modal } from '@/shared/ui';
import { cancelAffordance } from '../cancel';
import { describeCancelError, useCancelOrder, type CancelFailure } from '../hooks/useCancelOrder';

type Notice = { tone: 'success' | 'warning'; message: string };

/**
 * Khối hủy đơn của khách trên trang theo dõi.
 *  - Nút "Hủy đơn": chỉ khi Online + payment_status=Unpaid + trạng thái Excel cho khách hủy (cancel.ts).
 *  - Đơn đã thanh toán (còn hiệu lực): KHÔNG có nút, chỉ hướng dẫn liên hệ quán. Không có refund.
 *  - `version` gửi lên luôn là version của bản đơn đang hiển thị (order.version). Mọi quyết định cuối cùng do API.
 */
export function CancelOrderSection({ order }: { order: MyOrderDetail }) {
  const cancel = useCancelOrder(order.id);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const affordance = cancelAffordance(order);
  const trimmed = reason.trim();
  const reasonError = trimmed === '' ? 'Vui lòng nhập lý do hủy đơn.' : null;

  const close = () => {
    if (cancel.isPending) return;
    setOpen(false);
    setReason('');
    setTouched(false);
    setInlineError(null);
  };

  const submit = () => {
    setTouched(true);
    if (reasonError) return;
    setInlineError(null);
    cancel.mutate(
      { cancelReason: trimmed, version: order.version },
      {
        onSuccess: () => {
          setOpen(false);
          setReason('');
          setTouched(false);
          setNotice({ tone: 'success', message: 'Đã hủy đơn hàng của bạn.' });
        },
        onError: (e) => {
          const failure: CancelFailure = describeCancelError(e);
          if (failure.kind === 'other') {
            setInlineError(failure.message);
            return;
          }
          setOpen(false);
          setReason('');
          setTouched(false);
          setNotice({ tone: 'warning', message: failure.message });
        },
      },
    );
  };

  if (affordance === 'none' && !notice) return null;

  return (
    <>
      {notice && (
        <div
          role={notice.tone === 'warning' ? 'alert' : 'status'}
          aria-label="Kết quả hủy đơn"
          className={cn(
            'rounded-lg border p-4 text-body',
            notice.tone === 'warning' ? 'border-warning bg-warning-soft text-warning-strong' : 'border-primary-100 bg-white text-gray-800',
          )}
        >
          {notice.message}
        </div>
      )}

      {affordance === 'cancel' && (
        <section aria-label="Hủy đơn" className="rounded-lg border border-primary-100 bg-white p-4">
          <p className="mb-3 text-body text-gray-600">Đơn chưa thanh toán nên bạn có thể hủy khi quán chưa xác nhận.</p>
          <Button variant="outline" onClick={() => setOpen(true)}>
            Hủy đơn
          </Button>
        </section>
      )}

      {affordance === 'contact-shop' && (
        <section aria-label="Hủy đơn đã thanh toán" className="rounded-lg border border-primary-100 bg-white p-4 text-body text-gray-700">
          <p className="font-semibold text-gray-900">Cần hủy đơn đã thanh toán?</p>
          <p className="mt-1">Đơn đã thanh toán nên không thể hủy trực tiếp trên ứng dụng. Vui lòng liên hệ quán và cung cấp mã đơn #{order.orderCode} để được hỗ trợ.</p>
        </section>
      )}

      <Modal
        open={open}
        onClose={close}
        title="Hủy đơn hàng"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={close} disabled={cancel.isPending}>
              Giữ đơn
            </Button>
            <Button variant="danger" onClick={submit} loading={cancel.isPending}>
              Xác nhận hủy
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-body text-gray-700">Hủy đơn #{order.orderCode}. Thao tác này không thể hoàn tác.</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cancel-reason" className="text-body font-medium text-gray-800">
              Lý do hủy (bắt buộc)
            </label>
            <textarea
              id="cancel-reason"
              rows={3}
              maxLength={MAX_CANCEL_REASON_LENGTH}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ví dụ: Đặt nhầm món, đổi ý…"
              aria-invalid={(touched && !!reasonError) || undefined}
              aria-describedby={touched && reasonError ? 'cancel-reason-error' : undefined}
              className={cn(
                'w-full rounded-md border bg-white px-3 py-2 text-body text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2',
                touched && reasonError ? 'border-error focus:border-error focus:ring-error-soft' : 'border-gray-300 focus:border-primary-500 focus:ring-primary-200',
              )}
            />
            {touched && reasonError && (
              <p id="cancel-reason-error" className="text-caption text-error-strong">
                {reasonError}
              </p>
            )}
          </div>
          {inlineError && (
            <p role="alert" className="rounded-lg border border-error/30 bg-error-soft p-3 text-body text-error-strong">
              {inlineError}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
