import { Bike, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { PATHS, to } from '@/app/routes';
import { PageHeader } from '@/features/dine-in/components/PageHeader';
import { StickyActionBar } from '@/features/dine-in/components/StickyActionBar';
import { formatVnd } from '@/shared/lib';
import { Button } from '@/shared/ui';
import { PriceSummary } from '../components/PriceSummary';
import { useOnlinePricing } from '../hooks/usePricing';
import { useOnlineCartStore } from '../store';
import { describeLine, lineTotal, type DineInCartLine } from '@/features/dine-in/cart';
import { useAuthStore } from '@/features/auth/store';
import { loadOnlineCartSession } from '../cart-session';

/** Giỏ đặt hàng trực tuyến; khách chọn cách nhận món sau khi duyệt giỏ. */
export default function OnlineCartPage() {
  const navigate = useNavigate();
  const pricing = useOnlinePricing();
  const removeLine = useOnlineCartStore((s) => s.removeLine);
  const { fulfillmentType, lines, totals } = pricing;
  const setFulfillment = useOnlineCartStore((s) => s.setFulfillment);
  const syncStatus = useOnlineCartStore((s) => s.syncStatus);
  const userId = useAuthStore((s) => s.user?.id);

  return (
    <div className="min-h-screen bg-primary-50">
      <PageHeader title="Giỏ hàng của bạn" />
      {syncStatus === 'loading' && <p role="status" className="px-4 py-3">Đang tải giỏ hàng của bạn…</p>}
      {syncStatus === 'error' && <p role="alert" className="px-4 py-3 text-error-strong">Không thể hợp nhất giỏ hàng.{' '}
        <button type="button" className="underline" onClick={() => { if (userId) void loadOnlineCartSession(userId); }}>Thử lại</button>
      </p>}

      {lines.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
          <ShoppingBag className="size-12 text-primary-600" aria-hidden />
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
            {groupOnlineLines(lines).map((group) => (
              <li key={group.productId} className="rounded-lg border border-primary-100 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-body-lg font-semibold text-gray-900">{group.productName}</h3>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-primary-50 px-2.5 py-1 text-body font-semibold text-primary-700" aria-label={`Tổng số lượng ${group.totalQuantity}`}>
                      ×{group.totalQuantity}
                    </span>
                    <button type="button" onClick={() => navigate(to.product(String(group.productId)))} aria-label={`Thêm ${group.productName}`} className="rounded-full bg-primary-600 p-1.5 text-white hover:bg-primary-700">
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
                <ul className="space-y-2">
                  {group.lines.map((line) => (
                    <li key={line.key} className="flex items-start justify-between gap-3 border-t border-gray-100 pt-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-caption text-gray-600">{describeLine(line) || 'Mặc định'}</p>
                        <span className="inline-flex mt-1 rounded-full bg-gray-100 px-2 py-0.5 text-caption font-medium text-gray-700" aria-label={`Số lượng option ${line.quantity}`}>Số lượng: {line.quantity}</span>
                        {line.note && <p className="text-caption italic text-gray-500">“{line.note}”</p>}
                        <p className="mt-1 text-caption font-semibold text-primary-600">{formatVnd(lineTotal(line) / line.quantity)} / món</p>
                      </div>
                      <button type="button" onClick={() => removeLine(line.key)} aria-label={`Xoá lựa chọn ${group.productName}: ${describeLine(line) || 'Mặc định'}`} className="rounded-sm p-1 text-gray-500 hover:bg-gray-100 hover:text-error">
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          <section aria-label="Chọn cách nhận món" className="space-y-3 rounded-xl border border-primary-100 bg-white p-4">
            <h2 className="text-body-lg font-semibold">Bạn muốn nhận món như thế nào?</h2>
            <button
              type="button"
              aria-pressed={fulfillmentType === 'Delivery'}
              onClick={() => setFulfillment('Delivery')}
              className={`flex w-full items-center gap-3 rounded-lg border p-4 text-left hover:bg-primary-50 ${fulfillmentType === 'Delivery' ? 'border-primary-600 bg-primary-50 ring-1 ring-primary-600' : 'border-primary-200'}`}
            >
              <Bike className="size-5 text-primary-600" aria-hidden />
              <span>
                <strong className="block">Giao hàng trực tuyến</strong>
                <span className="text-caption text-gray-600">Giao món đến địa chỉ của bạn</span>
              </span>
            </button>
            <button
              type="button"
              aria-pressed={fulfillmentType === 'Pickup'}
              onClick={() => setFulfillment('Pickup')}
              className={`flex w-full items-center gap-3 rounded-lg border p-4 text-left hover:bg-primary-50 ${fulfillmentType === 'Pickup' ? 'border-primary-600 bg-primary-50 ring-1 ring-primary-600' : 'border-primary-200'}`}
            >
              <ShoppingBag className="size-5 text-primary-600" aria-hidden />
              <span>
                <strong className="block">Đặt hàng mang đi</strong>
                <span className="text-caption text-gray-600">Đến quán nhận món</span>
              </span>
            </button>
          </section>

          <section aria-labelledby="order-summary">
            <h2 id="order-summary" className="mb-2 text-body-lg font-semibold">
              Tóm tắt đơn hàng
            </h2>
            <PriceSummary totals={totals} showDeliveryFee={fulfillmentType === 'Delivery'} />
            {(pricing.branchBlock ?? pricing.cartError) && (
              <p role="alert" className="mt-2 text-caption text-error-strong">
                {pricing.branchBlock ?? pricing.cartError}
              </p>
            )}
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
              disabled={!fulfillmentType || !pricing.ready}
              className="rounded-full bg-accent-500 !text-white hover:bg-accent-600 active:bg-accent-700"
              onClick={() => navigate(PATHS.checkout)}
            >
              {fulfillmentType ? 'Tiến hành đặt hàng' : 'Chọn cách nhận món'}
            </Button>
          </StickyActionBar>
        </div>
      )}
    </div>
  );
}

function groupOnlineLines(lines: DineInCartLine[]) {
  const groups = new Map<number, { productId: number; productName: string; totalQuantity: number; lines: DineInCartLine[] }>();
  for (const line of lines) {
    const group = groups.get(line.productId) ?? { productId: line.productId, productName: line.productName, totalQuantity: 0, lines: [] };
    group.lines.push(line);
    group.totalQuantity += line.quantity;
    groups.set(line.productId, group);
  }
  return [...groups.values()];
}
