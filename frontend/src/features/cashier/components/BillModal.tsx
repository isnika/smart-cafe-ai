import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { isApiError } from '@/shared/api';
import { formatVnd, parseUtc } from '@/shared/lib';
import type { OrderDetail } from '@/shared/types';
import { Badge, Button, Modal } from '@/shared/ui';
import { whereLabel } from '@/features/order-queue/status';
import { COUNTER_PAYMENT_ENABLED } from '../config';
import { useCollectCash } from '../hooks/useCashier';
import { canCollectAtCounter, cashierGroup, changeDue, GROUP_LABEL, PAYMENT_CHANNEL_LABEL, PAYMENT_STATUS_LABEL } from '../model';

const dateTime = (iso: string) => {
  const d = parseUtc(iso);
  return d ? d.toLocaleString('vi-VN', { hour12: false }) : '—';
};

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-body">
      <dt className="text-gray-600">{label}</dt>
      <dd className={strong ? 'font-semibold text-gray-900' : 'text-gray-900'}>{value}</dd>
    </div>
  );
}

/**
 * Xem hóa đơn của một đơn trong danh sách thu ngân. Đóng modal KHÔNG đổi gì ở trạng thái thanh toán;
 * chỉ nút "Xác nhận đã thu" (khi được bật và đơn đủ điều kiện) mới gọi API.
 * `order = null` khi đơn đã rời danh sách (ví dụ đã hoàn tất) trong lúc modal đang mở.
 */
export function BillModal({ order, open, onClose }: { order: OrderDetail | null; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Hóa đơn" size="lg">
      {order ? <BillBody key={order.id} order={order} onDone={onClose} /> : <p role="status" className="text-body text-gray-600">Đơn này không còn trong danh sách thu ngân (có thể đã được xử lý). Danh sách đã được làm mới.</p>}
    </Modal>
  );
}

function BillBody({ order, onDone }: { order: OrderDetail; onDone: () => void }) {
  const group = cashierGroup(order);
  const collectable = canCollectAtCounter(order);
  const [cash, setCash] = useState('');
  const mutation = useCollectCash(order);

  const cashReceived = cash.trim() === '' ? null : Number(cash.replace(/\D/g, ''));
  const change = changeDue(order.finalAmount, cashReceived);
  const canSubmit = COUNTER_PAYMENT_ENABLED && collectable && change !== null;
  const error = mutation.error ? (isApiError(mutation.error) ? mutation.error.message : mutation.error.message || 'Không thu được tiền. Vui lòng thử lại.') : null;
  const customer = order.fulfillmentType === 'Delivery' ? order.deliveryName : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-heading text-h4 text-gray-900">Đơn #{order.orderCode}</p>
          <p className="text-caption text-gray-600">
            {whereLabel(order)}
            {customer ? ` · ${customer}` : ''} · {dateTime(order.createdAt)}
          </p>
        </div>
        {group && <Badge tone={group === 'paid_online' ? 'success' : 'info'}>{GROUP_LABEL[group]}</Badge>}
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-left text-body">
          <caption className="sr-only">Danh sách món</caption>
          <thead className="bg-gray-50 text-caption uppercase text-gray-500">
            <tr>
              <th scope="col" className="px-3 py-2">Món</th>
              <th scope="col" className="px-3 py-2 text-right">SL</th>
              <th scope="col" className="px-3 py-2 text-right">Đơn giá</th>
              <th scope="col" className="px-3 py-2 text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {order.items.map((i) => {
              const detail = [i.variantName !== 'Standard' ? `Size ${i.variantName}` : null, ...i.options.map((o) => o.optionName), i.note].filter(Boolean).join(' · ');
              return (
                <tr key={i.id}>
                  <td className="px-3 py-2">
                    {i.productName}
                    {detail && <span className="block text-caption text-gray-500">{detail}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{i.quantity}</td>
                  <td className="px-3 py-2 text-right">{formatVnd(i.unitPrice + i.optionsUnitTotal)}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatVnd(i.lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dl className="border-t border-gray-100 pt-2">
        <Row label="Tạm tính" value={formatVnd(order.subTotal)} />
        {order.itemDiscountAmount > 0 && <Row label="Giảm giá món" value={`-${formatVnd(order.itemDiscountAmount)}`} />}
        {order.voucherDiscountAmount > 0 && <Row label={order.voucherCode ? `Voucher ${order.voucherCode}` : 'Voucher'} value={`-${formatVnd(order.voucherDiscountAmount)}`} />}
        {order.deliveryFee > 0 && <Row label="Phí giao hàng" value={formatVnd(order.deliveryFee)} />}
        <div className="mt-1 flex items-baseline justify-between border-t border-gray-200 pt-2">
          <dt className="text-h4 text-gray-900">Tổng thanh toán</dt>
          <dd className="text-h3 text-primary-700">{formatVnd(order.finalAmount)}</dd>
        </div>
        <p className="text-right text-caption text-gray-500">Đã gồm VAT {formatVnd(order.vatAmount)}</p>
      </dl>

      <dl className="rounded-md bg-gray-50 p-3">
        <Row label="Phương thức" value={group ? PAYMENT_CHANNEL_LABEL[group] : '—'} />
        <Row label="Trạng thái thanh toán" value={PAYMENT_STATUS_LABEL[order.paymentStatus]} strong />
        {order.note && <Row label="Ghi chú" value={order.note} />}
      </dl>

      {collectable ? (
        <section aria-label="Thu tiền mặt" className="space-y-3 border-t border-gray-100 pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cash-received" className="text-body font-medium text-gray-800">Khách đưa (₫)</label>
              <input
                id="cash-received"
                inputMode="numeric"
                autoComplete="off"
                value={cash}
                disabled={!COUNTER_PAYMENT_ENABLED || mutation.isPending}
                onChange={(e) => setCash(e.target.value.replace(/\D/g, ''))}
                placeholder="Nhập số tiền khách đưa"
                className="h-10 rounded-md border border-gray-300 px-3 text-body disabled:bg-gray-100"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-body font-medium text-gray-800">Tiền trả lại</span>
              <output className="flex h-10 items-center text-body font-semibold text-success-strong">{change === null ? '—' : formatVnd(change)}</output>
            </div>
          </div>

          <p className="flex gap-2 rounded-md bg-gray-50 p-2 text-caption text-gray-600">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary-600" aria-hidden />
            Xác nhận đã thu ghi lại người thao tác, thời gian, phương thức và tổng tiền. Đơn đã trả online không thu lần hai.
          </p>

          {!COUNTER_PAYMENT_ENABLED && (
            <p role="status" className="rounded-md bg-warning-soft p-2 text-caption text-warning-strong">
              Thu tiền tại quầy sẽ khả dụng ở phase 2 (chờ API thanh toán). Hiện chỉ xem hóa đơn; trạng thái thanh toán không bị thay đổi.
            </p>
          )}
          {error && <p role="alert" className="rounded-md bg-error-soft p-2 text-caption text-error-strong">{error}</p>}

          <Button fullWidth size="lg" disabled={!canSubmit} loading={mutation.isPending} onClick={() => mutation.mutate({ cashReceived: cashReceived ?? 0 }, { onSuccess: onDone })}>
            Xác nhận đã thu
          </Button>
        </section>
      ) : (
        <p role="status" className="flex gap-2 rounded-md bg-success-soft p-2 text-caption text-success-strong">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          {group === 'paid_online' ? 'Đơn đã trả online: chỉ xác nhận/in bill, không thu lại.' : 'Đơn này không thuộc diện thu tiền tại quầy.'}
        </p>
      )}
    </div>
  );
}
