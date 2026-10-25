import { Coffee } from "lucide-react";
import { priceLabel } from "@/features/dine-in/cart";
import type { MenuProduct } from "@/shared/types";

/** Thẻ món chỉ để xem (khách vãng lai chưa có bàn nên không có nút thêm giỏ). Không có ảnh → khối icon, không <img> hỏng. */
export function ProductTile({ product }: { product: MenuProduct }) {
  return (
    <article className="overflow-hidden rounded-xl border border-primary-100 bg-white shadow-card">
      <div className="aspect-[4/3] bg-primary-50">
        {product.image ? (
          <img src={product.image} alt={product.name} loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-primary-300" aria-hidden>
            <Coffee className="size-10" />
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="line-clamp-2 min-h-10 text-body font-semibold text-gray-900">{product.name}</h3>
        {product.description && <p className="line-clamp-2 text-caption text-gray-500">{product.description}</p>}
        <p className="mt-2 text-body font-semibold text-primary-600">{priceLabel(product)}</p>
      </div>
    </article>
  );
}
