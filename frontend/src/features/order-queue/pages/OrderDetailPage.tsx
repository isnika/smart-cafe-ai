import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, Banknote } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PATHS } from '@/app/routes';
import { isApiError, paymentApi } from '@/shared/api';
import { formatVnd } from '@/shared/lib';
import type { OrderDetail } from '@/shared/types';
import { Badge, Button, Modal, Skeleton } from '@/shared/ui';
import { newKey } from '@/features/online-order/payment';
import { useCurrentCashierShift } from '@/features/cashier/hooks/useCashier';
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
  return <OrderDetailView order={query.data} refetchOrder={() => void query.refetch()} />;
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

function OrderDetailView({ order, refetchOrder }: { order: OrderDetail; refetchOrder: () => void }) {
  const qc = useQueryClient();
  const mutation = useChangeOrderStatus(order.id);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [codModalOpen, setCodModalOpen] = useState(false);

  // Lấy ca thu ngân hiện tại để xác nhận COD
  const shiftQuery = useCurrentCashierShift();
  const isShiftOpen = shiftQuery.isSuccess && shiftQuery.data?.status === 'Open';

  const next = nextAdvanceStatus(order);
  const label = advanceLabel(order);
  const cancelTo = cancelTarget(order);
  const error = mutation.error ? (isApiError(mutation.error) ? mutation.error.message : 'Không cập nhật được đơn.') : null;

  const isCompleteAction = next === 'Completed';
  const isPaymentPending = isCompleteAction && order.paymentStatus !== 'Paid';

  const collectCodMutation = useMutation({
    mutationFn: async () => {
      // Kiểm tra ca trước khi gọi API
      if (!shiftQuery.data || shiftQuery.data.status !== 'Open') {
        throw new Error('Vui lòng mở ca thu ngân trước khi xác nhận COD.');
      }
      const key = newKey();
      const created = await paymentApi.createPayment(
        {
          branchId: order.branchId,
          paymentMethod: 'COD',
          allocations: [{ orderId: order.id, allocatedAmount: order.finalAmount }],
        },
        { idempotencyKey: key },
      );
      // Dùng id ca thực tế, không fallback về 0
      const confirmed = await paymentApi.confirmCashPayment(created.payment.id, {
        cashierShiftId: shiftQuery.data.id,
        cashReceived: order.finalAmount,
      });
      return confirmed;
    },
    onSuccess: () => {
      toast.success(`Đã xác nhận thu ${formatVnd(order.finalAmount)} tiền mặt (COD) thành công!`);
      setCodModalOpen(false);
      refetchOrder();
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['staff', 'orders'] });
    },
    onError: (err: unknown) => {
      if (err instanceof Error) {
        toast.error(err.message);
      } else if (isApiError(err)) {
        toast.error(err.message);
      } else {
        toast.error('Không thể ghi nhận thanh toán COD.');
      }
    },
  });

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
            <h2 className="text-h3">{whereLabel(order)} · Tài chính &amp; kiểm soát</h2>
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

          <div className="mt-5 space-y-2.5 border-t border-gray-100 pt-4">
            {isPaymentPending && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-caption text-amber-900">
                <div className="flex items-center gap-1.5 font-semibold text-amber-800">
                  <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
                  Đơn hàng chưa thanh toán
                </div>
                <p className="mt-1 text-gray-700">
                  Cần xác nhận shipper/nhân viên đã thu tiền trước khi hoàn tất giao hàng.
                </p>
                {!isShiftOpen && (
                  <p className="mt-1 text-xs text-amber-700 italic">
                    ⚠ Chưa có ca thu ngân đang mở. Vui lòng mở ca trước.
                  </p>
                )}
                <Button
                  fullWidth
                  className="mt-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                  leftIcon={<Banknote className="size-4" />}
                  disabled={!isShiftOpen}
                  onClick={() => {
                    if (!isShiftOpen) {
                      toast.error('Vui lòng mở ca thu ngân trước khi xác nhận COD.');
                      return;
                    }
                    setCodModalOpen(true);
                  }}
                >
                  Xác nhận đã thu tiền (COD)
                </Button>
              </div>
            )}

            {next && label && (
              <Button
                fullWidth
                size="lg"
                disabled={isPaymentPending}
                loading={mutation.isPending}
                title={isPaymentPending ? 'Cần xác nhận thu tiền trước khi hoàn tất giao hàng' : undefined}
                onClick={() => mutation.mutate({ to: next, version: order.version })}
              >
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
        open={codModalOpen}
        onClose={() => setCodModalOpen(false)}
        title="Xác nhận thu tiền khi giao hàng (COD)"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCodModalOpen(false)}>
              Quay lại
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              loading={collectCodMutation.isPending}
              onClick={() => collectCodMutation.mutate()}
            >
              Xác nhận đã thu đủ {formatVnd(order.finalAmount)}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-body">
          <p className="text-gray-700">
            Xác nhận khách hàng đã nhận đủ món và shipper đã thu tiền mặt thành công cho đơn hàng:
          </p>
          <div className="rounded-lg bg-gray-50 p-3 space-y-1.5 border border-gray-100 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Mã đơn:</span>
              <span className="font-semibold text-gray-800">#{order.orderCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Hình thức:</span>
              <span className="font-medium text-gray-800">Giao hàng (COD)</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1.5 font-bold">
              <span className="text-gray-800">Số tiền cần thu:</span>
              <span className="text-emerald-700 text-base">{formatVnd(order.finalAmount)}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Hệ thống sẽ cập nhật trạng thái sang <strong>Đã thanh toán</strong> và cho phép bạn bấm &quot;Xác nhận đã giao&quot;.
          </p>
        </div>
      </Modal>

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
