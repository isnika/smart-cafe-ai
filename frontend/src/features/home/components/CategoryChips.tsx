import type { Category } from "@/shared/types";
import { cn } from "@/shared/lib/cn";

export function CategoryChips({
  categories,
  activeId,
  onChange,
}: {
  categories: Category[];
  activeId: number | null;
  onChange: (id: number | null) => void;
}) {
  const items: Array<{ id: number | null; name: string }> = [{ id: null, name: "Tất cả" }, ...categories];
  return (
    <div role="group" aria-label="Danh mục món" className="flex flex-wrap gap-2">
      {items.map((c) => (
        <button
          key={c.id ?? "all"}
          type="button"
          aria-pressed={c.id === activeId}
          onClick={() => onChange(c.id)}
          className={cn(
            "rounded-full border px-4 py-2 text-body font-medium transition-colors",
            c.id === activeId ? "border-primary-600 bg-primary-600 text-white" : "border-primary-100 bg-white text-gray-800 hover:bg-primary-50",
          )}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
