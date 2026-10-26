import { useState } from 'react';
import { AlertCircle, MapPin, Store } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { PATHS, to } from '@/app/routes';
import { useAuthStore } from '@/features/auth/store';
import { PageHeader } from '@/features/dine-in/components/PageHeader';
import { StickyActionBar } from '@/features/dine-in/components/StickyActionBar';
import { MAX_NOTE_LENGTH } from '@/features/dine-in/submit';
import { formatVnd } from '@/shared/lib';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui';
import { DeliveryModal } from '../components/DeliveryModal';
import { FulfillmentBadge } from '../components/FulfillmentBadge';
import { PriceSummary } from '../components/PriceSummary';
import { validateDelivery, validateInvoice } from '../delivery';
import { useOnlineCheckout } from '../hooks/useCheckout';
import { useOnlinePricing } from '../hooks/usePricing';
import { PAYMENT_OPTIONS, type PaymentChoice } from '../payment';
import { useOnlineCartStore, type DeliveryDetails } from '../store';

const field = 'w-full rounded-lg border border-primary-100 bg-white px-4 py-3 text-body placeholder:text-gray-400 focus:border-primary-600 focus:outline-none';

/** Xác nhận đơn hàng Online: nhận hàng → thanh toán → hoá đơn → ghi chú → Đặt hàng. */
export default function OnlineCheckoutPage() {
  const navigate = useNavigate();
  const pricing = useOnlinePricing();
  const { fulfillmentType, lines, totals } = pricing;
  const user = useAuthStore((s) => s.user);
  const saved = useOnlineCartStore((s) => s.delivery);
  const setDelivery = useOnlineCartStore((s) => s.setDelivery);
  const { submit, isSubmitting, error } = useOnlineCheckout();

  const [method, setMethod] = useState<PaymentChoice | null>(null);
  const [invoiceOn, setInvoiceOn] = useState(false);
  const [companyInfo, setCompanyInfo] = useState('');
  const [invoiceError, setInvoiceError] = useState<string>();
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [addressError, setAddressError] = useState(false);
  // Đặt xong giỏ bị xoá → giữ trang trống thay vì nháy "giỏ trống" trước khi chuyển trang.
  const [done, setDone] = useState(false);

  const delivery: DeliveryDetails = saved ?? { receiverName: user?.fullName ?? '', phone: user?.phone ?? '', addressLine: '' };
  const deliveryOk = Object.keys(validateDelivery(delivery)).length === 0;
  const isDelivery = fulfillmentType === 'Delivery';

  async function onConfirm() {
    if (!method) return;
    if (isDelivery && !deliveryOk) {
      setAddressError(true);
      setEditing(true);
      return;
    }
    const invoiceMsg = validateInvoice({ enabled: invoiceOn, companyInfo });
    setInvoiceError(invoiceMsg);
    if (invoiceMsg) return;

    const order = await submit({
      method,
      ...(note.trim() ? { note } : {}),
      ...(pricing.appliedCode ? { voucherCode: pricing.appliedCode } : {}),
    });
    if (order) {
      setDone(true);
      navigate(to.paymentSuccess(String(order.id)), { replace: true, state: { paymentMethod: method } });
    }
  }

  if (done) return null;

  if (lines.length === 0 || fulfillmentType === null) {
    return (
      <div className="min-h-screen bg-primary-50">
        <PageHeader title="Xác nhận đơn hàng" back={PATHS.cart} />
        <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
          <h2 className="text-h4">Chưa có món để đặt</h2>
          <p className="text-body text-gray-600">Giỏ hàng đang trống. Hãy chọn món từ thực đơn.</p>
          <Link to={PATHS.menu} className="inline-flex h-10 items-center rounded-md bg-primary-600 px-4 text-body font-medium text-white hover:bg-primary-700">
            Xem thực đơn
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary-50">
      <PageHeader title="Xác nhận đơn hàng" back>
        <FulfillmentBadge type={fulfillmentType} />
      </PageHeader>

      <div className="space-y-5 px-4 pb-44 pt-4">
        <section aria-labelledby="receive-title">
          <h2 id="receive-title" className="mb-2 text-body-lg font-semibold">
            {isDelivery ? 'Địa chỉ giao hàng' : 'Nhận tại quán'}
          </h2>
          {isDelivery ? (
            <div className={cn('flex items-start gap-3 rounded-lg border bg-white p-4', addressError && !deliveryOk ? 'border-error' : 'border-primary-100')}>
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-50 text-primary-600">
                <MapPin className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 text-body">
                {deliveryOk ? (
                  <>
                    <p className="font-semibold text-gray-900">{delivery.receiverName}</p>
                    <p className="text-gray-600">{delivery.phone}</p>
                    <p className="text-gray-600">{delivery.addressLine}</p>
                  </>
                ) : (
                  <p className="text-gray-600">Bạn chưa nhập địa chỉ giao hàng.</p>
                )}
                {addressError && !deliveryOk && <p role="alert" className="mt-1 text-caption text-error-strong">Vui lòng nhập đủ thông tin giao hàng.</p>}
              </div>
              <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-body font-medium text-primary-600 hover:underline">
                {deliveryOk ? 'Thay đổi' : 'Thêm'}
              </button>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-primary-100 bg-white p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-50 text-primary-600">
                <Store className="size-5" aria-hidden />
              </span>
              <p className="text-body text-gray-600">Bạn sẽ nhận món tại quầy khi đơn sẵn sàng.</p>
            </div>
          )}
        </section>

        <fieldset>
          <legend className="mb-2 text-body-lg font-semibold">Phương thức thanh toán</legend>
          <div role="radiogroup" aria-label="Phương thức thanh toán" className="space-y-3">
            {PAYMENT_OPTIONS.map(({ id, label, icon: Icon }) => {
              const selected = method === id;
              return (
                <label
                  key={id}
                  className={cn(
                    'flex cursor-pointer items-center justify-between rounded-lg border bg-white px-4 py-3.5',
                    selected ? 'border-primary-600 ring-1 ring-primary-600' : 'border-primary-100',
                  )}
                >
                  <span className="flex items-center gap-3 font-medium text-gray-900">
                    <Icon className="size-5 text-primary-600" aria-hidden />
                    {label}
                  </span>
                  <input type="radio" name="payment" value={id} checked={selected} onChange={() => setMethod(id)} className="size-5 accent-primary-600" />
                </label>
              );
            })}
          </div>
          {!method && <p className="mt-2 text-caption text-gray-600">Chọn một phương thức để đặt hàng.</p>}
        </fieldset>

        <section aria-labelledby="invoice-title" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 id="invoice-title" className="text-body-lg font-semibold">
              Xuất hóa đơn điện tử
            </h2>
            <button
              type="button"
              role="switch"
              aria-checked={invoiceOn}
              aria-labelledby="invoice-title"
              onClick={() => setInvoiceOn((v) => !v)}
              className={cn('relative h-7 w-12 rounded-full transition-colors', invoiceOn ? 'bg-primary-600' : 'bg-gray-300')}
            >
              <span className={cn('absolute top-0.5 size-6 rounded-full bg-white shadow transition-all', invoiceOn ? 'left-[22px]' : 'left-0.5')} />
            </button>
          </div>
          {invoiceOn && (
            <div className="rounded-lg border border-primary-100 bg-white p-3">
              <label htmlFor="invoice-info" className="mb-1 block text-caption text-gray-500">
                Mã số thuế &amp; Thông tin công ty
              </label>
              <input
                id="invoice-info"
                value={companyInfo}
                onChange={(e) => setCompanyInfo(e.target.value)}
                aria-invalid={!!invoiceError || undefined}
                className="h-10 w-full rounded-md bg-primary-50 px-3 text-body focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
              {invoiceError && <p role="alert" className="mt-1 text-caption text-error-strong">{invoiceError}</p>}
            </div>
          )}
        </section>

        <div>
          <label htmlFor="order-note" className="mb-2 block text-body-lg font-semibold">
            Ghi chú đơn hàng
          </label>
          <textarea
            id="order-note"
            value={note}
            maxLength={MAX_NOTE_LENGTH}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ví dụ: Giao giờ hành chính, ít ngọt, nhiều đá…"
            rows={3}
            className={cn(field, 'resize-none')}
          />
        </div>

        <PriceSummary totals={totals} showDeliveryFee={isDelivery} />

        {error && (
          <div role="alert" className="flex gap-2 rounded-lg border border-error/30 bg-error-soft p-3 text-body text-error-strong">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">Chưa thể đặt hàng</p>
              <p>{error.message}</p>
              {error.retryable ? (
                <p className="mt-1">Giỏ hàng vẫn được giữ nguyên, bạn có thể bấm đặt hàng lại.</p>
              ) : (
                <p className="mt-1">
                  <Link to={PATHS.cart} className="font-medium underline">
                    Kiểm tra lại giỏ hàng
                  </Link>
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <StickyActionBar total={formatVnd(totals.total)} label="Tổng cộng">
        <Button
          size="lg"
          loading={isSubmitting}
          disabled={!method || !pricing.ready}
          className="rounded-full bg-accent-500 hover:bg-accent-600 active:bg-accent-700"
          onClick={() => void onConfirm()}
        >
          {isSubmitting ? 'Đang đặt hàng…' : error?.retryable ? 'Thử lại' : 'Đặt hàng'}
        </Button>
      </StickyActionBar>

      <DeliveryModal
        open={editing}
        initial={delivery}
        onClose={() => setEditing(false)}
        onSave={(d) => {
          setDelivery(d);
          setAddressError(false);
          setEditing(false);
        }}
      />
    </div>
  );
}
