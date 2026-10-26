import { formatVnd } from '@/shared/lib';
import type { OrderTotals } from '../pricing';

/** Tóm tắt tiền dùng chung giỏ hàng / checkout. Dòng phí & khuyến mãi chỉ hiện khi có. */
export function PriceSummary({ totals, showDeliveryFee }: { totals: OrderTotals; showDeliveryFee: boolean }) {
  return (
    <dl className="space-y-2 rounded-lg border border-primary-100 bg-white p-4">
      <div className="flex justify-between text-body text-gray-600">
        <dt>Tạm tính</dt>
        <dd className="font-medium text-gray-900">{formatVnd(totals.subTotal)}</dd>
      </div>
      {showDeliveryFee && (
        <div className="flex justify-between text-body text-gray-600">
          <dt>Phí giao hàng</dt>
          <dd className="font-medium text-gray-900">{formatVnd(totals.deliveryFee)}</dd>
        </div>
      )}
      {totals.discount > 0 && (
        <div className="flex justify-between text-body text-gray-600">
          <dt>Khuyến mãi</dt>
          <dd className="font-medium text-success-strong">-{formatVnd(totals.discount)}</dd>
        </div>
      )}
      <div className="flex justify-between border-t border-gray-100 pt-3 text-body-lg font-semibold">
        <dt>Tổng cộng</dt>
        <dd className="text-primary-600">{formatVnd(totals.total)}</dd>
      </div>
    </dl>
  );
}
