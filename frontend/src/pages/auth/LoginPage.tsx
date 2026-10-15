import { useLocation, useNavigate } from "react-router-dom";
import {
  roleHome,
  useAuthStore,
  type AuthUser,
  type Role,
} from "@/features/auth/store";
import { Button, Card } from "@/shared/ui";

const demoUsers: Record<Role, AuthUser> = {
  customer: { id: "u-customer", name: "Khách Demo", role: "customer" },
  staff: { id: "u-staff", name: "Nhân viên Demo", role: "staff" },
  manager: { id: "u-manager", name: "Quản lý Demo", role: "manager" },
  admin: { id: "u-admin", name: "Admin Demo", role: "admin" },
};

/**
 * TẠM THỜI: đăng nhập giả để thử guard theo vai trò.
 * Sẽ thay bằng form Login/OTP thật ở bước Auth.
 */
export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;

  function signIn(role: Role) {
    login(demoUsers[role]);
    navigate(from ?? roleHome[role], { replace: true });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm items-center p-4">
      <Card padding="lg" className="w-full space-y-3">
        <h1 className="text-h2">Đăng nhập thử</h1>
        <p className="text-gray-500">Chọn vai trò để kiểm tra phân quyền.</p>
        <Button fullWidth variant="outline" onClick={() => signIn("customer")}>
          Khách hàng
        </Button>
        <Button fullWidth onClick={() => signIn("staff")}>
          Nhân viên
        </Button>
        <Button fullWidth variant="secondary" onClick={() => signIn("manager")}>
          Quản lý
        </Button>
        <Button fullWidth variant="ghost" onClick={() => signIn("admin")}>
          Quản trị
        </Button>
      </Card>
    </main>
  );
}
