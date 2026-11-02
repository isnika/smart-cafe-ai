import { useMemo, useState } from "react";
import { Coffee } from "lucide-react";
import { Link } from "react-router-dom";
import { PATHS } from "@/app/routes";
import { countItems, lineUnitTotal, MAX_LINE_QUANTITY } from "@/features/dine-in/cart";
import { QuantityStepper } from "@/features/dine-in/components/QuantityStepper";
import { useOnlineCartStore } from "@/features/online-order/store";
import { formatVnd } from "@/shared/lib";
import { cn } from "@/shared/lib/cn";
import type { ProductDetail } from "@/shared/types";
import { Badge, Button } from "@/shared/ui";
import {
  buildDraft,
  firstMissingGroup,
  initialPicks,
  initialVariantId,
  isSoldOut,
  sortGroups,
  sortVariants,
  togglePick,
  variantPriceHint,
  type Picks,
} from "../model";
import { ProductReviews } from "./ProductReviews";

/** Ảnh món; thiếu ảnh hoặc ảnh lỗi → khối icon (không để <img> hỏng). */
function ProductImage({ src, alt }: { src?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="aspect-[3/2] w-full bg-primary-100">
      {src && !failed ? (
        <img src={src} alt={alt} onError={() => setFailed(true)} className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-primary-300" aria-hidden>
          <Coffee className="size-16" />
        </div>
      )}
    </div>
  );
}

interface Props {
  detail: ProductDetail;
  categoryName?: string;
}

