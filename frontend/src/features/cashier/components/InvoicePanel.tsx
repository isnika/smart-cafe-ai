import { ArrowLeft, FileText, RefreshCw } from 'lucide-react';
import { isApiError } from '@/shared/api';
import { formatVnd, parseUtc } from '@/shared/lib';
import { Badge, Button, Skeleton } from '@/shared/ui';
import { useOrderInvoice } from '../hooks/useCashier';
import { PAYMENT_METHOD_LABEL } from '../model';

const dateTime = (iso: string) => {
  const d = parseUtc(iso);
  return d ? d.toLocaleString('vi-VN', { hour12: false }) : '—';
};

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-body">
      <dt className="text-gray-600">{label}</dt>
      <dd className={strong ? 'text-right font-semibold text-gray-900' : 'text-right text-gray-900'}>{value}</dd>
    </div>
  );
}

/** Hóa đơn điện tử mock của một đơn đã thanh toán. Chỉ đọc dữ liệu: đóng/mở không gửi lại yêu cầu thanh toán. */
export function InvoicePanel({ orderId, onBack }: { orderId: number; onBack: () => void }) {
  const q = useOrderInvoice(orderId);
  const inv = q.data;

  return (
    <section aria-label="Hóa đơn điện tử" className="space-y-4">
      <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="size-4" aria-hidden />} onClick={onBack}>
        Quay lại
      </Button>

      {q.isPending && (
        <div className="space-y-3" aria-busy aria-label="Đang tải hóa đơn">
          <Skeleton className="h-10" />
          <Skeleton className="h-32" />
        </div>
      )}

      {q.isError && (
        <div role="alert" className="rounded-lg border border-error/30 bg-error-soft p-4 text-error-strong">
          <p className="font-medium">Không mở được hóa đơn</p>
          <p className="text-body">{isApiError(q.error) ? q.error.message : 'Vui lòng thử lại.'}</p>
          <Button className="mt-3" variant="outline" size="sm" leftIcon={<RefreshCw className="size-4" aria-hidden />} onClick={() => void q.refetch()}>
            Thử lại
          </Button>
        </div>
      )}

      {inv && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-2 font-heading text-h4 text-gray-900">
                <FileText className="size-5 text-primary-600" aria-hidden />
                Hóa đơn {inv.invoiceNumber}
              </p>
              <p className="text-caption text-gray-600">
                Ký hiệu {inv.symbol} · Mẫu {inv.templateCode} · Mã tra cứu {inv.lookupCode}
              </p>
            </div>
            <Badge tone="success">{inv.status === 'Issued' ? 'Đã phát hành' : inv.status}</Badge>
          </div>

          <dl className="rounded-md bg-gray-50 p-3">
            <Row label="Đơn" value={inv.orders.map((o) => `#${o.orderCode}`).join(', ')} />
            <Row label="Giao dịch" value={`#${inv.paymentId}`} />
            <Row label="Thanh toán lúc" value={dateTime(inv.paidAt)} />
            <Row label="Phương thức" value={PAYMENT_METHOD_LABEL[inv.paymentMethod]} />
            <Row label="Trạng thái thanh toán" value={inv.paymentStatus === 'Success' ? 'Thành công' : inv.paymentStatus} strong />
            <Row label="Người mua" value={inv.buyerName} />
            {inv.email && <Row label="Email" value={inv.email} />}
            {inv.buyerTaxCode && <Row label="Mã số thuế" value={inv.buyerTaxCode} />}
            {inv.buyerAddress && <Row label="Địa chỉ" value={inv.buyerAddress} />}
          </dl>

          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full text-left text-body">
              <caption className="sr-only">Chi tiết hóa đơn</caption>
              <thead className="bg-gray-50 text-caption uppercase text-gray-500">
                <tr>
                  <th scope="col" className="px-3 py-2">Món</th>
                  <th scope="col" className="px-3 py-2 text-right">SL</th>
                  <th scope="col" className="px-3 py-2 text-right">Đơn giá</th>
                  <th scope="col" className="px-3 py-2 text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {inv.items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-3 py-2">{i.description}</td>
                    <td className="px-3 py-2 text-right">{i.quantity}</td>
                    <td className="px-3 py-2 text-right">{formatVnd(i.unitPrice)}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatVnd(i.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="border-t border-gray-100 pt-2">
            <Row label="Tạm tính" value={formatVnd(inv.grossAmount)} />
            {inv.discountAmount > 0 && <Row label="Giảm giá" value={`-${formatVnd(inv.discountAmount)}`} />}
            {inv.deliveryFee > 0 && <Row label="Phí giao hàng" value={formatVnd(inv.deliveryFee)} />}
            <div className="mt-1 flex items-baseline justify-between border-t border-gray-200 pt-2">
              <dt className="text-h4 text-gray-900">Tổng thanh toán</dt>
              <dd className="text-h3 text-primary-700">{formatVnd(inv.totalAmount)}</dd>
            </div>
            <p className="text-right text-caption text-gray-500">
              Trước VAT {formatVnd(inv.subtotalAmount)} · VAT {inv.vatRate}% {formatVnd(inv.vatAmount)}
            </p>
          </dl>

          <p className="text-caption text-gray-500">Hóa đơn điện tử mock phục vụ demo, không có giá trị pháp lý.</p>
        </div>
      )}
    </section>
  );
}
