import { QrCode } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { PATHS } from "@/app/routes";
import { PageHeader } from "@/features/dine-in/components/PageHeader";
import { CategoryChips } from "../components/CategoryChips";
import { MenuEmpty, MenuError, MenuSkeleton } from "../components/MenuStates";
import { ProductTile } from "../components/ProductTile";
import { useCategories, usePublicMenu } from "../hooks/useMenu";

/** Thực đơn công khai để XEM. Đặt món cần phiên bàn (quét QR) nên không có nút thêm giỏ ở đây. */
export default function MenuBrowsePage() {
  const [params, setParams] = useSearchParams();
  const categories = useCategories();
  const menu = usePublicMenu();

  const raw = Number(params.get("category"));
  const categoryId = Number.isInteger(raw) && raw > 0 ? raw : null;
  const products = (menu.data ?? []).filter((p) => categoryId === null || p.categoryId === categoryId);

  return (
    <div className="min-h-screen bg-primary-50">
      <PageHeader title="Thực đơn" />
      <div className="space-y-4 px-4 pb-24 pt-4">
        {categories.data && categories.data.length > 0 && (
          <CategoryChips
            categories={categories.data}
            activeId={categoryId}
            onChange={(id) => setParams(id === null ? {} : { category: String(id) }, { replace: true })}
          />
        )}

        {menu.isPending && <MenuSkeleton />}
        {menu.isError && <MenuError error={menu.error} onRetry={() => void menu.refetch()} />}
        {menu.isSuccess && products.length === 0 && <MenuEmpty>Chưa có món nào trong danh mục này.</MenuEmpty>}
        {products.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {products.map((p) => (
              <ProductTile key={p.id} product={p} />
            ))}
          </div>
        )}

        <aside className="flex items-start gap-3 rounded-xl border border-primary-100 bg-white p-4">
          <QrCode className="mt-0.5 size-5 shrink-0 text-primary-600" aria-hidden />
          <p className="text-body text-gray-700">
            Muốn gọi món? Quét mã QR trên bàn của bạn để thêm món vào giỏ.{" "}
            <Link to={PATHS.start} className="font-semibold text-primary-600 underline">
              Bắt đầu đặt món
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
