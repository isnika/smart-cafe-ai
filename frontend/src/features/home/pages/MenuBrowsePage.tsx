import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { PATHS, to } from "@/app/routes";
import { calcSubTotal, countItems } from "@/features/dine-in/cart";
import { PageHeader } from "@/features/dine-in/components/PageHeader";
import { ProductCard } from "@/features/dine-in/components/ProductCard";
import { ProductOptionsModal } from "@/features/dine-in/components/ProductOptionsModal";
import { StickyActionBar } from "@/features/dine-in/components/StickyActionBar";
import { useOnlineCartStore } from "@/features/online-order/store";
import type { MenuProduct } from "@/shared/types";
import { formatVnd } from "@/shared/lib";
import { Button } from "@/shared/ui";
import { CategoryChips } from "../components/CategoryChips";
import { MenuEmpty, MenuError, MenuSkeleton } from "../components/MenuStates";
import { useCategories, usePublicMenu } from "../hooks/useMenu";

/**
 * Thực đơn công khai; khách có thể thêm món vào giỏ trước khi chọn cách nhận hàng.
 */
export default function MenuBrowsePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const categories = useCategories();
  const menu = usePublicMenu();
  const lines = useOnlineCartStore((s) => s.lines);
  const addLine = useOnlineCartStore((s) => s.addLine);
  const [picking, setPicking] = useState<MenuProduct | null>(null);

  const raw = Number(params.get("category"));
  const categoryId = Number.isInteger(raw) && raw > 0 ? raw : null;
  const products = (menu.data ?? []).filter((p) => categoryId === null || p.categoryId === categoryId);

  return (
    <div className="min-h-screen bg-primary-50">
      <PageHeader title="Thực đơn" />
      <div className={lines.length > 0 ? "space-y-4 px-4 pb-44 pt-4" : "space-y-4 px-4 pb-24 pt-4"}>
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
            {products.map((p) =>
              <ProductCard key={p.id} product={p} onAdd={setPicking} href={to.product(String(p.id))} />,
            )}
          </div>
        )}

        <p className="rounded-xl border border-primary-100 bg-white p-4 text-body text-gray-700">Thêm món vào giỏ, kiểm tra lựa chọn rồi chọn giao hàng trực tuyến hoặc mang đi để tiếp tục.</p>
      </div>

      {lines.length > 0 && (
        <StickyActionBar total={formatVnd(calcSubTotal(lines))}>
          <Button size="lg" className="rounded-full bg-accent-500 !text-white hover:bg-accent-600 active:bg-accent-700" onClick={() => navigate(PATHS.cart)}>
            Xem giỏ hàng ({countItems(lines)})
          </Button>
        </StickyActionBar>
      )}
      <ProductOptionsModal
        product={picking}
        onClose={() => setPicking(null)}
        onAdd={(line, quantity) => {
          addLine(line, quantity);
            toast.success(`Đã thêm ${quantity} ${line.productName} vào giỏ hàng`);
          setPicking(null);
        }}
      />
    </div>
  );
}