export function ProductDetailView({ detail, categoryName }: Props) {
  const variants = useMemo(() => sortVariants(detail.variants), [detail.variants]);
  const groups = useMemo(() => sortGroups(detail.optionGroups), [detail.optionGroups]);

  const [variantId, setVariantId] = useState<number | null>(() => initialVariantId(variants));
  const [picked, setPicked] = useState<Picks>(() => initialPicks(groups));
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const fulfillment = useOnlineCartStore((s) => s.fulfillmentType);
  const addLine = useOnlineCartStore((s) => s.addLine);
  const cartCount = useOnlineCartStore((s) => countItems(s.lines));

  const variant = variants.find((v) => v.id === variantId) ?? null;
  const soldOut = isSoldOut(variants);
  const missing = firstMissingGroup(groups, picked);
  const draft = buildDraft(detail, variant, groups, picked);
  const total = draft ? lineUnitTotal(draft) * quantity : 0;
  const shownPrice = variant?.price ?? (variants.length > 0 ? Math.min(...variants.map((v) => v.price)) : null);

  const canAdd = !soldOut && draft !== null && !missing && fulfillment !== null;
  const buttonLabel = soldOut ? "Hết hàng" : missing ? `Chọn ${missing.name}` : `Thêm vào giỏ • ${formatVnd(total)}`;

  // Đổi lựa chọn thì thông báo "đã thêm" của lần trước không còn đúng nữa.
  const change = <T,>(setter: (value: T) => void) => (value: T) => {
    setJustAdded(false);
    setter(value);
  };

  const handleAdd = () => {
    if (!canAdd || !draft) return;
    addLine(draft, quantity);
    setJustAdded(true);
    setQuantity(1);
  };

  return (
    <>
      <div className="pb-56">
        <ProductImage key={detail.image ?? "none"} src={detail.image} alt={detail.name} />

        <div className="space-y-5 px-4 pt-4">
          <section aria-labelledby="product-name">
            {categoryName && <p className="text-caption text-gray-500">{categoryName}</p>}
            <div className="flex items-start justify-between gap-3">
              <h2 id="product-name" className="text-h2 text-gray-900">
                {detail.name}
              </h2>
              {shownPrice !== null && <p className="shrink-0 text-h3 text-primary-600">{formatVnd(shownPrice)}</p>}
            </div>
            {detail.description && <p className="mt-1 text-body text-gray-600">{detail.description}</p>}
            <div className="mt-3">
              <Badge tone={soldOut ? "error" : "success"}>{soldOut ? "Hết hàng" : "Còn hàng"}</Badge>
            </div>
          </section>

          {variants.length > 1 && (
            <fieldset>
              <legend className="mb-2 text-body font-semibold text-gray-900">Chọn size</legend>
              <div className="grid grid-cols-3 gap-2">
                {variants.map((v) => (
                  <label
                    key={v.id}
                    className={cn(
                      "cursor-pointer rounded-md border p-3 text-center text-body focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2",
                      v.id === variantId ? "border-primary-500 bg-primary-500 text-white" : "border-gray-200 bg-white text-gray-900",
                      !v.isAvailable && "cursor-not-allowed opacity-40",
                    )}
                  >
                    <input
                      type="radio"
                      name="variant"
                      className="sr-only"
                      checked={v.id === variantId}
                      disabled={!v.isAvailable}
                      onChange={() => change(setVariantId)(v.id)}
                    />
                    <div className="font-semibold">{v.variantName}</div>
                    <div className="text-caption">{v.isAvailable ? variantPriceHint(variants, v) : "Hết hàng"}</div>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {groups.map((g) => (
            <fieldset key={g.id}>
              <legend className="mb-2 text-body font-semibold text-gray-900">
                {g.name}{" "}
                <span className="font-normal text-gray-500">
                  {g.isRequired ? "(Bắt buộc)" : g.selectionType === "Multiple" ? `(Tối đa ${g.maxSelect})` : "(Tuỳ chọn)"}
                </span>
              </legend>
              <div className="space-y-2">
                {g.options.map((o) => {
                  const checked = picked[g.id]?.includes(o.id) ?? false;
                  return (
                    <label
                      key={o.id}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded-md border px-3 py-2.5 text-body focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2",
                        checked ? "border-primary-500 bg-white" : "border-gray-200 bg-white",
                        !o.isAvailable && "cursor-not-allowed opacity-40",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type={g.selectionType === "Single" ? "radio" : "checkbox"}
                          name={`group-${g.id}`}
                          className="size-4 accent-primary-500"
                          checked={checked}
                          disabled={!o.isAvailable}
                          onChange={() => setPicked((prev) => togglePick(groups, prev, g.id, o.id))}
                          onClick={() => setJustAdded(false)}
                        />
                        {o.optionName}
                      </span>
                      {o.extraPrice > 0 && <span className="text-gray-500">+ {formatVnd(o.extraPrice)}</span>}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>

        <ProductReviews productId={detail.id} />
      </div>

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+var(--safe-bottom,0px))] z-20 mx-auto max-w-2xl border-t border-primary-100 bg-white px-4 py-3">
        {justAdded && (
          <p role="status" className="mb-2 flex items-center justify-between gap-2 rounded-md bg-success-soft px-3 py-2 text-body text-success-strong">
            <span>Đã thêm vào giỏ hàng</span>
            <Link to={PATHS.cart} className="font-semibold underline">
              Xem giỏ hàng ({cartCount})
            </Link>
          </p>
        )}
        {fulfillment === null && !soldOut && (
          <p className="mb-2 text-caption text-gray-600">
            Chọn Giao hàng / Mang đi hoặc quét QR trên bàn để đặt món.{" "}
            <Link to={PATHS.start} className="font-semibold text-primary-600 underline">
              Bắt đầu đặt món
            </Link>
          </p>
        )}
        <div className="flex items-center gap-3">
          <QuantityStepper
            label={detail.name}
            value={quantity}
            onDecrement={() => change(setQuantity)(Math.max(1, quantity - 1))}
            onIncrement={() => change(setQuantity)(Math.min(MAX_LINE_QUANTITY, quantity + 1))}
          />
          <Button
            size="lg"
            className="min-w-0 flex-1 rounded-full bg-accent-500 px-3 !text-white hover:bg-accent-600 active:bg-accent-700"
            disabled={!canAdd}
            onClick={handleAdd}
          >
            {buttonLabel}
          </Button>
        </div>
      </div>
    </>
  );
}
