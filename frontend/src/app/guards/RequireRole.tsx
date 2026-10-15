import { Navigate, Outlet, useLocation } from "react-router-dom";
import { roleHome, useAuthStore, type Role } from "@/features/auth/store";

/**
 * Route layout: bọc các route con cần đăng nhập và đúng vai trò.
 * - Chưa đăng nhập  -> /login (nhớ trang đang vào để quay lại)
 * - Sai vai trò     -> về trang chủ của chính vai trò đó
 */
export function RequireRole({ allow }: { allow: Role[] }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!user)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!allow.includes(user.role))
    return <Navigate to={roleHome[user.role]} replace />;
  return <Outlet />;
}
