import { Coffee, Trash2 } from "lucide-react";
import { formatVnd } from "@/shared/lib";
import { describeLine, lineTotal, type DineInCartLine } from "../cart";
import { useDineInCartStore } from "../store";
import { QuantityStepper } from "./QuantityStepper";

/** Dòng giỏ hàng dạng card (màn Giỏ hàng). Ảnh thiếu → khối icon, không có <img> hỏng. */
export function CartLineCard({ line }: { line: DineInCartLine }) {
  const increment = useDineInCartStore((s) => s.increment);
  const decrement = useDineInCartStore((s) => s.decrement);
  const removeLine = useDineInCartStore((s) => s.removeLine);
  const detail = describeLine(line);

  return (
    <li className="flex gap-3 rounded-lg border border-primary-100 bg-white p-3">
      <div className="size-16 shrink-0 overflow-hidden rounded-md bg-primary-50">
        {line.image ? (
          <img src={line.image} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-primary-300" aria-hidden>
            <Coffee className="size-6" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-body-lg font-semibold text-gray-900">{line.productName}</h3>
          <button
            type="button"
            onClick={() => removeLine(line.key)}
            aria-label={`Xoá ${line.productName}`}
            className="rounded-sm p-1 text-gray-400 hover:bg-gray-100 hover:text-error"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
        {detail && <p className="text-caption text-gray-500">{detail}</p>}
        {line.note && <p className="text-caption italic text-gray-500">“{line.note}”</p>}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-body font-semibold text-primary-600">{formatVnd(lineTotal(line))}</span>
          <QuantityStepper
            label={line.productName}
            value={line.quantity}
            onDecrement={() => decrement(line.key)}
            onIncrement={() => increment(line.key)}
          />
        </div>
      </div>
    </li>
  );
}
