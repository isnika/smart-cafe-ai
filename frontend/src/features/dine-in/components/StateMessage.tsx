import type { ReactNode } from "react";

/** Khối thông báo toàn trang (lỗi / trống) cho trang dine-in. */
export function StateMessage({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <h2 className="text-h3">{title}</h2>
      {children && <p className="text-body text-gray-600">{children}</p>}
      {action}
    </div>
  );
}
