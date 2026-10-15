import { lazy, Suspense } from "react";
import { createBrowserRouter, Link, type RouteObject } from "react-router-dom";
import { RequireRole } from "@/app/guards/RequireRole";
import { CustomerLayout } from "@/app/layouts/CustomerLayout";
import { StaffShellLayout } from "@/app/layouts/StaffShellLayout";
import { PATHS } from "@/app/routes";
import LoginPage from "@/pages/auth/LoginPage";
import PlaceholderPage from "@/pages/PlaceholderPage";

const P = PlaceholderPage;

// Tải lười để trang này không đi vào bundle production
const DesignSystemPage = lazy(() => import("@/pages/DesignSystemPage"));

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
  ? [
      {
        path: "/design-system",
        element: (
          <Suspense fallback={null}>
            <DesignSystemPage />
          </Suspense>
        ),
      },
    ]
  : [];

export const router = createBrowserRouter([
  // ── Auth (spec #1–5, CORE) ──────────────────────────────────────────
  { path: PATHS.login, element: <LoginPage /> },
  {
    path: PATHS.register,
    element: <P title="Đăng ký" note="Register + OTP" />,
  },
  { path: PATHS.verifyOtp, element: <P title="Xác thực OTP" /> },
  { path: PATHS.forgotPassword, element: <P title="Quên mật khẩu" /> },
  ...devRoutes,

  // ── Khách ───────────────────────────────────────────────────────────
  // Dine-in và duyệt menu: không cần đăng nhập (quét QR tại bàn vẫn đặt món được).
  // Online checkout, đơn hàng, hồ sơ: cần đăng nhập.
  {
    element: <CustomerLayout />,
    children: [
      {
        path: PATHS.start,
        element: (
          <P
            title="Chọn hình thức đặt món"
            note="Order Mode Selection: Dine-in hoặc Online"
          />
        ),
      },
      {
        path: PATHS.home,
        element: <P title="Trang chủ" note="Có CTA Đặt món" />,
      },
      { path: PATHS.menu, element: <P title="Thực đơn" /> },
      { path: PATHS.product, element: <P title="Chi tiết sản phẩm" /> },
      {
        path: PATHS.cart,
        element: (
          <P
            title="Giỏ hàng"
            note="Badge chế độ dine-in / giao hàng / mang đi"
          />
        ),
      },

      // Dine-in
      {
        path: PATHS.dineInTable,
        element: (
          <P
            title="Menu tại bàn"
            note="QR Ordering Page + Order Status Mini Card"
          />
        ),
      },
      {
        path: PATHS.dineInCheckout,
        element: (
          <P
            title="Thanh toán tại bàn"
            note="Không địa chỉ; chọn Online / Tại quầy"
          />
        ),
      },
      {
        path: PATHS.counterPayment,
        element: (
          <P
            title="Mã QR thanh toán tại quầy"
            note="QR tĩnh chứa order_id + countdown UI"
          />
        ),
      },
      { path: PATHS.payment, element: <P title="Cổng thanh toán" /> },
      {
        path: PATHS.paymentSuccess,
        element: <P title="Thanh toán thành công" />,
      },

      // Cần đăng nhập
      {
        element: <RequireRole allow={["customer"]} />,
        children: [
          {
            path: PATHS.checkout,
            element: (
              <P title="Thanh toán đơn online" note="Địa chỉ / giờ nhận" />
            ),
          },
          { path: PATHS.orders, element: <P title="Đơn hàng của tôi" /> },
          {
            path: PATHS.order,
            element: (
              <P title="Theo dõi đơn" note="Timeline đầy đủ cho đơn online" />
            ),
          },
          { path: PATHS.profile, element: <P title="Hồ sơ & địa chỉ" /> },
        ],
      },
    ],
  },

  // ── Nhân viên / Quản lý / Quản trị ──────────────────────────────────
  // Guard nằm NGOÀI shell để người chưa đăng nhập không thấy khung sidebar trước khi bị chuyển hướng.
  {
    element: <RequireRole allow={["staff"]} />,
    children: [
      {
        element: <StaffShellLayout />,
        children: [
          {
            path: PATHS.staff,
            element: (
              <P title="Staff Dashboard" note="Tab Tổng quan và tab Thu ngân" />
            ),
          },
          { path: PATHS.staffQueue, element: <P title="Hàng đợi đơn" /> },
          {
            path: PATHS.staffOrder,
            element: (
              <P title="Chi tiết đơn" note="Mở Bill Modal / Cancel Popup" />
            ),
          },
          { path: PATHS.staffCheckin, element: <P title="Check-in QR" /> },
        ],
      },
    ],
  },
  {
    element: <RequireRole allow={["manager"]} />,
    children: [
      {
        element: <StaffShellLayout />,
        children: [
          { path: PATHS.manager, element: <P title="Manager Dashboard" /> },
          { path: PATHS.managerInventory, element: <P title="Kho" /> },
          { path: PATHS.managerForecast, element: <P title="Dự báo AI" /> },
        ],
      },
    ],
  },
  {
    element: <RequireRole allow={["admin"]} />,
    children: [
      {
        element: <StaffShellLayout />,
        children: [
          { path: PATHS.admin, element: <P title="Admin Dashboard" /> },
          { path: PATHS.adminUsers, element: <P title="Quản lý người dùng" /> },
          {
            path: PATHS.adminTables,
            element: <P title="Bàn & QR" note="Có nút Tạo QR ca hôm nay" />,
          },
        ],
      },
    ],
  },

  { path: "*", element: <NotFound /> },
]);
