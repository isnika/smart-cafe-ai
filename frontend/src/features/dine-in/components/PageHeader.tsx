import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

/** Thanh tiêu đề trắng của các màn con (có/không nút quay lại). */
export function PageHeader({ title, back, children }: { title: string; back?: boolean | string; children?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="flex items-center gap-2 border-b border-primary-100 bg-white px-4 py-3">
      {back && (
        <button
          type="button"
          aria-label="Quay lại"
          onClick={() => (typeof back === "string" ? navigate(back) : navigate(-1))}
          className="-ml-1 rounded-full p-1 text-gray-800 hover:bg-gray-100"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}
      <h1 className="text-h3 text-gray-900">{title}</h1>
      {children && <div className="ml-auto">{children}</div>}
    </header>
  );
}
