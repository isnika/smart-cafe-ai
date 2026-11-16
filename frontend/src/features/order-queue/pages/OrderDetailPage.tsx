import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { PATHS } from '@/app/routes';
import { isApiError } from '@/shared/api';
import { formatVnd } from '@/shared/lib';
import type { OrderDetail } from '@/shared/types';
import { Badge, Button, Modal, Skeleton } from '@/shared/ui';
import { useChangeOrderStatus, useOrder } from '../hooks/useOrders';
import { advanceLabel, cancelTarget, nextAdvanceStatus, STATUS_LABEL, timeLabel, whereLabel } from '../status';

const PAYMENT_LABEL = { Unpaid: 'Chưa thanh toán', Paid: 'Đã thanh toán', Partially_Refunded: 'Hoàn tiền một phần', Refunded: 'Đã hoàn tiền' } as const;

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const id = Number(orderId);
  const valid = Number.isInteger(id) && id > 0;
  const query = useOrder(valid ? id : 0);

  if (!valid) return <NotFound />;
  if (query.isPending) return <Skeleton className="h-96" />;
  if (query.isError) {
    return isApiError(query.error) && query.error.status === 404 ? (
      <NotFound />
    ) : (
      <div role="alert" className="rounded-lg border border-error/30 bg-error-soft p-4 text-error-strong">
        <p className="font-medium">Không tải được đơn hàng</p>
        <Button className="mt-3" variant="outline" size="sm" onClick={() => void query.refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }
  return <OrderDetailView order={query.data} />;
}

function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-h3">Không tìm thấy đơn hàng</h1>
      <Link to={PATHS.staffQueue} className="mt-2 inline-block text-primary-600 underline">
        Về hàng đợi
      </Link>
    </div>
  );
}

function OrderDetailView({ order }: { order: OrderDetail }) {
  const mutation = useChangeOrderStatus(order.id);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const next = nextAdvanceStatus(order);
  const label = advanceLabel(order);
  const cancelTo = cancelTarget(order);
  const error = mutation.error ? (isApiError(mutation.error) ? mutation.error.message : 'Không cập nhật được đơn.') : null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-caption text-gray-500">
          <Link to={PATHS.staffQueue} className="underline">
            Nhân viên
          </Link>{' '}
          / Đơn hàng #{order.orderCode}
        </p>
        <h1 className="text-h2 text-gray-900">Chi tiết đơn hàng</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <section aria-label="Tài chính" className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-h3">{whereLabel(order)} · Tài chính & kiểm soát</h2>
            <div className="mt-3 rounded-md border border-accent-200 bg-accent-50 p-4">
              <p className="font-semibold text-accent-700">
                {formatVnd(order.finalAmount)} · {PAYMENT_LABEL[order.paymentStatus]}
              </p>
              <p className="mt-1 text-caption text-gray-600">
                Đơn #{order.orderCode} · {whereLabel(order)}. Thanh toán độc lập với trạng thái chế biến.
              </p>
            </div>
          </section>

          <section aria-label="Nhật ký trạng thái" className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-h4">Nhật ký trạng thái</h2>
            <ol className="mt-3 space-y-2 text-body">
              {order.statusHistory.map((h) => (
                <li key={h.id} className="flex justify-between gap-3 border-b border-gray-100 pb-2 last:border-0">
                  <span>
                    {STATUS_LABEL[h.status]}
                    {h.note && <span className="block text-caption text-gray-500">{h.note}</span>}
                  </span>
                  <span className="text-gray-500">{timeLabel(h.createdAt)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside aria-label="Đơn hàng" className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-h3">Đơn #{order.orderCode}</h2>
              <p className="text-body text-gray-600">{whereLabel(order)}</p>
            </div>
            <Badge tone="warning">{STATUS_LABEL[order.status]}</Badge>
          </div>

          <h3 className="mb-2 mt-5 border-t border-gray-100 pt-4 text-caption font-semibold uppercase text-gray-500">Danh sách món đã đặt</h3>
          <ul className="space-y-3">
            {order.items.map((i) => (
              <li key={i.id}>
                <div className="flex justify-between gap-2 font-medium">
                  <span>
                    {i.quantity}x {i.productName}
                  </span>
                  <span>{formatVnd(i.lineTotal)}</span>
                </div>
                <p className="text-caption text-gray-500">
                  {[i.variantName !== 'Standard' ? `Size: ${i.variantName}` : null, ...i.options.map((o) => o.optionName), i.note].filter(Boolean).join(' • ')}
                </p>
              </li>
            ))}
          </ul>
          {order.note && (
            <p className="mt-3 flex gap-2 rounded-md border border-warning/40 bg-warning-soft p-2 text-caption text-warning-strong">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> Ghi chú: {order.note}
            </p>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-md bg-error-soft p-2 text-caption text-error-strong">
              {error}
            </p>
          )}

          <div className="mt-5 space-y-2 border-t border-gray-100 pt-4">
            {next && label && (
              <Button fullWidth size="lg" loading={mutation.isPending} onClick={() => mutation.mutate({ to: next, version: order.version })}>
                {label}
              </Button>
            )}
            {cancelTo && (
              <Button fullWidth variant="outline" onClick={() => setCancelOpen(true)}>
                Gửi yêu cầu hủy đơn
              </Button>
            )}
            {!next && !cancelTo && <p className="text-center text-caption text-gray-500">Đơn đã kết thúc — không còn thao tác.</p>}
          </div>
        </aside>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Huỷ đơn hàng"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Giữ đơn
            </Button>
            <Button
              variant="danger"
              disabled={!reason.trim()}
              loading={mutation.isPending}
              onClick={() => cancelTo && mutation.mutate({ to: cancelTo, version: order.version, note: reason.trim() }, { onSuccess: () => setCancelOpen(false) })}
            >
              Xác nhận huỷ
            </Button>
          </>
        }
      >
        {order.status === 'Preparing' && <p className="mb-3 rounded-md bg-warning-soft p-2 text-caption text-warning-strong">Đơn đang pha chế: nguyên liệu đã dùng không được hoàn lại kho.</p>}
        <label htmlFor="cancel-reason" className="mb-1 block text-body font-medium">
          Lý do (bắt buộc)
        </label>
        <textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full rounded-md border border-gray-300 p-2" />
      </Modal>
    </div>
  );
}
