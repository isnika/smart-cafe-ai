import { Coffee, ShoppingBag, Trash2 } from "lucide-react";
import { formatVnd } from "@/shared/lib";
import { Button, Modal } from "@/shared/ui";
import { calcSubTotal, countItems, lineTotal, type DineInCartLine } from "../cart";
import { useDineInCartStore } from "../store";
import { QuantityStepper } from "./QuantityStepper";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Giai đoạn 2 truyền vào để hiện nút gửi đơn; chưa truyền thì không hiện. */
  onCheckout?: () => void;
}

const describeOptions = (l: DineInCartLine) =>
  [l.variantName !== "Standard" ? `Size ${l.variantName}` : null, ...l.options.map((o) => o.optionName)]
    .filter(Boolean)
    .join(", ");

export function CartDrawer({ open, onClose, onCheckout }: Props) {
  const lines = useDineInCartStore((s) => s.lines);
  const increment = useDineInCartStore((s) => s.increment);
  const decrement = useDineInCartStore((s) => s.decrement);
  const removeLine = useDineInCartStore((s) => s.removeLine);

  const itemCount = countItems(lines);
  const subTotal = calcSubTotal(lines);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Giỏ hàng của bạn"
      footer={
        lines.length === 0 ? (
          <Button variant="outline" fullWidth onClick={onClose}>
            Quay lại chọn món
          </Button>
        ) : (
          <div className="flex w-full items-center justify-between gap-3">
            <div>
              <div className="text-caption text-gray-500">{itemCount} món • Tạm tính</div>
              <div className="text-h4 text-primary-600">{formatVnd(subTotal)}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Chọn thêm
              </Button>
              {onCheckout && <Button onClick={onCheckout}>Gửi đơn</Button>}
            </div>
          </div>
        )
      }
    >
      {lines.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-gray-500">
          <ShoppingBag className="size-10" aria-hidden />
          <p className="text-body">Giỏ hàng đang trống</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {lines.map((l) => (
            <li key={l.key} className="flex gap-3 py-3">
              <div className="size-16 shrink-0 overflow-hidden rounded-md bg-primary-50">
                {l.image ? (
                  <img src={l.image} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-primary-300" aria-hidden>
                    <Coffee className="size-6" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-body font-semibold">{l.productName}</h3>
                  <button
                    type="button"
                    onClick={() => removeLine(l.key)}
                    aria-label={`Xoá ${l.productName}`}
                    className="rounded-sm p-1 text-gray-400 hover:bg-gray-100 hover:text-error"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {describeOptions(l) && <p className="text-caption text-gray-500">{describeOptions(l)}</p>}
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-body font-semibold text-primary-600">{formatVnd(lineTotal(l))}</span>
                  <QuantityStepper
                    label={l.productName}
                    value={l.quantity}
                    onDecrement={() => decrement(l.key)}
                    onIncrement={() => increment(l.key)}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
