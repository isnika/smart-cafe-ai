import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertCircle, ArrowDownToLine, Building2, ChevronLeft, ChevronRight, CircleHelp, Coffee, LoaderCircle, Plus, QrCode, RefreshCw, Search, Shield, Users } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Badge, Button, Card, Input, Modal } from "@/shared/ui";
import * as api from "@/shared/api/admin";
import { isApiError } from "@/shared/api/http";

const keys = {
  branches: ["admin", "branches"] as const,
  tables: ["admin", "tables"] as const,
  roles: ["admin", "roles"] as const,
  users: ["admin", "users"] as const,
};
const displayError = (e: unknown) => (e instanceof Error ? e.message : "Đã xảy ra lỗi khi kết nối máy chủ.");
type FormFailure = { global?: string; fields: Record<string, string> };
const fieldAliases: Record<string, string> = {
  full_name: "fullName",
  role_id: "roleId",
  branch_id: "branchId",
  employee_code: "employeeCode",
  job_title: "jobTitle",
  employment_type: "employmentType",
  hire_date: "hireDate",
  table_number: "tableNumber",
  opening_time: "openingTime",
  closing_time: "closingTime",
  delivery_radius_km: "deliveryRadiusKm",
  delivery_fee: "deliveryFee",
  accepts_online_orders: "acceptsOnlineOrders",
};
function parseFormFailure(error: unknown): FormFailure {
  const fields: Record<string, string> = {};
  if (!isApiError(error)) return { global: displayError(error), fields };
  const details = error.details;
  const entries = Array.isArray(details) ? details : details && typeof details === "object" ? Object.entries(details as Record<string, unknown>).map(([field, issue]) => ({ field, issue })) : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as {
      field?: unknown;
      issue?: unknown;
      message?: unknown;
    };
    if (typeof item.field !== "string") continue;
    const rawField = item.field.split(".").at(-1) ?? item.field;
    const field = fieldAliases[rawField] ?? rawField.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const message = typeof item.issue === "string" ? item.issue : typeof item.message === "string" ? item.message : "Giá trị không hợp lệ";
    fields[field] = fields[field] ? `${fields[field]}; ${message}` : message;
  }
  return { global: error.message || undefined, fields };
}
function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-error/30 bg-error-soft/40 px-3 py-2 text-sm text-error-strong">
      {message}
    </div>
  );
}
const PageHeading = ({ eyebrow = "QUẢN TRỊ", title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) => (
  <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-primary-700">{eyebrow}</p>
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-gray-900">{title}</h1>
      {description && <p className="mt-2 max-w-2xl text-sm text-gray-500">{description}</p>}
    </div>
    {action}
  </div>
);
const CardHeading = ({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) => (
  <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 className="font-heading text-lg font-semibold text-gray-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
    </div>
    {action}
  </div>
);
const ErrorState = ({ error, retry }: { error: unknown; retry: () => void }) => (
  <div className="flex flex-col items-center rounded-xl border border-error/20 bg-error-soft/30 px-6 py-10 text-center">
    <AlertCircle className="mb-3 size-8 text-error" />
    <p className="font-semibold text-gray-900">Không tải được dữ liệu</p>
    <p className="mt-1 max-w-lg text-sm text-gray-600">{displayError(error)}</p>
    <Button className="mt-4" variant="outline" leftIcon={<RefreshCw className="size-4" />} onClick={retry}>
      Thử lại
    </Button>
  </div>
);
const EmptyState = ({ title, message, icon: Icon = CircleHelp }: { title: string; message: string; icon?: typeof CircleHelp }) => (
  <div className="flex flex-col items-center px-6 py-12 text-center">
    <span className="mb-4 grid size-12 place-items-center rounded-xl bg-primary-50 text-primary-700">
      <Icon className="size-5" />
    </span>
    <p className="font-semibold text-gray-900">{title}</p>
    <p className="mt-1 max-w-md text-sm text-gray-500">{message}</p>
  </div>
);
function useAdminBranches() {
  return useQuery({
    queryKey: keys.branches,
    queryFn: ({ signal }) => api.listAdminBranches(signal),
  });
}
function Stat({ label, value, note, icon: Icon }: { label: string; value: string | number; note: string; icon: typeof Coffee }) {
  return (
    <Card className="relative overflow-hidden border-0 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-3 font-heading text-3xl font-semibold tracking-tight text-gray-900">{value}</p>
          <p className="mt-1 text-xs text-gray-500">{note}</p>
        </div>
        <span className="grid size-10 place-items-center rounded-xl bg-primary-50 text-primary-700">
          <Icon className="size-5" />
        </span>
      </div>
    </Card>
  );
}

export function AdminDashboardPage() {
  const branches = useAdminBranches();
  const roles = useQuery({ queryKey: keys.roles, queryFn: api.listAdminRoles });
  const activeBranches = branches.data?.filter((b) => b.status.toLowerCase() === "active").length;
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeading title="Trung tâm quản trị" description="Tình hình hệ thống Smart Cafe và các công cụ quản trị." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Chi nhánh" value={branches.isPending ? "—" : branches.isError ? "!" : branches.data.length} note={branches.isPending ? "Đang tải dữ liệu" : branches.isError ? "Không thể kết nối" : `${activeBranches} đang hoạt động`} icon={Building2} />
        <Stat label="Vai trò hệ thống" value={roles.isPending ? "—" : roles.isError ? "!" : roles.data.length} note={roles.isError ? "Không thể kết nối" : "Được quản lý bởi Identity API"} icon={Shield} />
        <Stat label="Bàn đang phục vụ" value="—" note="Chọn chi nhánh để xem dữ liệu" icon={Coffee} />
        <Stat label="Tình trạng dịch vụ" value="—" note="Backend chưa cung cấp API giám sát" icon={Activity} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="p-6">
          <CardHeading
            title="Chi nhánh"
            description="Dữ liệu trực tiếp từ Branch API."
            action={
              <Link className="text-sm font-semibold text-primary-700 hover:text-primary-800" to="/admin/branches">
                Quản lý chi nhánh →
              </Link>
            }
          />
          {branches.isPending ? (
            <Loading />
          ) : branches.isError ? (
            <ErrorState error={branches.error} retry={() => void branches.refetch()} />
          ) : branches.data.length === 0 ? (
            <EmptyState title="Chưa có chi nhánh" message="Các chi nhánh sẽ xuất hiện sau khi được tạo." icon={Building2} />
          ) : (
            <div className="divide-y divide-gray-100">
              {branches.data.slice(0, 5).map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900">{b.name}</p>
                    <p className="mt-1 truncate text-sm text-gray-500">{b.address}</p>
                  </div>
                  <Badge tone={b.status.toLowerCase() === "active" ? "success" : "neutral"}>{b.status.toLowerCase() === "active" ? "Đang hoạt động" : "Tạm ngừng"}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-6">
          <CardHeading title="Truy cập nhanh" description="Đi đến công cụ quản trị." />
          <div className="grid gap-3">
            {[
              {
                to: "/admin/users",
                label: "Tài khoản & phân quyền",
                icon: Users,
              },
              { to: "/admin/tables", label: "Quản lý bàn & QR", icon: QrCode },
            ].map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className="group flex items-center gap-3 rounded-xl border border-gray-100 p-4 transition hover:border-primary-200 hover:bg-primary-50">
                <span className="grid size-10 place-items-center rounded-lg bg-gray-50 text-gray-600 group-hover:bg-white group-hover:text-primary-700">
                  <Icon className="size-5" />
                </span>
                <span className="flex-1 font-medium text-gray-800">{label}</span>
                <ChevronRight className="size-4 text-gray-400" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
      <p className="mt-5 flex items-center gap-2 text-xs text-gray-500">
        <Shield className="size-3.5" />
        Số liệu chỉ hiển thị khi API tương ứng có dữ liệu thực.
      </p>
    </div>
  );
}

function BranchForm({ initial, onClose }: { initial?: api.AdminBranch; onClose: () => void }) {
  const qc = useQueryClient();
  const [failure, setFailure] = useState<FormFailure>({ fields: {} });
  const mutation = useMutation({
    mutationFn: (v: api.BranchInput) => (initial ? api.updateAdminBranch(initial.id, v) : api.createAdminBranch(v)),
    onSuccess: () => {
      toast.success(initial ? "Đã cập nhật chi nhánh" : "Đã tạo chi nhánh");
      void qc.invalidateQueries({ queryKey: keys.branches });
      onClose();
    },
    onError: (e) => setFailure(parseFormFailure(e)),
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setFailure({ fields: {} });
        mutation.mutate({
          code: String(f.get("code")),
          name: String(f.get("name")),
          address: String(f.get("address")),
          phone: String(f.get("phone") || ""),
          timezone: String(f.get("timezone") || "Asia/Ho_Chi_Minh"),
          openingTime: `${f.get("openingTime")}:00`,
          closingTime: `${f.get("closingTime")}:00`,
          acceptsOnlineOrders: f.get("acceptsOnlineOrders") === "on",
          deliveryRadiusKm: Number(f.get("deliveryRadiusKm") || 0),
          deliveryFee: Number(f.get("deliveryFee") || 0),
        });
      }}
    >
      <FormError message={failure.global} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input name="code" label="Mã chi nhánh" defaultValue={initial?.code} required maxLength={20} error={failure.fields.code} />
        <Input name="name" label="Tên chi nhánh" defaultValue={initial?.name} required error={failure.fields.name} />
        <Input name="address" label="Địa chỉ" className="sm:col-span-2" defaultValue={initial?.address} required error={failure.fields.address} />
        <Input name="phone" label="Số điện thoại" defaultValue={initial?.phone ?? ""} error={failure.fields.phone} />
        <Input name="timezone" label="Múi giờ" defaultValue={initial?.timezone ?? "Asia/Ho_Chi_Minh"} error={failure.fields.timezone} />
        <Input name="openingTime" type="time" label="Giờ mở cửa" defaultValue={initial?.openingTime?.slice(0, 5) ?? "07:00"} error={failure.fields.openingTime} />
        <Input name="closingTime" type="time" label="Giờ đóng cửa" defaultValue={initial?.closingTime?.slice(0, 5) ?? "22:00"} error={failure.fields.closingTime} />
        <Input name="deliveryRadiusKm" type="number" min="0" step="0.1" label="Bán kính giao hàng (km)" defaultValue={initial?.deliveryRadiusKm ?? 0} error={failure.fields.deliveryRadiusKm} />
        <Input name="deliveryFee" type="number" min="0" step="1000" label="Phí giao hàng (₫)" defaultValue={initial?.deliveryFee ?? 0} error={failure.fields.deliveryFee} />
      </div>
      <label className="flex items-center gap-2 rounded-lg bg-gray-50 p-3 text-sm">
        <input name="acceptsOnlineOrders" type="checkbox" defaultChecked={initial?.acceptsOnlineOrders ?? true} className="size-4 accent-primary-600" />
        Nhận đơn hàng trực tuyến
      </label>
      <div className="flex justify-end gap-2 pt-3">
        <Button variant="outline" onClick={onClose}>
          Hủy
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          {initial ? "Lưu thay đổi" : "Tạo chi nhánh"}
        </Button>
      </div>
    </form>
  );
}

export function AdminBranchesPage() {
  const q = useAdminBranches();
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [form, setForm] = useState<api.AdminBranch | null | undefined>(undefined);
  const toggle = useMutation({
    mutationFn: (b: api.AdminBranch) => api.updateAdminBranchStatus(b.id, b.status.toLowerCase() === "active" ? "Inactive" : "Active"),
    onSuccess: () => {
      toast.success("Đã cập nhật trạng thái");
      void qc.invalidateQueries({ queryKey: keys.branches });
    },
    onError: (e) => toast.error(displayError(e)),
  });
  const rows = useMemo(() => q.data?.filter((b) => (status === "all" || b.status.toLowerCase() === status) && `${b.name} ${b.code} ${b.address}`.toLowerCase().includes(term.toLowerCase())) ?? [], [q.data, status, term]);
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeading
        title="Chi nhánh"
        description="Quản lý địa điểm, giờ hoạt động và dịch vụ của từng cửa hàng."
        action={
          <Button leftIcon={<Plus className="size-4" />} onClick={() => setForm(null)}>
            Thêm chi nhánh
          </Button>
        }
      />
      <Card className="mb-5 flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[220px] flex-1">
          <Input aria-label="Tìm chi nhánh" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Tên, mã hoặc địa chỉ chi nhánh" leftIcon={<Search aria-hidden />} />
        </div>
        <select aria-label="Lọc trạng thái" value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm">
          <option value="all">Tất cả trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Tạm ngừng</option>
        </select>
        <Button variant="outline" leftIcon={<RefreshCw className="size-4" />} onClick={() => void q.refetch()}>
          Làm mới
        </Button>
      </Card>
      <Card padding="none" className="overflow-hidden">
        {q.isPending ? (
          <Loading />
        ) : q.isError ? (
          <div className="p-5">
            <ErrorState error={q.error} retry={() => void q.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="Không có chi nhánh phù hợp" message={q.data?.length ? "Thử thay đổi từ khóa hoặc bộ lọc." : "Tạo chi nhánh đầu tiên để bắt đầu quản lý hệ thống."} icon={Building2} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  {["Chi nhánh", "Địa chỉ", "Liên hệ", "Giờ hoạt động", "Trạng thái", "Thao tác"].map((h) => (
                    <th key={h} className="px-5 py-3.5 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50/70">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-gray-900">{b.name}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {b.code} · #{b.id}
                      </p>
                    </td>
                    <td className="max-w-[280px] px-5 py-4 text-gray-600">{b.address}</td>
                    <td className="px-5 py-4 text-gray-600">{b.phone || "—"}</td>
                    <td className="px-5 py-4 text-gray-600">
                      {b.openingTime?.slice(0, 5) || "—"} – {b.closingTime?.slice(0, 5) || "—"}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={b.status.toLowerCase() === "active" ? "success" : "neutral"}>{b.status.toLowerCase() === "active" ? "Đang hoạt động" : "Tạm ngừng"}</Badge>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setForm(b)}>
                          Chỉnh sửa
                        </Button>
                        <Button size="sm" variant="ghost" loading={toggle.isPending && toggle.variables?.id === b.id} onClick={() => toggle.mutate(b)}>
                          {b.status.toLowerCase() === "active" ? "Tạm ngừng" : "Kích hoạt"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal open={form !== undefined} onClose={() => setForm(undefined)} title={form ? "Chỉnh sửa chi nhánh" : "Tạo chi nhánh"}>
        <BranchForm initial={form ?? undefined} onClose={() => setForm(undefined)} />
      </Modal>
    </div>
  );
}

export function AdminTablesPage() {
  const branches = useAdminBranches();
  const [branchId, setBranchId] = useState<number | null>(null);
  const activeId = branchId ?? branches.data?.[0]?.id ?? null;
  const qc = useQueryClient();
  const tables = useQuery({
    queryKey: [...keys.tables, activeId],
    queryFn: ({ signal }) => api.listAdminTables(activeId!, signal),
    enabled: activeId !== null,
  });
  const [number, setNumber] = useState("");
  const [tableFailure, setTableFailure] = useState<FormFailure>({ fields: {} });
  const action = useMutation({
    mutationFn: async ({ type, t }: { type: "create" | "toggle" | "qr"; t?: api.AdminTable }) => {
      if (type === "create") return api.createAdminTable(activeId!, number.trim());
      if (type === "toggle" && t) return api.setAdminTableActive(t.id, !t.isActive);
      if (type === "qr" && t) return api.regenerateAdminTableQr(t.id);
    },
    onSuccess: () => {
      setNumber("");
      toast.success("Đã cập nhật bàn");
      void qc.invalidateQueries({ queryKey: keys.tables });
    },
    onError: (e) => setTableFailure(parseFormFailure(e)),
  });
  const saveBlob = async (fn: () => Promise<Blob>, filename: string) => {
    try {
      const blob = await fn();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast.error(displayError(e));
    }
  };
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeading title="Bàn & mã QR" description="Tạo bàn, theo dõi trạng thái và tải mã QR trực tiếp từ hệ thống." />
      <Card className="mb-5 flex flex-wrap items-center gap-3 p-4">
        <label htmlFor="admin-branch" className="text-sm font-semibold text-gray-700">
          Chi nhánh
        </label>
        {branches.isPending ? (
          <Loading />
        ) : branches.isError ? (
          <span className="text-sm text-error">{displayError(branches.error)}</span>
        ) : (
          <select id="admin-branch" aria-label="Chọn chi nhánh" value={activeId ?? ""} onChange={(e) => setBranchId(Number(e.target.value))} className="h-10 min-w-[240px] rounded-md border border-gray-200 bg-white px-3 text-sm">
            {branches.data.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <form
          className="ml-auto flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setTableFailure({ fields: {} });
            if (number.trim()) action.mutate({ type: "create" });
          }}
        >
          <Input aria-label="Số bàn mới" placeholder="Số bàn, ví dụ A-01" value={number} onChange={(e) => setNumber(e.target.value)} disabled={!activeId} error={tableFailure.fields.tableNumber} />
          <Button type="submit" loading={action.isPending} disabled={!activeId || !number.trim()} leftIcon={<Plus className="size-4" />}>
            Thêm bàn
          </Button>
          <FormError message={tableFailure.global} />
        </form>
        <Button variant="outline" disabled={!activeId || tables.isPending} leftIcon={<ArrowDownToLine className="size-4" />} onClick={() => activeId && void saveBlob(() => api.downloadAdminBranchQrPdf(activeId), `chi-nhanh-${activeId}-qr.pdf`)}>
          Xuất QR chi nhánh
        </Button>
      </Card>
      {tables.isPending ? (
        <Loading />
      ) : tables.isError ? (
        <ErrorState error={tables.error} retry={() => void tables.refetch()} />
      ) : !tables.data.length ? (
        <Card padding="none">
          <EmptyState title="Chưa có bàn tại chi nhánh này" message="Tạo bàn mới để sinh mã QR và bắt đầu phục vụ." icon={QrCode} />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex gap-3 text-sm text-gray-500">
            <span>{tables.data.length} bàn</span>
            <span>·</span>
            <span>{tables.data.filter((t) => t.isActive).length} đang hoạt động</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {tables.data.map((t) => (
              <Card key={t.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-heading text-lg font-semibold text-gray-900">Bàn {t.tableNumber}</p>
                    <p className="mt-1 text-xs text-gray-500">{t.branchName || branches.data?.find((b) => b.id === activeId)?.name}</p>
                  </div>
                  <Badge tone={t.isActive ? "success" : "neutral"}>{t.isActive ? "Đang phục vụ" : "Đã tắt"}</Badge>
                </div>
                <div className="my-5 flex justify-center rounded-xl border border-gray-100 bg-white p-3">
                  <QRCodeSVG value={`${window.location.origin}/dine-in/table/${encodeURIComponent(t.qrCode || String(t.id))}`} size={176} level="H" marginSize={2} title={`QR đặt món tại bàn ${t.tableNumber}`} />
                </div>
                <p className="mb-1 truncate text-center text-xs font-semibold text-gray-700">{t.qrCode || `Bàn ${t.tableNumber}`}</p>
                <p className="mb-4 text-center text-[11px] text-gray-400">Quét để mở menu tại bàn</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" leftIcon={<ArrowDownToLine className="size-3.5" />} onClick={() => void saveBlob(() => api.downloadAdminTableQr(t.id), `ban-${t.tableNumber}-qr.png`)}>
                    Tải QR
                  </Button>
                  <Button size="sm" variant="outline" loading={action.isPending && action.variables?.t?.id === t.id} onClick={() => action.mutate({ type: "qr", t })}>
                    Tạo lại QR
                  </Button>
                </div>
                <Button className="mt-2" size="sm" variant="ghost" fullWidth onClick={() => action.mutate({ type: "toggle", t })}>
                  {t.isActive ? "Tạm dừng bàn" : "Kích hoạt bàn"}
                </Button>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-12">
      <LoaderCircle className="size-6 animate-spin text-primary-600" />
    </div>
  );
}

function UserForm({ roles, onClose }: { roles: api.Role[]; onClose: () => void }) {
  const qc = useQueryClient();
  const branches = useAdminBranches();
  const [failure, setFailure] = useState<FormFailure>({ fields: {} });
  const m = useMutation({
    mutationFn: async (input: { user: api.AdminUserInput; profile?: Omit<api.StaffProfileInput, "userId"> }) => {
      const user = await api.createAdminUser(input.user);
      if (input.profile) await api.createStaffProfile({ ...input.profile, userId: user.id });
      return user;
    },
    onSuccess: () => {
      toast.success("Đã tạo tài khoản");
      void qc.invalidateQueries({ queryKey: keys.users });
      onClose();
    },
    onError: (e) => setFailure(parseFormFailure(e)),
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setFailure({ fields: {} });
        const branchId = Number(f.get("branchId")) || undefined;
        const employeeCode = String(f.get("employeeCode") || "").trim();
        const jobTitle = String(f.get("jobTitle") || "").trim();
        if (branchId && (!employeeCode || !jobTitle)) {
          setFailure({
            global: "Bổ sung hồ sơ nhân viên trước khi tạo tài khoản.",
            fields: {
              ...(!employeeCode
                ? {
                    employeeCode: "Mã nhân viên là bắt buộc khi chọn chi nhánh.",
                  }
                : {}),
              ...(!jobTitle ? { jobTitle: "Chức danh là bắt buộc khi chọn chi nhánh." } : {}),
            },
          });
          return;
        }
        const localDate = new Date();
        const hireDate = String(f.get("hireDate") || `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")}`);
        m.mutate({
          user: {
            fullName: String(f.get("fullName")),
            email: String(f.get("email")),
            phone: String(f.get("phone") || ""),
            password: String(f.get("password")),
            roleId: Number(f.get("roleId")),
            status: "Active",
          },
          profile: branchId
            ? {
                branchId,
                employeeCode,
                jobTitle,
                employmentType: String(f.get("employmentType")) as api.StaffProfileInput["employmentType"],
                hireDate,
              }
            : undefined,
        });
      }}
    >
      <FormError message={failure.global} />
      <Input name="fullName" label="Họ và tên" required error={failure.fields.fullName} />
      <Input name="email" label="Email" type="email" required error={failure.fields.email} />
      <Input name="phone" label="Số điện thoại" error={failure.fields.phone} />
      <Input name="password" label="Mật khẩu khởi tạo" type="password" minLength={8} required error={failure.fields.password} />
      <label className="block text-sm font-medium">
        Vai trò
        <select name="roleId" required className="mt-1.5 h-10 w-full rounded-md border border-gray-200 bg-white px-3">
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        {failure.fields.roleId && (
          <p className="mt-1 text-sm text-error-strong" role="alert">
            {failure.fields.roleId}
          </p>
        )}
      </label>
      <label className="block text-sm font-medium">
        Chi nhánh
        <select name="branchId" className="mt-1.5 h-10 w-full rounded-md border border-gray-200 bg-white px-3">
          <option value="">Chưa phân công</option>
          {branches.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {failure.fields.branchId && (
          <p className="mt-1 text-sm text-error-strong" role="alert">
            {failure.fields.branchId}
          </p>
        )}
      </label>
      <p className="text-xs text-gray-500">Chọn chi nhánh sẽ tạo hồ sơ nhân viên riêng trong Store Service.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input name="employeeCode" label="Mã nhân viên" maxLength={30} error={failure.fields.employeeCode} />
        <Input name="jobTitle" label="Chức danh" error={failure.fields.jobTitle} />
        <label className="block text-sm font-medium">
          Hình thức làm việc
          <select name="employmentType" className="mt-1.5 h-10 w-full rounded-md border border-gray-200 bg-white px-3">
            <option value="Full_Time">Toàn thời gian</option>
            <option value="Part_Time">Bán thời gian</option>
            <option value="Probation">Thử việc</option>
            <option value="Intern">Thực tập</option>
          </select>
          {failure.fields.employmentType && (
            <p className="mt-1 text-sm text-error-strong" role="alert">
              {failure.fields.employmentType}
            </p>
          )}
        </label>
        <Input name="hireDate" type="date" label="Ngày vào làm" error={failure.fields.hireDate} />
      </div>
      <div className="flex justify-end gap-2 pt-3">
        <Button variant="outline" onClick={onClose}>
          Hủy
        </Button>
        <Button type="submit" loading={m.isPending}>
          Tạo tài khoản
        </Button>
      </div>
    </form>
  );
}
export function AdminUsersPage() {
  const roles = useQuery({ queryKey: keys.roles, queryFn: api.listAdminRoles });
  const [roleFilter, setRoleFilter] = useState<number | undefined>();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: [...keys.users, page, q, roleFilter],
    queryFn: ({ signal }) => api.listAdminUsers({ page, size: 10, q: q || undefined, roleId: roleFilter }, signal),
  });
  const roleMut = useMutation({
    mutationFn: ({ id, roleId }: { id: string; roleId: number }) => api.updateAdminUserRole(id, roleId),
    onSuccess: () => {
      toast.success("Đã cập nhật vai trò");
      void qc.invalidateQueries({ queryKey: keys.users });
    },
    onError: (e) => toast.error(displayError(e)),
  });
  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.updateAdminUserStatus(id, status),
    onSuccess: () => {
      toast.success("Đã cập nhật trạng thái");
      void qc.invalidateQueries({ queryKey: keys.users });
    },
    onError: (e) => toast.error(displayError(e)),
  });
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeading
        title="Tài khoản & quyền"
        description="Tài khoản nhân viên, vai trò và trạng thái được cập nhật từ Identity API."
        action={
          <Button leftIcon={<Plus className="size-4" />} disabled={roles.isError || !roles.data?.length} onClick={() => setCreating(true)}>
            Tạo tài khoản
          </Button>
        }
      />
      <div className="grid gap-6 2xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="min-w-0 p-5">
          <CardHeading title="Tài khoản vận hành" description={`${users.data?.meta.totalItems ?? "—"} tài khoản`} />
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Input
                aria-label="Tìm nhân viên"
                placeholder="Tìm theo tên hoặc email"
                leftIcon={<Search aria-hidden />}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <select
              aria-label="Lọc theo vai trò"
              className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
              value={roleFilter ?? ""}
              onChange={(e) => {
                setRoleFilter(e.target.value ? Number(e.target.value) : undefined);
                setPage(1);
              }}
            >
              <option value="">Tất cả vai trò</option>
              {roles.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          {users.isPending ? (
            <Loading />
          ) : users.isError ? (
            <ErrorState error={users.error} retry={() => void users.refetch()} />
          ) : users.data.items.length === 0 ? (
            <EmptyState title="Chưa có tài khoản phù hợp" message="Thay đổi bộ lọc hoặc tạo tài khoản vận hành mới." icon={Users} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    {["Nhân viên", "Vai trò", "Trạng thái", "Thao tác"].map((x) => (
                      <th key={x} className="px-3 py-3 font-semibold">
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.data.items.map((u) => (
                    <tr key={u.id}>
                      <td className="px-3 py-4">
                        <p className="font-semibold text-gray-900">{u.fullName}</p>
                        <p className="mt-1 text-xs text-gray-500">{u.email || u.phone || u.id}</p>
                      </td>
                      <td className="px-3 py-4">
                        <select
                          aria-label={`Vai trò ${u.fullName}`}
                          className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs"
                          value={u.roleId}
                          onChange={(e) =>
                            roleMut.mutate({
                              id: u.id,
                              roleId: Number(e.target.value),
                            })
                          }
                        >
                          {roles.data?.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-4">
                        <Badge tone={u.status === "Active" ? "success" : u.status === "Unverified" ? "warning" : "neutral"}>{u.status === "Active" ? "Đang hoạt động" : u.status === "Unverified" ? "Chưa xác minh" : u.status}</Badge>
                      </td>
                      <td className="px-3 py-4">
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={statusMut.isPending && statusMut.variables?.id === u.id}
                          onClick={() =>
                            statusMut.mutate({
                              id: u.id,
                              status: u.status === "Active" ? "Deactivated" : "Active",
                            })
                          }
                        >
                          {u.status === "Active" ? "Vô hiệu hóa" : "Kích hoạt"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 text-sm text-gray-500">
            <span>
              Trang {users.data?.meta.page ?? page} / {users.data?.meta.totalPages ?? 1}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button size="sm" variant="outline" aria-label="Trang tiếp" disabled={page >= (users.data?.meta.totalPages ?? 1)} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <CardHeading title="Vai trò hệ thống" description="Danh sách lấy từ Identity API." action={<Shield className="size-5 text-primary-700" />} />
          {roles.isPending ? (
            <Loading />
          ) : roles.isError ? (
            <ErrorState error={roles.error} retry={() => void roles.refetch()} />
          ) : (
            <div className="space-y-3">
              {roles.data.map((r) => (
                <div key={r.id} className="rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-gray-900">{r.name}</p>
                    <Badge tone={["Admin", "Manager"].includes(r.name) ? "primary" : "neutral"}>{r.id === 1 ? "Quản trị" : r.id === 2 ? "Quản lý" : "Nhân viên"}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">{r.description || "Vai trò được quản lý trực tiếp từ Identity API."}</p>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 rounded-lg bg-primary-50 p-3 text-xs leading-relaxed text-primary-800">Quyền chi tiết không có trong API vai trò hiện tại. Không hiển thị ma trận quyền suy đoán.</p>
        </Card>
      </div>
      <Modal open={creating} onClose={() => setCreating(false)} title="Tạo tài khoản vận hành">
        <UserForm roles={roles.data ?? []} onClose={() => setCreating(false)} />
      </Modal>
    </div>
  );
}

