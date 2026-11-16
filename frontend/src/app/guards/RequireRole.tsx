import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/features/auth/store";
import { roleHome } from "@/app/routes";
import type { RoleName } from "@/shared/types";

/**
 * Route layout: bọc các route con cần đăng nhập và đúng vai trò.
 * - Đang xác nhận phiên (reload)  -> loading, KHÔNG chuyển hướng
 * - Chưa đăng nhập                -> /login (nhớ trang đang vào để quay lại)
 * - Sai vai trò                   -> về trang chủ của chính vai trò đó
 */
export function RequireRole({ allow }: { allow: RoleName[] }) {
  const status = useAuthStore((s) => s.status);
  const roleName = useAuthStore((s) => s.roleName);
  const location = useLocation();

  if (status === "booting") {
    return (
      <div
        role="status"
        aria-label="Đang tải"
        className="grid min-h-screen place-items-center text-gray-500"
      >
        Đang tải…
      </div>
    );
  }

  if (status === "anonymous" || !roleName) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  if (!allow.includes(roleName)) {
    return <Navigate to={roleHome[roleName]} replace />;
  }

  return <Outlet />;
}
