import { ChevronRight, Coffee } from 'lucide-react';
import { Link } from 'react-router-dom';
import { to } from '@/app/routes';
import { priceLabel } from '@/features/dine-in/cart';
import type { ChatProductCard as ProductCard } from '@/shared/types';

/** Thẻ món trong tin nhắn AI: bấm để mở trang chi tiết món (router của dự án). Không có ảnh → khối icon. */
export function ChatProductCard({ card, onNavigate }: { card: ProductCard; onNavigate?: () => void }) {
  const price = priceLabel(card);
  return (
    <Link
      to={to.product(String(card.productId))}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-md border border-primary-100 bg-white p-2 text-left shadow-card transition hover:border-primary-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ai-from"
    >
      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-sm bg-primary-50 text-primary-600">
        {card.image ? <img src={card.image} alt="" loading="lazy" className="size-full object-cover" /> : <Coffee className="size-6" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-body font-semibold text-gray-900">{card.name}</span>
        {price && <span className="block text-caption font-semibold text-primary-600">{price}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-gray-500" aria-hidden />
    </Link>
  );
}
