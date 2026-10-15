import { createBrowserRouter, Link, type RouteObject } from "react-router-dom";
import { RequireRole } from "@/app/guards/RequireRole";
import { CustomerLayout } from "@/app/layouts/CustomerLayout";
import { StaffShellLayout } from "@/app/layouts/StaffShellLayout";
import LoginPage from "@/pages/auth/LoginPage";
import PlaceholderPage from "@/pages/PlaceholderPage";
import DesignSystemPage from "@/pages/DesignSystemPage";

const P = PlaceholderPage;

function NotFound() {
  return (
    <div className="p-6">
      <h1 className="text-h2">Không tìm thấy trang</h1>
      <Link to="/" className="text-primary-600 underline">
        Về trang chủ
      </Link>
    </div>
  );
}

// Trang xem design system: chỉ tồn tại khi chạy dev
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: "/design-system", element: <DesignSystemPage /> }]
  : [];

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  ...devRoutes,

  // Khách: không bắt buộc đăng nhập (quét QR tại bàn vẫn đặt món được)
  {
    element: <CustomerLayout />,
    children: [
      {
        path: "/",
        element: (
          <P
            title="Chọn hình thức đặt món"
            note="Order Mode Selection: Dine-in hoặc Online"
          />
        ),
      },
      { path: "/menu", element: <P title="Thực đơn" /> },
      { path: "/cart", element: <P title="Giỏ hàng" /> },
      { path: "/orders", element: <P title="Đơn hàng của tôi" /> },
    ],
  },

  // Nhân viên / Quản lý / Quản trị: dùng chung khung, mỗi vai trò một khu vực riêng
  {
    element: <StaffShellLayout />,
    children: [
      {
        element: <RequireRole allow={["staff"]} />,
        children: [
          {
            path: "/staff",
            element: (
              <P title="Staff Dashboard" note="Tab Tổng quan và tab Thu ngân" />
            ),
          },
          { path: "/staff/queue", element: <P title="Hàng đợi đơn" /> },
          { path: "/staff/checkin", element: <P title="Check-in QR" /> },
        ],
      },
      {
        element: <RequireRole allow={["manager"]} />,
        children: [
          { path: "/manager", element: <P title="Manager Dashboard" /> },
          { path: "/manager/inventory", element: <P title="Kho" /> },
          { path: "/manager/forecast", element: <P title="Dự báo AI" /> },
        ],
      },
      {
        element: <RequireRole allow={["admin"]} />,
        children: [
          { path: "/admin", element: <P title="Admin Dashboard" /> },
          { path: "/admin/users", element: <P title="Quản lý người dùng" /> },
        ],
      },
    ],
  },

  { path: "*", element: <NotFound /> },
]);
