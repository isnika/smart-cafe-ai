import { useId, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { ProductOptionsModal } from '@/features/dine-in/components/ProductOptionsModal';
import { useOnlineCartStore } from '@/features/online-order/store';
import type { MenuProduct } from '@/shared/types';
import { Badge, Button, Skeleton } from '@/shared/ui';
import { trackClick, useRecommendations } from '../hooks/useRecommendations';
import { RecommendationCard } from './RecommendationCard';

interface Props {
  /**
   * home  : khối chính của trang → rỗng hiện "AI đang học dữ liệu", lỗi hiện thông báo nhẹ + Thử lại.
   * detail: khối phụ cạnh thanh thêm giỏ → rỗng/lỗi thì ẩn hẳn để không làm rối việc chọn món.
   */
  variant: 'home' | 'detail';
  /** Món đang xem (ProductDetail), được loại khỏi danh sách. */
  excludeProductId?: number;
}

/** "Gợi ý cho bạn": hàng thẻ món AI gợi ý, cuộn ngang. Khách vãng lai không thấy khối này (không có gợi ý để hiển thị). */
export function RecommendationSection({ variant, excludeProductId }: Props) {
  const titleId = useId();
  const { state, items, refetch } = useRecommendations({ excludeProductId });
  const fulfillment = useOnlineCartStore((s) => s.fulfillmentType);
  const addLine = useOnlineCartStore((s) => s.addLine);
  const [picking, setPicking] = useState<MenuProduct | null>(null);

  if (state === 'disabled') return null;
  if (variant === 'detail' && (state === 'empty' || state === 'error')) return null;

  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 id={titleId} className="text-h3 text-gray-900">
          Gợi ý cho bạn
        </h2>
        <Badge tone="ai">
          <Sparkles className="size-3" aria-hidden />
          AI
        </Badge>
      </div>

      {state === 'loading' && (
        <div role="status" aria-busy aria-label="Đang tải gợi ý" className="-mx-4 flex gap-3 overflow-hidden px-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-60 w-40 shrink-0 rounded-xl" />
          ))}
        </div>
      )}

      {state === 'error' && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-primary-100 bg-white p-4">
          <p className="text-body text-gray-600">Chưa tải được gợi ý lúc này.</p>
          <Button variant="outline" size="sm" onClick={refetch}>
            Thử lại
          </Button>
        </div>
      )}

      {state === 'empty' && (
        <p role="status" className="rounded-xl border border-dashed border-ai-from/40 bg-white p-4 text-body text-gray-600">
          AI đang học dữ liệu để hiểu khẩu vị của bạn. Đặt thêm vài món để nhận gợi ý riêng nhé.
        </p>
      )}

      {state === 'ready' && (
        <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
          {items.map((item) => (
            <li key={item.id} className="w-40 shrink-0 snap-start">
              <RecommendationCard item={item} onOpen={(it) => trackClick(it.id)} onAdd={fulfillment ? setPicking : undefined} />
            </li>
          ))}
        </ul>
      )}

      {fulfillment && (
        <ProductOptionsModal
          product={picking}
          onClose={() => setPicking(null)}
          onAdd={(line, quantity) => {
            addLine(line, quantity);
            setPicking(null);
          }}
        />
      )}
    </section>
  );
}
