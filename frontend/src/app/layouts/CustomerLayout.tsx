import { NavLink, Outlet } from "react-router-dom";
import { Bot, Coffee, Receipt, ShoppingCart } from "lucide-react";
import { cn } from "@/shared/lib/cn";

const tabs = [
  { to: "/menu", label: "Thực đơn", icon: Coffee },
  { to: "/cart", label: "Giỏ hàng", icon: ShoppingCart },
  { to: "/orders", label: "Đơn hàng", icon: Receipt },
];

/** Khung cho khách: nội dung + bottom-nav + nút chat AI nổi. Khách chưa đăng nhập vẫn vào được. */
export function CustomerLayout() {
  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-gray-50">
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
        className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-2xl border-t border-gray-200 bg-white"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-caption",
                isActive ? "font-medium text-primary-600" : "text-gray-500",
              )
            }
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
