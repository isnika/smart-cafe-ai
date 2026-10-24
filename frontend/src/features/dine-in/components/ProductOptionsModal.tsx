import { useMemo, useState } from "react";
import { formatVnd } from "@/shared/lib";
import { cn } from "@/shared/lib/cn";
import type { MenuProduct, ProductDetail } from "@/shared/types";
import { Button, Modal, Skeleton } from "@/shared/ui";
import { lineUnitTotal, MAX_LINE_QUANTITY, type NewCartLine } from "../cart";
import { DINE_IN_BRANCH_ID } from "../config";
import { useProductDetail } from "../hooks/useMenu";
import { QuantityStepper } from "./QuantityStepper";

interface Props {
  /** null = đóng */
  product: MenuProduct | null;
  onClose: () => void;
  onAdd: (line: NewCartLine, quantity: number) => void;
}

export function ProductOptionsModal({ product, onClose, onAdd }: Props) {
  const detail = useProductDetail(product?.id ?? null, DINE_IN_BRANCH_ID);
  return (
    <Modal open={product !== null} onClose={onClose} title={product?.name ?? ""}>
      {detail.isPending && (
        <div className="space-y-3" aria-busy>
          <Skeleton className="h-10" />
          <Skeleton className="h-24" />
        </div>
      )}
      {detail.isError && (
        <div className="space-y-3 text-center">
          <p className="text-body text-gray-600">Không tải được tuỳ chọn của món.</p>
          <Button variant="outline" onClick={() => void detail.refetch()}>
            Thử lại
          </Button>
        </div>
      )}
      {detail.data && <OptionsForm key={detail.data.id} detail={detail.data} onAdd={onAdd} />}
    </Modal>
  );
}

function OptionsForm({ detail, onAdd }: { detail: ProductDetail; onAdd: Props["onAdd"] }) {
  const variants = useMemo(() => [...detail.variants].sort((a, b) => a.sortOrder - b.sortOrder), [detail.variants]);
  const groups = useMemo(() => [...detail.optionGroups].sort((a, b) => a.sortOrder - b.sortOrder), [detail.optionGroups]);

  const [variantId, setVariantId] = useState<number | null>(() => variants.find((v) => v.isAvailable)?.id ?? null);
  const [picked, setPicked] = useState<Record<number, number[]>>(() =>
    Object.fromEntries(
      groups.map((g) => [g.id, g.options.filter((o) => o.isDefault && o.isAvailable).map((o) => o.id)]),
    ),
  );
  const [quantity, setQuantity] = useState(1);

  const variant = variants.find((v) => v.id === variantId) ?? null;

  const toggle = (groupId: number, optionId: number) => {
    const group = groups.find((g) => g.id === groupId)!;
    setPicked((prev) => {
      const cur = prev[groupId] ?? [];
      if (group.selectionType === "Single") {
        return { ...prev, [groupId]: cur.includes(optionId) && !group.isRequired ? [] : [optionId] };
      }
      if (cur.includes(optionId)) return { ...prev, [groupId]: cur.filter((id) => id !== optionId) };
      if (cur.length >= group.maxSelect) return prev;
      return { ...prev, [groupId]: [...cur, optionId] };
    });
  };

  const missing = groups.find((g) => (picked[g.id]?.length ?? 0) < Math.max(g.minSelect, g.isRequired ? 1 : 0));

  const options = groups.flatMap((g) =>
    g.options
      .filter((o) => picked[g.id]?.includes(o.id))
      .map((o) => ({ optionId: o.id, optionName: o.optionName, extraPrice: o.extraPrice, quantity: 1 })),
  );

  const draft: NewCartLine | null = variant
    ? {
        productId: detail.id,
        productName: detail.name,
        image: detail.image,
        variantId: variant.id,
        variantName: variant.variantName,
        unitPrice: variant.price,
        options,
      }
    : null;

  const total = draft ? lineUnitTotal(draft) * quantity : 0;

  if (!variant) {
    return <p className="text-body text-gray-600">Món này hiện đã hết hàng.</p>;
  }

  return (
    <div className="space-y-5">
      {detail.description && <p className="text-body text-gray-600">{detail.description}</p>}

      {variants.length > 1 && (
        <fieldset>
          <legend className="mb-2 text-body font-semibold">Chọn size</legend>
          <div className="grid grid-cols-3 gap-2">
            {variants.map((v) => (
              <label
                key={v.id}
                className={cn(
                  "cursor-pointer rounded-md border p-2 text-center text-body",
                  v.id === variantId ? "border-primary-600 bg-primary-600 text-white" : "border-gray-200 bg-white",
                  !v.isAvailable && "cursor-not-allowed opacity-40",
                )}
              >
                <input
                  type="radio"
                  name="variant"
                  className="sr-only"
                  checked={v.id === variantId}
                  disabled={!v.isAvailable}
                  onChange={() => setVariantId(v.id)}
                />
                <div className="font-semibold">{v.variantName}</div>
                <div className="text-caption">{formatVnd(v.price)}</div>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {groups.map((g) => (
        <fieldset key={g.id}>
          <legend className="mb-2 text-body font-semibold">
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
                    "flex cursor-pointer items-center justify-between rounded-md border px-3 py-2.5 text-body",
                    checked ? "border-primary-600 bg-primary-50" : "border-gray-200 bg-white",
                    !o.isAvailable && "cursor-not-allowed opacity-40",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type={g.selectionType === "Single" ? "radio" : "checkbox"}
                      name={`group-${g.id}`}
                      className="accent-primary-600"
                      checked={checked}
                      disabled={!o.isAvailable}
                      onChange={() => toggle(g.id, o.id)}
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

      <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-4">
        <QuantityStepper
          label={detail.name}
          value={quantity}
          onDecrement={() => setQuantity((q) => Math.max(1, q - 1))}
          onIncrement={() => setQuantity((q) => Math.min(MAX_LINE_QUANTITY, q + 1))}
        />
        <Button className="flex-1" disabled={!!missing || !draft} onClick={() => draft && onAdd(draft, quantity)}>
          {missing ? `Chọn ${missing.name}` : `Thêm vào giỏ • ${formatVnd(total)}`}
        </Button>
      </div>
    </div>
  );
}
