import type { Category } from "@/shared/types";
import { cn } from "@/shared/lib/cn";

interface Props {
  categories: Category[];
  /** null = "Tất cả" */
  activeId: number | null;
  onChange: (id: number | null) => void;
}

export function CategoryTabs({ categories, activeId, onChange }: Props) {
  const items: Array<{ id: number | null; name: string }> = [{ id: null, name: "Tất cả" }, ...categories];
  return (
    <div role="tablist" aria-label="Danh mục" className="flex gap-2 overflow-x-auto px-4 py-3">
      {items.map((c) => {
        const active = c.id === activeId;
        return (
          <button
            key={c.id ?? "all"}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(c.id)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-1.5 text-body font-medium transition-colors",
              active
                ? "border-primary-600 bg-primary-600 text-white"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
            )}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
