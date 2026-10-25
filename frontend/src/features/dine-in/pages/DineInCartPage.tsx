import { ShoppingBag, UtensilsCrossed } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { PATHS, to } from "@/app/routes";
import { formatVnd } from "@/shared/lib";
import { Button } from "@/shared/ui";
import { calcSubTotal, countItems } from "../cart";
import { CartLineCard } from "../components/CartLineCard";
import { PageHeader } from "../components/PageHeader";
import { StickyActionBar } from "../components/StickyActionBar";
import { useDineInCartStore } from "../store";

/** Giỏ hàng tại bàn. Giỏ gắn với phiên bàn nên khi chưa quét QR thì chỉ hiện hướng dẫn. */
export default function DineInCartPage() {
  const lines = useDineInCartStore((s) => s.lines);
  const tableCode = useDineInCartStore((s) => s.tableCode);
  const sessionId = useDineInCartStore((s) => s.tableSessionId);
  const navigate = useNavigate();

  const subTotal = calcSubTotal(lines);
  const hasTable = sessionId !== null && tableCode;

  return (
    <div className="min-h-screen bg-primary-50">
      <PageHeader title="Giỏ hàng của bạn" />

      {lines.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
          <ShoppingBag className="size-12 text-primary-300" aria-hidden />
          <h2 className="text-h4">Giỏ hàng đang trống</h2>
          <p className="text-body text-gray-600">
            {hasTable
              ? "Chọn vài món từ thực đơn của bàn để bắt đầu."
              : "Quét mã QR trên bàn hoặc nhập mã bàn để bắt đầu gọi món."}
          </p>
          <Link
            to={hasTable ? to.dineInTable(tableCode) : PATHS.start}
            className="inline-flex h-10 items-center rounded-md bg-primary-600 px-4 text-body font-medium text-white hover:bg-primary-700"
          >
            {hasTable ? "Quay lại thực đơn" : "Bắt đầu đặt món"}
          </Link>
        </div>
      ) : (
        <div className="space-y-5 px-4 pb-40 pt-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary-100 px-3 py-1.5 text-body font-medium text-primary-800">
            <UtensilsCrossed className="size-4" aria-hidden />
            Tại quán{tableCode ? ` · ${tableCode}` : ""}
          </div>

          <ul className="space-y-3" aria-label="Món đã chọn">
            {lines.map((l) => (
              <CartLineCard key={l.key} line={l} />
            ))}
          </ul>

          <section aria-labelledby="order-summary">
            <h2 id="order-summary" className="mb-2 text-body-lg font-semibold">
              Tóm tắt đơn hàng
            </h2>
            <dl className="space-y-2 rounded-lg border border-primary-100 bg-white p-4">
              <div className="flex justify-between text-body text-gray-600">
                <dt>Tạm tính ({countItems(lines)} món)</dt>
                <dd className="font-medium text-gray-900">{formatVnd(subTotal)}</dd>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-3 text-body-lg font-semibold">
                <dt>Tổng cộng</dt>
                <dd className="text-primary-600">{formatVnd(subTotal)}</dd>
              </div>
            </dl>
          </section>

          <StickyActionBar total={formatVnd(subTotal)}>
            <Button size="lg" onClick={() => navigate(PATHS.dineInCheckout)}>
              Tiến hành đặt hàng
            </Button>
          </StickyActionBar>
        </div>
      )}
    </div>
  );
}
