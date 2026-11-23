import { Search } from "lucide-react";

export function MenuSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-gray-500" aria-hidden />
      <input
        type="search"
        aria-label="Tìm món theo tên"
        placeholder="Tìm món theo tên..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-xl border border-primary-100 bg-white pl-12 pr-4 text-body focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
      />
    </div>
  );
}
