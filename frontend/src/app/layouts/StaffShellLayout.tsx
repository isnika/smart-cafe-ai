import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  ClipboardList,
  Coffee,
  LayoutDashboard,
  LogOut,
  Package,
  ScanLine,
  Sparkles,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import { useAuthStore, type Role } from "@/features/auth/store";
import { Button } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
}

const navByRole: Record<Exclude<Role, "customer">, NavItem[]> = {
  staff: [
    { to: "/staff", label: "Tổng quan", icon: LayoutDashboard, end: true },
    { to: "/staff/queue", label: "Hàng đợi đơn", icon: ClipboardList },
    { to: "/staff/checkin", label: "Check-in QR", icon: ScanLine },
  ],
  manager: [
    { to: "/manager", label: "Tổng quan", icon: LayoutDashboard, end: true },
    { to: "/manager/inventory", label: "Kho", icon: Package },
    { to: "/manager/forecast", label: "Dự báo AI", icon: Sparkles },
  ],
  admin: [
    { to: "/admin", label: "Tổng quan", icon: LayoutDashboard, end: true },
    { to: "/admin/users", label: "Người dùng", icon: Users },
  ],
};

const roleLabel = { staff: "Nhân viên", manager: "Quản lý", admin: "Quản trị" };

function NavItems({
  items,
  horizontal,
}: {
  items: NavItem[];
  horizontal?: boolean;
}) {
  return (
    <>
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-body whitespace-nowrap",
              isActive
                ? "bg-primary-100 font-medium text-primary-800"
                : "text-gray-600 hover:bg-gray-100",
              horizontal && "shrink-0",
            )
          }
        >
          <Icon className="size-4" />
          {label}
        </NavLink>
      ))}
    </>
  );
}

/** Khung chung cho Staff / Manager / Admin: Sidebar (desktop) + Topbar. Menu đổi theo vai trò. */
export function StaffShellLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  if (!user || user.role === "customer") return null; // RequireRole đã chặn; dòng này chỉ để TypeScript thu hẹp kiểu
  const items = navByRole[user.role];

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-gray-200 bg-white p-3 md:flex">
        <div className="mb-3 flex items-center gap-2 px-3 py-2 font-heading text-h4 text-primary-700">
          <Coffee className="size-5" /> Smart Cafe
        </div>
        <NavItems items={items} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between bg-white px-4 py-3 shadow-sticky">
          <div>
            <p className="font-medium">{user.name}</p>
            <p className="text-caption text-gray-500">{roleLabel[user.role]}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<LogOut className="size-4" />}
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            Đăng xuất
          </Button>
        </header>

        {/* Menu ngang cho màn hình nhỏ */}
        <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-2 py-2 md:hidden">
          <NavItems items={items} horizontal />
        </nav>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
