import { useState } from "react";
import { ArrowRight, Coffee, ListChecks, QrCode, ShoppingCart, Sparkles, UtensilsCrossed } from "lucide-react";
import { Link } from "react-router-dom";
import { PATHS } from "@/app/routes";
import { useAuthStore } from "@/features/auth/store";
import { CategoryChips } from "../components/CategoryChips";
import { MenuEmpty, MenuError, MenuSkeleton } from "../components/MenuStates";
import { ProductTile } from "../components/ProductTile";
import { useCategories, usePublicMenu } from "../hooks/useMenu";

const FEATURED_COUNT = 4;

const STEPS = [
  { icon: QrCode, title: "Quét mã QR trên bàn", text: "Dùng camera điện thoại hoặc nhập mã bàn." },
  { icon: UtensilsCrossed, title: "Chọn món", text: "Xem thực đơn theo danh mục và tuỳ chỉnh đồ uống." },
  { icon: ShoppingCart, title: "Thêm vào giỏ hàng", text: "Kiểm tra lại món và số lượng." },
  { icon: ListChecks, title: "Xác nhận đặt món", text: "Đơn được gửi thẳng đến nhân viên quầy." },
] as const;

/** Trang chủ công khai cho khách vãng lai: giới thiệu, món theo danh mục (từ catalog API), hướng dẫn gọi món tại bàn. */
export default function HomePage() {
  const authed = useAuthStore((s) => s.status === "authenticated");
  const categories = useCategories();
  const menu = usePublicMenu();
  const [categoryId, setCategoryId] = useState<number | null>(null);

  const featured = (menu.data ?? []).filter((p) => categoryId === null || p.categoryId === categoryId).slice(0, FEATURED_COUNT);

  return (
    <div className="space-y-8 px-4 pb-24 pt-4">
      <header className="flex items-center justify-between">
        <Link to={PATHS.home} className="flex items-center gap-2" aria-label="Smart Cafe – trang chủ">
          <span className="grid size-10 place-items-center rounded-lg bg-primary-600 text-white">
            <Coffee className="size-5" aria-hidden />
          </span>
          <span className="font-heading text-h3 text-gray-900">Smart Cafe</span>
        </Link>
        {!authed && (
          <Link to={PATHS.login} className="rounded-full border border-primary-200 bg-white px-4 py-2 text-body font-medium text-primary-700 hover:bg-primary-50">
            Đăng nhập
          </Link>
        )}
      </header>

      <section aria-labelledby="hero-title" className="rounded-2xl bg-primary-800 px-6 py-8 text-white">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-caption font-medium">
          <Sparkles className="size-3.5" aria-hidden /> Cà phê & công nghệ
        </p>
        <h1 id="hero-title" className="mt-4 font-heading text-h1 leading-tight">
          Một ly ngon, theo cách của bạn
        </h1>
        <p className="mt-2 text-body-lg text-primary-100">Chọn món ngay trên điện thoại, gửi đơn tới quầy mà không cần chờ gọi.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to={PATHS.start} className="inline-flex h-12 items-center gap-2 rounded-full bg-accent-500 px-6 font-medium text-white hover:bg-accent-600">
            Đặt món <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link to={PATHS.menu} className="inline-flex h-12 items-center rounded-full border border-white/40 px-6 font-medium text-white hover:bg-white/10">
            Xem thực đơn
          </Link>
        </div>
      </section>

      <section aria-labelledby="featured-title" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="featured-title" className="text-h3">
            Món nổi bật
          </h2>
          <Link to={categoryId ? `${PATHS.menu}?category=${categoryId}` : PATHS.menu} className="text-body font-semibold text-primary-600 hover:underline">
            Xem tất cả
          </Link>
        </div>

        {categories.data && categories.data.length > 0 && <CategoryChips categories={categories.data} activeId={categoryId} onChange={setCategoryId} />}

        {menu.isPending && <MenuSkeleton />}
        {menu.isError && <MenuError error={menu.error} onRetry={() => void menu.refetch()} />}
        {menu.isSuccess && featured.length === 0 && <MenuEmpty>Danh mục này hiện chưa có món để hiển thị.</MenuEmpty>}
        {featured.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {featured.map((p) => (
              <ProductTile key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="how-title" className="space-y-4">
        <h2 id="how-title" className="text-h3">
          Gọi món tại bàn
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flex gap-3 rounded-xl border border-primary-100 bg-white p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary-600">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-semibold text-gray-900">
                  {i + 1}. {title}
                </p>
                <p className="text-body text-gray-600">{text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="rounded-xl bg-primary-100 p-4 text-body text-primary-900">
          Bạn đang ở quán? Quét mã QR trên bàn để bắt đầu, hoặc{" "}
          <Link to={PATHS.start} className="font-semibold underline">
            nhập mã bàn
          </Link>
          .
        </p>
      </section>

      <section aria-labelledby="exp-title" className="space-y-2">
        <h2 id="exp-title" className="text-h3">
          Trải nghiệm tại Smart Cafe
        </h2>
        <p className="text-body-lg text-gray-700">
          Thực đơn đồ uống và bánh ngọt được cập nhật trực tiếp từ quầy: món nào hết sẽ được ẩn đi, bạn chỉ thấy những món có thể gọi ngay. Đặt món bằng điện thoại để bớt chờ đợi, dành thời gian cho ly cà phê của mình.
        </p>
      </section>

      <footer className="border-t border-primary-100 pt-4 text-center text-caption text-gray-500">
        <p className="font-medium text-gray-700">Smart Cafe</p>
        <nav aria-label="Liên kết chân trang" className="mt-1 flex justify-center gap-4">
          <Link to={PATHS.menu} className="hover:underline">
            Thực đơn
          </Link>
          <Link to={PATHS.start} className="hover:underline">
            Đặt món
          </Link>
          {!authed && (
            <Link to={PATHS.login} className="hover:underline">
              Đăng nhập
            </Link>
          )}
        </nav>
      </footer>
    </div>
  );
}
