import { NavLink, Outlet } from "react-router-dom";
import { Bot, ClipboardList, Coffee, Home, ShoppingCart, User } from "lucide-react";
import { PATHS } from "@/app/routes";
import { countItems } from "@/features/dine-in/cart";
import { useDineInCartStore } from "@/features/dine-in/store";
import { cn } from "@/shared/lib/cn";

const tabs = [
  { to: PATHS.home, label: "Trang chủ", icon: Home },
  { to: PATHS.menu, label: "Menu", icon: Coffee },
  { to: PATHS.cart, label: "Giỏ hàng", icon: ShoppingCart },
  { to: PATHS.orders, label: "Đơn hàng", icon: ClipboardList },
  { to: PATHS.profile, label: "Cá nhân", icon: User },
];

/** Khung cho khách: nội dung + bottom-nav + nút chat AI nổi. Khách chưa đăng nhập vẫn vào được. */
export function CustomerLayout() {
  const cartCount = useDineInCartStore((s) => countItems(s.lines));
  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-primary-50">
      <main className="pb-24">
        <Outlet />
      </main>

      {/* Placeholder: sẽ thay bằng <FloatingChatBox /> ở bước cuối */}
      <button
        type="button"
        aria-label="Mở trợ lý AI"
        className="fixed bottom-20 right-4 z-30 flex size-14 items-center justify-center rounded-full bg-ai-gradient text-white shadow-dropdown animate-ai-pulse"
      >
        <Bot className="size-6" />
      </button>

      <nav
        aria-label="Điều hướng chính"
        className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-2xl border-t border-primary-100 bg-white"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-caption", isActive ? "font-semibold text-primary-600" : "text-gray-500")
            }
          >
            <span className="relative">
              <Icon className="size-5" aria-hidden />
              {to === PATHS.cart && cartCount > 0 && (
                <span
                  aria-label={`${cartCount} món trong giỏ`}
                  className="absolute -right-2 -top-2 grid min-w-4 place-items-center rounded-full bg-accent-500 px-1 text-[10px] font-bold leading-4 text-white"
                >
                  {cartCount}
                </span>
              )}
            </span>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
