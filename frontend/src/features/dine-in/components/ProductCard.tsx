import { Coffee, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import type { MenuProduct } from "@/shared/types";
import { priceLabel } from "../cart";

interface Props {
  product: MenuProduct;
  onAdd: (product: MenuProduct) => void;
  /** Có → tên món là liên kết (phủ kín thẻ) tới trang chi tiết; nút thêm vẫn bấm riêng được. */
  href?: string;
}

export function ProductCard({ product, onAdd, href }: Props) {
  const price = priceLabel(product);
  return (
    <article className="relative overflow-hidden rounded-lg border border-gray-200 bg-white shadow-card">
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
        <h3 className="line-clamp-2 min-h-10 text-body font-semibold text-gray-900">
          {href ? (
            <Link to={href} className="after:absolute after:inset-0 after:content-['']">
              {product.name}
            </Link>
          ) : (
            product.name
          )}
        </h3>
        {product.description && <p className="mt-0.5 line-clamp-2 text-caption text-gray-500">{product.description}</p>}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-body font-semibold text-primary-600">{price}</span>
          <button
            type="button"
            onClick={() => onAdd(product)}
            aria-label={`Thêm ${product.name}`}
            className="relative z-10 flex size-8 items-center justify-center rounded-full bg-primary-600 text-white hover:bg-primary-700"
          >
            <Plus className="size-5" />
          </button>
        </div>
      </div>
    </article>
  );
}
