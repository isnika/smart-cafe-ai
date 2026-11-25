import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  Coffee,
  Building2,
  QrCode,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Package,
  ScanLine,
  Sparkles,
  Users,
  CalendarDays,
  Tags,
} from "lucide-react";
import type { ComponentType } from "react";
import { useAuthStore } from "@/features/auth/store";
import { useActiveOrderCount } from "@/features/order-queue/hooks/useOrders";
import type { RoleName } from "@/shared/types";
import { Button } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
  badge?: number;
}

const navByRole: Record<Exclude<RoleName, "Customer">, NavItem[]> = {
  Staff: [
    { to: "/staff", label: "Tổng quan", icon: LayoutDashboard, end: true },
    { to: "/staff/queue", label: "Hàng đợi đơn", icon: ClipboardList },
    { to: "/staff/tables", label: "Bàn & phiên", icon: LayoutGrid },
    { to: "/staff/checkin", label: "Check-in QR", icon: ScanLine },
    { to: "/staff/leave", label: "Lịch & nghỉ phép", icon: CalendarDays },
  ],
  Manager: [
    { to: "/manager", label: "Tổng quan", icon: LayoutDashboard, end: true },
    { to: "/manager/orders", label: "Đơn hàng", icon: ClipboardList },
    { to: "/manager/inventory", label: "Kho", icon: Package },
    { to: "/manager/ingredients", label: "Nguyên liệu", icon: Boxes },
    { to: "/manager/forecast", label: "Dự báo AI", icon: Sparkles },
    { to: "/manager/leave-requests", label: "Duyệt nghỉ phép", icon: CalendarDays },
    { to: "/manager/schedules", label: "Ca làm việc", icon: CalendarDays },
  ],
  Admin: [
    { to: "/admin", label: "Tổng quan", icon: LayoutDashboard, end: true },
    { to: "/admin/revenue", label: "Doanh thu", icon: BarChart3 },
    { to: "/admin/orders", label: "Đơn hàng", icon: ClipboardList },
    { to: "/admin/branches", label: "Chi nhánh", icon: Building2 },
    { to: "/admin/tables", label: "Bàn & QR", icon: QrCode },
    { to: "/admin/products", label: "Sản phẩm", icon: Coffee },
    { to: "/admin/categories", label: "Danh mục", icon: Tags },
    { to: "/admin/menus", label: "Thực đơn chi nhánh", icon: ClipboardList },
    { to: "/admin/ingredients", label: "Nguyên liệu", icon: Boxes },
    { to: "/admin/users", label: "Tài khoản & Quyền", icon: Users },
    { to: "/admin/schedules", label: "Ca làm việc", icon: CalendarDays },
  ],
};

const roleLabel: Record<Exclude<RoleName, "Customer">, string> = {
  Staff: "Nhân viên",
  Manager: "Quản lý",
  Admin: "Quản trị",
};

function NavItems({
  items,
  horizontal,
}: {
  items: NavItem[];
  horizontal?: boolean;
}) {
  return (
    <>
      {items.map(({ to, label, icon: Icon, end, badge }) => (
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
          {badge ? (
            <span
              aria-label={`${badge} đơn đang hoạt động`}
              className="ml-auto rounded-full bg-accent-500 px-2 py-0.5 text-caption font-semibold text-white"
            >
              {badge}
            </span>
          ) : null}
        </NavLink>
      ))}
    </>
  );
}

/** Khung chung cho Staff / Manager / Admin: Sidebar (desktop) + nội dung. Menu đổi theo vai trò. */
export function StaffShellLayout() {
  const user = useAuthStore((s) => s.user);
  const roleName = useAuthStore((s) => s.roleName);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const activeOrders = useActiveOrderCount(roleName === "Staff");

  if (!user || !roleName || roleName === "Customer") return null;
  const items = navByRole[roleName].map((i) =>
    i.to === "/staff/queue" && activeOrders.data ? { ...i, badge: activeOrders.data } : i,
  );

  const logoutButton = (
    <Button
      variant="ghost"
      size="sm"
      leftIcon={<LogOut className="size-4" />}
      onClick={() => {
        void logout();
        navigate("/login");
      }}
    >
      Đăng xuất
    </Button>
  );

  return (
    <div className="min-h-screen bg-primary-50 md:flex">
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-60 md:flex-col md:border-r md:border-primary-100 md:bg-white md:p-4">
        <div className="mb-5 flex items-center gap-3 px-1">
          <span className="grid size-10 place-items-center rounded-lg bg-primary-600 text-white">
            <Coffee className="size-5" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="font-heading font-semibold text-gray-900">Smart Cafe</p>
            <p className="text-caption uppercase tracking-wide text-primary-700">{roleLabel[roleName]} portal</p>
          </div>
        </div>
        <nav aria-label="Điều hướng nhân viên" className="flex flex-col gap-1">
          <NavItems items={items} />
        </nav>
        <div className="mt-auto border-t border-primary-100 pt-3">
          <p className="truncate px-1 font-medium text-gray-900">{user.fullName}</p>
          <p className="px-1 text-caption text-gray-500">{roleLabel[roleName]}</p>
          <div className="mt-1">{logoutButton}</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:ml-60">
        {/* Thanh trên chỉ hiện ở màn hình nhỏ (desktop đã có sidebar) */}
        <header className="flex items-center justify-between bg-white px-4 py-3 shadow-sticky md:hidden">
          <div>
            <p className="font-medium">{user.fullName}</p>
            <p className="text-caption text-gray-500">{roleLabel[roleName]}</p>
          </div>
          {logoutButton}
        </header>
        <nav aria-label="Điều hướng nhân viên" className="flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-2 py-2 md:hidden">
          <NavItems items={items} horizontal />
        </nav>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
