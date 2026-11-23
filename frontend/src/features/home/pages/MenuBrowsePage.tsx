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
import { MenuSearch } from "../components/MenuSearch";
import { MenuEmpty, MenuError, MenuSkeleton } from "../components/MenuStates";
import { useCategories, usePublicMenu } from "../hooks/useMenu";
import { useDefaultBranch } from "../hooks/useDefaultBranch";
import { filterMenu } from "../menuFilter";

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
  const branchId = useOnlineCartStore((s) => s.branchId);
  const setBranch = useOnlineCartStore((s) => s.setBranch);
  const { branches } = useDefaultBranch();
  const [picking, setPicking] = useState<MenuProduct | null>(null);

  const raw = Number(params.get("category"));
  const categoryId = Number.isInteger(raw) && raw > 0 ? raw : null;
  const keyword = params.get("q") ?? "";
  const products = filterMenu(menu.data ?? [], categoryId, keyword);
  const updateFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-primary-50">
      <PageHeader title="Thực đơn" />
      <div className={lines.length > 0 ? "space-y-4 px-4 pb-44 pt-4" : "space-y-4 px-4 pb-24 pt-4"}>
        <section className="rounded-xl border border-primary-100 bg-white p-4">
          <label htmlFor="online-branch" className="mb-2 block text-body font-semibold">Chọn chi nhánh trước khi chọn món</label>
          {branches.isError ? <p role="alert" className="text-caption text-error-strong">Không tải được danh sách chi nhánh. <button type="button" className="underline" onClick={() => void branches.refetch()}>Thử lại</button></p> : <select id="online-branch" aria-label="Chi nhánh đặt hàng" value={branchId ?? ''} disabled={branches.isPending} onChange={(event) => setBranch(event.target.value ? Number(event.target.value) : null)} className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-body"><option value="">Chọn chi nhánh</option>{branches.data?.filter((branch) => branch.status === 'Active' && branch.acceptsOnlineOrders).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>}
        </section>
        {branchId === null && <p className="rounded-xl bg-primary-100 p-4 text-body text-primary-900">Vui lòng chọn chi nhánh để xem thực đơn và thêm món vào giỏ.</p>}
        <MenuSearch value={keyword} onChange={(value) => updateFilter("q", value)} />
        {categories.data && categories.data.length > 0 && (
          <CategoryChips
            categories={categories.data}
            activeId={categoryId}
            onChange={(id) => updateFilter("category", id === null ? null : String(id))}
          />
        )}

        {branchId !== null && menu.isPending && <MenuSkeleton />}
        {menu.isError && <MenuError error={menu.error} onRetry={() => void menu.refetch()} />}
        {menu.isSuccess && products.length === 0 && <MenuEmpty>{keyword.trim() ? "Không tìm thấy món phù hợp. Hãy thử từ khóa hoặc danh mục khác." : "Chưa có món nào trong danh mục này."}</MenuEmpty>}
        {products.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {products.map((p) =>
              <ProductCard key={p.id} product={p} onAdd={setPicking} href={to.product(String(p.id))} />,
            )}
          </div>
        )}

        {branchId !== null && <p className="rounded-xl border border-primary-100 bg-white p-4 text-body text-gray-700">Thực đơn và đơn hàng sẽ theo chi nhánh bạn đã chọn.</p>}
      </div>

      {lines.length > 0 && (
        <StickyActionBar total={formatVnd(calcSubTotal(lines))}>
          <Button size="lg" className="rounded-full bg-accent-500 !text-white hover:bg-accent-600 active:bg-accent-700" onClick={() => navigate(PATHS.cart)}>
            Xem giỏ hàng ({countItems(lines)})
          </Button>
        </StickyActionBar>
      )}
      {branchId !== null && <ProductOptionsModal
        product={picking}
        onClose={() => setPicking(null)}
        onAdd={(line, quantity) => {
          addLine(line, quantity);
            toast.success(`Đã thêm ${quantity} ${line.productName} vào giỏ hàng`);
          setPicking(null);
        }}
        branchId={branchId}
      />}
    </div>
  );
}
