import { Coffee, Plus, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { to } from '@/app/routes';
import { priceLabel } from '@/features/dine-in/cart';
import type { MenuProduct, RecommendationView } from '@/shared/types';

interface Props {
  item: RecommendationView;
  /** Bấm vào thẻ (trước khi điều hướng) – dùng để ghi nhận lượt click. */
  onOpen: (item: RecommendationView) => void;
  /** Có → hiện nút thêm vào giỏ (chỉ khi khách đã chọn Giao hàng / Mang đi). */
  onAdd?: (product: MenuProduct) => void;
}

/** Thẻ gợi ý: cả thẻ bấm được (liên kết nằm trên tên món, phủ kín thẻ); nút thêm giỏ bấm riêng. */
export function RecommendationCard({ item, onOpen, onAdd }: Props) {
  const { product, reason } = item;
  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-xl border border-primary-100 bg-white shadow-card focus-within:ring-2 focus-within:ring-ai-from">
      <div className="aspect-[4/3] bg-primary-50">
        {product.image ? (
          <img src={product.image} alt={product.name} loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-primary-600" aria-hidden>
            <Coffee className="size-10" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-2 min-h-10 text-body font-semibold text-gray-900">
          <Link
            to={to.product(String(product.id))}
            onClick={() => onOpen(item)}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {product.name}
          </Link>
        </h3>
        {reason && (
          <p className="mt-1 flex items-start gap-1 text-caption text-gray-500">
            <Sparkles className="mt-0.5 size-3 shrink-0 text-ai-from" aria-hidden />
            <span className="line-clamp-2">{reason}</span>
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="text-body font-semibold text-primary-600">{priceLabel(product)}</span>
          {onAdd && (
            <button
              type="button"
              onClick={() => onAdd(product)}
              aria-label={`Thêm ${product.name} vào giỏ`}
              className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full bg-primary-600 text-white hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai-from"
            >
              <Plus className="size-5" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
