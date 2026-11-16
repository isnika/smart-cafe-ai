import type { ReactNode } from "react";

/** Thanh tổng tiền + nút hành động dính đáy, nằm ngay trên bottom-nav của CustomerLayout. */
export function StickyActionBar({ total, label = "Tổng thanh toán", children }: { total: string; label?: string; children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+var(--safe-bottom,0px))] z-20 mx-auto flex max-w-2xl items-center justify-between gap-3 border-t border-primary-100 bg-white px-4 py-3">
      <div>
        <div className="text-caption text-gray-500">{label}</div>
        <div className="text-h3 text-primary-600">{total}</div>
      </div>
      {children}
    </div>
  );
}
