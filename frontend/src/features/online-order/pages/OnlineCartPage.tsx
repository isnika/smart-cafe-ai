import { ShoppingBag } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { CartLineCard } from '@/features/dine-in/components/CartLineCard';
import { PageHeader } from '@/features/dine-in/components/PageHeader';
import { StickyActionBar } from '@/features/dine-in/components/StickyActionBar';
import { formatVnd } from '@/shared/lib';
import { Button } from '@/shared/ui';
import { FulfillmentBadge } from '../components/FulfillmentBadge';
import { PriceSummary } from '../components/PriceSummary';
import { VoucherBox } from '../components/VoucherBox';
import { useOnlinePricing } from '../hooks/usePricing';
import { useOnlineCartStore } from '../store';

/** Giỏ hàng Online. Hiển thị khi khách đã chọn Giao hàng / Mang đi (xem CartPage). */
export default function OnlineCartPage() {
  const navigate = useNavigate();
  const pricing = useOnlinePricing();
  const actions = {
    increment: useOnlineCartStore((s) => s.increment),
    decrement: useOnlineCartStore((s) => s.decrement),
    removeLine: useOnlineCartStore((s) => s.removeLine),
  };
  const { fulfillmentType, lines, totals } = pricing;

  return (
    <div className="min-h-screen bg-primary-50">
      <PageHeader title="Giỏ hàng của bạn">{fulfillmentType && <FulfillmentBadge type={fulfillmentType} />}</PageHeader>

      {lines.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
          <ShoppingBag className="size-12 text-primary-300" aria-hidden />
          <h2 className="text-h4">Giỏ hàng đang trống</h2>
          <p className="text-body text-gray-600">Chọn vài món từ thực đơn để bắt đầu đặt hàng.</p>
          <Link
            to={PATHS.menu}
            className="inline-flex h-10 items-center rounded-md bg-primary-600 px-4 text-body font-medium text-white hover:bg-primary-700"
          >
            Xem thực đơn
          </Link>
        </div>
      ) : (
        <div className="space-y-5 px-4 pb-44 pt-4">
          <ul className="space-y-3" aria-label="Món đã chọn">
            {lines.map((l) => (
              <CartLineCard key={l.key} line={l} actions={actions} />
            ))}
          </ul>

          <VoucherBox appliedCode={pricing.appliedCode} message={pricing.voucherMessage} />

          <section aria-labelledby="order-summary">
            <h2 id="order-summary" className="mb-2 text-body-lg font-semibold">
              Tóm tắt đơn hàng
            </h2>
            <PriceSummary totals={totals} showDeliveryFee={fulfillmentType === 'Delivery'} />
            {pricing.feeError && (
              <p role="alert" className="mt-2 text-caption text-error-strong">
                Không tải được phí giao hàng.{' '}
                <button type="button" className="font-medium underline" onClick={() => void pricing.refetchFee()}>
                  Thử lại
                </button>
              </p>
            )}
          </section>

          <StickyActionBar total={formatVnd(totals.total)}>
            <Button
              size="lg"
              disabled={!pricing.ready}
              className="rounded-full bg-accent-500 hover:bg-accent-600 active:bg-accent-700"
              onClick={() => navigate(PATHS.checkout)}
            >
              Tiến hành đặt hàng
            </Button>
          </StickyActionBar>
        </div>
      )}
    </div>
  );
}
