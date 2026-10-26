import { useState } from "react";
import { QrCode } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PATHS } from "@/app/routes";
import { calcSubTotal, countItems } from "@/features/dine-in/cart";
import { PageHeader } from "@/features/dine-in/components/PageHeader";
import { ProductCard } from "@/features/dine-in/components/ProductCard";
import { ProductOptionsModal } from "@/features/dine-in/components/ProductOptionsModal";
import { StickyActionBar } from "@/features/dine-in/components/StickyActionBar";
import { FulfillmentBadge } from "@/features/online-order/components/FulfillmentBadge";
import { useOnlineCartStore } from "@/features/online-order/store";
import type { MenuProduct } from "@/shared/types";
import { formatVnd } from "@/shared/lib";
import { Button } from "@/shared/ui";
import { CategoryChips } from "../components/CategoryChips";
import { MenuEmpty, MenuError, MenuSkeleton } from "../components/MenuStates";
import { ProductTile } from "../components/ProductTile";
import { useCategories, usePublicMenu } from "../hooks/useMenu";

/**
 * Thực đơn công khai. Mặc định chỉ để XEM (đặt tại bàn cần phiên bàn/quét QR).
 * Khi khách đã chọn Giao hàng / Mang đi thì mỗi món có nút thêm vào giỏ Online.
 */
export default function MenuBrowsePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const categories = useCategories();
  const menu = usePublicMenu();
  const fulfillment = useOnlineCartStore((s) => s.fulfillmentType);
  const lines = useOnlineCartStore((s) => s.lines);
  const addLine = useOnlineCartStore((s) => s.addLine);
  const [picking, setPicking] = useState<MenuProduct | null>(null);

  const raw = Number(params.get("category"));
  const categoryId = Number.isInteger(raw) && raw > 0 ? raw : null;
  const products = (menu.data ?? []).filter((p) => categoryId === null || p.categoryId === categoryId);

  return (
    <div className="min-h-screen bg-primary-50">
      <PageHeader title="Thực đơn">{fulfillment && <FulfillmentBadge type={fulfillment} />}</PageHeader>
      <div className={fulfillment && lines.length > 0 ? "space-y-4 px-4 pb-44 pt-4" : "space-y-4 px-4 pb-24 pt-4"}>
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
              fulfillment ? <ProductCard key={p.id} product={p} onAdd={setPicking} /> : <ProductTile key={p.id} product={p} />,
            )}
          </div>
        )}

        {!fulfillment && (
          <aside className="flex items-start gap-3 rounded-xl border border-primary-100 bg-white p-4">
            <QrCode className="mt-0.5 size-5 shrink-0 text-primary-600" aria-hidden />
            <p className="text-body text-gray-700">
              Muốn gọi món? Quét mã QR trên bàn của bạn để thêm món vào giỏ.{" "}
              <Link to={PATHS.start} className="font-semibold text-primary-600 underline">
                Bắt đầu đặt món
              </Link>
            </p>
          </aside>
        )}
      </div>

      {fulfillment && (
        <>
          {lines.length > 0 && (
            <StickyActionBar total={formatVnd(calcSubTotal(lines))}>
              <Button size="lg" className="rounded-full bg-accent-500 hover:bg-accent-600 active:bg-accent-700" onClick={() => navigate(PATHS.cart)}>
                Xem giỏ hàng ({countItems(lines)})
              </Button>
            </StickyActionBar>
          )}
          <ProductOptionsModal
            product={picking}
            onClose={() => setPicking(null)}
            onAdd={(line, quantity) => {
              addLine(line, quantity);
              setPicking(null);
            }}
          />
        </>
      )}
    </div>
  );
}
