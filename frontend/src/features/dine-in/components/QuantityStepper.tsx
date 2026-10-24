import { Minus, Plus } from "lucide-react";
import { cn } from "@/shared/lib/cn";

interface Props {
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  label: string;
  className?: string;
}

export function QuantityStepper({ value, onDecrement, onIncrement, label, className }: Props) {
  return (
    <div className={cn("inline-flex items-center gap-2 rounded-full bg-gray-100 p-1", className)}>
      <button
        type="button"
        onClick={onDecrement}
        aria-label={`Giảm số lượng ${label}`}
        className="flex size-7 items-center justify-center rounded-full bg-white text-gray-700 hover:bg-gray-50"
      >
        <Minus className="size-4" />
      </button>
      <span className="min-w-6 text-center text-body font-medium" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        aria-label={`Tăng số lượng ${label}`}
        className="flex size-7 items-center justify-center rounded-full bg-primary-600 text-white hover:bg-primary-700"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
