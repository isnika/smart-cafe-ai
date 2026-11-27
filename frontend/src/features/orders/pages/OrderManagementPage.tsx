import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Eye,
  Filter,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, Input, Modal, Skeleton } from "@/shared/ui";
import {
  changeOrderStatus,
  getOrder,
  listOrders,
} from "@/shared/api/order";
import { listAdminBranches } from "@/shared/api/admin";
import { useAuthStore } from "@/features/auth/store";
import { useAuthBranchId } from "@/features/auth/branch-context";
import { formatVnd, getNextStatuses, parseUtc } from "@/shared/lib";
import type {
  ChangeOrderStatusInput,
  FulfillmentType,
  OrderDetail,
  OrderSource,
  OrderStatus,
  PaymentStatus,
} from "@/shared/types";
import { isApiError } from "@/shared/api/http";

const STATUS_LABELS: Record<OrderStatus, string> = {
  Pending_Payment: "Chờ thanh toán",
  Pending: "Chờ xác nhận",
  Confirmed: "Đã xác nhận",
  Preparing: "Đang pha chế",
  Ready: "Sẵn sàng",
  Shipping: "Đang giao hàng",
  Served: "Đã phục vụ",
  Completed: "Hoàn tất",
  Cancelled: "Đã huỷ",
  Rejected: "Đã từ chối",
};

const STATUS_TONES: Record<OrderStatus, "neutral" | "info" | "warning" | "success" | "error"> = {
  Pending_Payment: "warning",
  Pending: "info",
  Confirmed: "info",
  Preparing: "warning",
  Ready: "success",
  Shipping: "info",
  Served: "success",
  Completed: "success",
  Cancelled: "error",
  Rejected: "error",
};

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  Unpaid: "Chưa thanh toán",
  Paid: "Đã thanh toán",
  Partially_Refunded: "Hoàn tiền một phần",
  Refunded: "Đã hoàn tiền",
};

const FULFILLMENT_LABELS: Record<FulfillmentType, string> = {
  Dine_In: "Tại quán",
  Delivery: "Giao hàng",
  Pickup: "Mang đi",
};

const SOURCE_LABELS: Record<OrderSource, string> = {
  QR: "Tại bàn (QR)",
  Online: "Trực tuyến",
  POS: "Tại quầy (POS)",
};

const displayError = (e: unknown) =>
  isApiError(e) ? e.message : e instanceof Error ? e.message : "Đã có lỗi xảy ra.";

export default function OrderManagementPage() {
  const roleName = useAuthStore((s) => s.roleName);
  const managerBranchId = useAuthBranchId();
  const isAdmin = roleName === "Admin";

  const [selectedBranch, setSelectedBranch] = useState<string>(
    isAdmin ? "all" : managerBranchId != null ? String(managerBranchId) : "all",
  );
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [detailOrderId, setDetailOrderId] = useState<number | null>(null);

  const qc = useQueryClient();

  const branchesQuery = useQuery({
    queryKey: ["admin", "branches"],
    queryFn: ({ signal }) => listAdminBranches(signal),
  });

  const branchIdParam =
    selectedBranch === "all"
      ? !isAdmin && managerBranchId != null
        ? managerBranchId
        : undefined
      : Number(selectedBranch);

  const ordersQuery = useQuery({
    queryKey: [
      "orders",
      "management",
      {
        branchId: branchIdParam,
        status: statusFilter !== "all" ? (statusFilter as OrderStatus) : undefined,
        paymentStatus: paymentFilter !== "all" ? (paymentFilter as PaymentStatus) : undefined,
        orderSource: sourceFilter !== "all" ? (sourceFilter as OrderSource) : undefined,
        fulfillmentType: fulfillmentFilter !== "all" ? (fulfillmentFilter as FulfillmentType) : undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
        page,
        pageSize,
      },
    ],
    queryFn: ({ signal }) =>
      listOrders(
        {
          branchId: branchIdParam,
          status: statusFilter !== "all" ? (statusFilter as OrderStatus) : undefined,
          paymentStatus: paymentFilter !== "all" ? (paymentFilter as PaymentStatus) : undefined,
          orderSource: sourceFilter !== "all" ? (sourceFilter as OrderSource) : undefined,
          fulfillmentType: fulfillmentFilter !== "all" ? (fulfillmentFilter as FulfillmentType) : undefined,
          from: fromDate || undefined,
          to: toDate || undefined,
          page,
          pageSize,
        },
        signal,
      ),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["orders"] });
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: ChangeOrderStatusInput }) =>
      changeOrderStatus(id, input),
    onSuccess: (updated) => {
      toast.success(`Đã chuyển đơn #${updated.orderCode} sang "${STATUS_LABELS[updated.status]}"`);
      invalidate();
    },
    onError: (err) => toast.error(displayError(err)),
  });

  const rawItems = ordersQuery.data?.items ?? [];
  const total = ordersQuery.data?.total ?? rawItems.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const items = useMemo(() => {
    if (!searchQuery.trim()) return rawItems;
    const q = searchQuery.trim().toLowerCase();
    return rawItems.filter(
      (o) =>
        String(o.id).includes(q) ||
        o.orderCode.toLowerCase().includes(q) ||
        (o.tableNumber != null && String(o.tableNumber).includes(q)),
    );
  }, [rawItems, searchQuery]);

  // Thống kê nhanh
  const stats = useMemo(() => {
    const list = rawItems;
    return {
      total,
      pending: list.filter((o) => o.status === "Pending" || o.status === "Pending_Payment").length,
      preparing: list.filter((o) => o.status === "Confirmed" || o.status === "Preparing").length,
      ready: list.filter((o) => o.status === "Ready" || o.status === "Shipping" || o.status === "Served").length,
      completed: list.filter((o) => o.status === "Completed").length,
      cancelled: list.filter((o) => o.status === "Cancelled" || o.status === "Rejected").length,
    };
  }, [rawItems, total]);

  const resetFilters = () => {
    setSelectedBranch(isAdmin ? "all" : managerBranchId != null ? String(managerBranchId) : "all");
    setStatusFilter("all");
    setPaymentFilter("all");
    setSourceFilter("all");
    setFulfillmentFilter("all");
    setSearchQuery("");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-caption text-gray-500">
            {isAdmin ? "Quản trị" : "Quản lý"} / Đơn hàng
          </p>
          <h1 className="flex items-center gap-2 text-h2 text-gray-900">
            <ClipboardList className="size-6 text-primary-600" aria-hidden /> Quản lý đơn hàng
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Theo dõi, xử lý, tìm kiếm và cập nhật trạng thái đơn hàng toàn hệ thống.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            leftIcon={<RefreshCw className="size-4" />}
            loading={ordersQuery.isFetching}
            onClick={() => void ordersQuery.refetch()}
          >
            Làm mới
          </Button>
        </div>
      </div>

      {/* Thẻ thống kê nhanh */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Tổng đơn" value={stats.total} icon={<ClipboardList className="size-5 text-primary-600" />} />
        <StatCard label="Chờ xử lý" value={stats.pending} icon={<Clock className="size-5 text-info" />} />
        <StatCard label="Đang pha chế" value={stats.preparing} icon={<AlertCircle className="size-5 text-warning" />} />
        <StatCard label="Sẵn sàng / Giao" value={stats.ready} icon={<CheckCircle2 className="size-5 text-success" />} />
        <StatCard label="Hoàn tất" value={stats.completed} icon={<CheckCircle2 className="size-5 text-primary-700" />} />
        <StatCard label="Đã huỷ / Từ chối" value={stats.cancelled} icon={<XCircle className="size-5 text-error" />} />
      </div>

      {/* Bộ lọc */}
      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
            <Filter className="size-3.5" /> Bộ lọc tìm kiếm
          </span>
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs font-medium text-primary-600 hover:underline"
          >
            Đặt lại bộ lọc
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <div className="sm:col-span-2">
            <Input
              aria-label="Tìm mã đơn"
              placeholder="Tìm theo mã đơn hoặc số bàn..."
              leftIcon={<Search aria-hidden />}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {isAdmin && (
            <div>
              <select
                aria-label="Chọn chi nhánh"
                value={selectedBranch}
                onChange={(e) => {
                  setSelectedBranch(e.target.value);
                  setPage(1);
                }}
                className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-800"
              >
                <option value="all">Tất cả chi nhánh</option>
                {branchesQuery.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <select
              aria-label="Trạng thái đơn hàng"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-800"
            >
              <option value="all">Tất cả trạng thái đơn</option>
              <option value="Pending">Chờ xác nhận</option>
              <option value="Confirmed">Đã xác nhận</option>
              <option value="Preparing">Đang pha chế</option>
              <option value="Ready">Sẵn sàng</option>
              <option value="Shipping">Đang giao</option>
              <option value="Completed">Hoàn tất</option>
              <option value="Cancelled">Đã huỷ</option>
            </select>
          </div>

          <div>
            <select
              aria-label="Trạng thái thanh toán"
              value={paymentFilter}
              onChange={(e) => {
                setPaymentFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-800"
            >
              <option value="all">Tất cả thanh toán</option>
              <option value="Unpaid">Chưa thanh toán</option>
              <option value="Paid">Đã thanh toán</option>
              <option value="Refunded">Đã hoàn tiền</option>
            </select>
          </div>

          <div>
            <select
              aria-label="Nguồn đơn hàng"
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-800"
            >
              <option value="all">Tất cả nguồn đơn</option>
              <option value="QR">Tại bàn (QR)</option>
              <option value="Online">Trực tuyến</option>
              <option value="POS">Tại quầy (POS)</option>
            </select>
          </div>

          <div>
            <select
              aria-label="Loại phục vụ"
              value={fulfillmentFilter}
              onChange={(e) => {
                setFulfillmentFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-800"
            >
              <option value="all">Tất cả hình thức</option>
              <option value="Dine_In">Tại quán</option>
              <option value="Delivery">Giao hàng</option>
              <option value="Pickup">Mang đi</option>
            </select>
          </div>

          <div className="flex items-center gap-1 sm:col-span-2">
            <span className="text-xs text-gray-500 whitespace-nowrap">Từ:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-2.5 text-xs text-gray-700"
            />
            <span className="text-xs text-gray-500 whitespace-nowrap">Đến:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-2.5 text-xs text-gray-700"
            />
          </div>
        </div>
      </Card>

      {/* Bảng đơn hàng */}
      <Card padding="none" className="overflow-hidden">
        {ordersQuery.isPending ? (
          <div className="space-y-3 p-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : ordersQuery.isError ? (
          <div className="p-8 text-center">
            <p className="text-body font-medium text-error">
              {displayError(ordersQuery.error)}
            </p>
            <Button className="mt-3" variant="outline" onClick={() => void ordersQuery.refetch()}>
              Thử lại
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-14 text-center">
            <ClipboardList className="mx-auto size-10 text-gray-400" />
            <h3 className="mt-3 text-h4 text-gray-900">Không tìm thấy đơn hàng nào</h3>
            <p className="mt-1 text-sm text-gray-500">
              Thử chọn chi nhánh khác hoặc đặt lại bộ lọc tìm kiếm.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Mã đơn</th>
                  <th className="px-5 py-3.5 font-semibold">Thời gian</th>
                  <th className="px-5 py-3.5 font-semibold">Chi nhánh / Bàn</th>
                  <th className="px-5 py-3.5 font-semibold">Hình thức</th>
                  <th className="px-5 py-3.5 font-semibold">Tổng tiền</th>
                  <th className="px-5 py-3.5 font-semibold">Thanh toán</th>
                  <th className="px-5 py-3.5 font-semibold">Trạng thái</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((order) => {
                  const createdAt = parseUtc(order.createdAt);
                  const timeStr = createdAt
                    ? `${createdAt.toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })} ${createdAt.toLocaleDateString("vi-VN")}`
                    : "—";

                  const branch = branchesQuery.data?.find((b) => b.id === order.branchId);
                  const branchName = branch?.name || `CN #${order.branchId}`;

                  const nextStatuses = getNextStatuses(order.fulfillmentType, order.status);
                  const canAdvance = nextStatuses.some(
                    (s) => s !== "Cancelled" && s !== "Rejected",
                  );

                  return (
                    <tr key={order.id} className="hover:bg-gray-50/70">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-gray-900">#{order.orderCode}</p>
                        <p className="text-xs text-gray-400">ID: {order.id}</p>
                      </td>
                      <td className="px-5 py-4 text-xs text-gray-600">
                        {timeStr}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-800">{branchName}</p>
                        <p className="text-xs text-gray-500">
                          {order.fulfillmentType === "Dine_In" && order.tableNumber
                            ? `Bàn ${order.tableNumber}`
                            : FULFILLMENT_LABELS[order.fulfillmentType]}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-block rounded bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-800">
                          {SOURCE_LABELS[order.orderSource]}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-gray-900">
                        {formatVnd(order.finalAmount)}
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          tone={
                            order.paymentStatus === "Paid"
                              ? "success"
                              : order.paymentStatus === "Refunded"
                                ? "error"
                                : "warning"
                          }
                        >
                          {PAYMENT_LABELS[order.paymentStatus]}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone={STATUS_TONES[order.status] ?? "neutral"}>
                          {STATUS_LABELS[order.status] ?? order.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            leftIcon={<Eye className="size-3.5" />}
                            onClick={() => setDetailOrderId(order.id)}
                          >
                            Chi tiết
                          </Button>
                          {canAdvance && (
                            <QuickAdvanceButton
                              order={order}
                              busy={statusMutation.isPending && statusMutation.variables?.id === order.id}
                              onAdvance={(to) =>
                                statusMutation.mutate({
                                  id: order.id,
                                  input: { to, version: order.version },
                                })
                              }
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 p-4 text-sm text-gray-500">
            <span>
              Trang {page} / {totalPages} (Tổng {total} đơn hàng)
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                aria-label="Trang trước"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-label="Trang tiếp"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modal chi tiết đơn hàng */}
      <Modal
        open={detailOrderId !== null}
        onClose={() => setDetailOrderId(null)}
        title={detailOrderId ? `Chi tiết đơn hàng` : ""}
        size="lg"
      >
        {detailOrderId !== null && (
          <OrderDetailModalView
            orderId={detailOrderId}
            onClose={() => setDetailOrderId(null)}
            onUpdated={() => {
              invalidate();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <Card className="flex items-center gap-3 p-3.5">
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-gray-50">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-gray-500">{label}</p>
        <p className="text-h4 font-bold text-gray-900">{value}</p>
      </div>
    </Card>
  );
}

function QuickAdvanceButton({
  order,
  busy,
  onAdvance,
}: {
  order: OrderDetail;
  busy: boolean;
  onAdvance: (to: OrderStatus) => void;
}) {
  const next = getNextStatuses(order.fulfillmentType, order.status).find(
    (s) => s !== "Cancelled" && s !== "Rejected",
  );

  if (!next) return null;

  const isBlocked = next === "Completed" && order.paymentStatus !== "Paid";

  return (
    <Button
      size="sm"
      loading={busy}
      disabled={isBlocked}
      title={isBlocked ? "Cần thanh toán đơn trước khi hoàn tất" : undefined}
      onClick={() => onAdvance(next)}
    >
      {STATUS_LABELS[next] ?? next}
    </Button>
  );
}

function OrderDetailModalView({
  orderId,
  onClose,
  onUpdated,
}: {
  orderId: number;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const orderQuery = useQuery({
    queryKey: ["orders", "detail", orderId],
    queryFn: () => getOrder(orderId),
  });

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const statusMutation = useMutation({
    mutationFn: (input: ChangeOrderStatusInput) => changeOrderStatus(orderId, input),
    onSuccess: (updated) => {
      toast.success(`Đã cập nhật trạng thái đơn thành "${STATUS_LABELS[updated.status]}"`);
      onUpdated();
      void orderQuery.refetch();
      setCancelModalOpen(false);
    },
    onError: (err) => toast.error(displayError(err)),
  });

  if (orderQuery.isPending) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <div className="p-6 text-center text-error">
        Không thể tải thông tin chi tiết đơn hàng.
      </div>
    );
  }

  const order = orderQuery.data;
  const createdAt = parseUtc(order.createdAt);
  const nextStatuses = getNextStatuses(order.fulfillmentType, order.status);
  const advanceTargets = nextStatuses.filter((s) => s !== "Cancelled" && s !== "Rejected");
  const canCancel = nextStatuses.includes("Cancelled") || nextStatuses.includes("Rejected");
  const cancelTarget = nextStatuses.includes("Rejected") ? "Rejected" : "Cancelled";

  return (
    <div className="space-y-5">
      {/* Thông tin đầu trang */}
      <div className="rounded-lg bg-gray-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200/60 pb-3">
          <div>
            <span className="font-heading text-lg font-bold text-gray-900">
              Đơn hàng #{order.orderCode}
            </span>
            <span className="ml-2 font-mono text-xs text-gray-400">ID: {order.id}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={PAYMENT_LABELS[order.paymentStatus] === "Đã thanh toán" ? "success" : "warning"}>
              {PAYMENT_LABELS[order.paymentStatus]}
            </Badge>
            <Badge tone={STATUS_TONES[order.status] ?? "neutral"}>
              {STATUS_LABELS[order.status] ?? order.status}
            </Badge>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div>
            <span className="text-gray-500">Thời gian tạo:</span>
            <p className="font-medium text-gray-800">
              {createdAt
                ? `${createdAt.toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })} ${createdAt.toLocaleDateString("vi-VN")}`
                : "—"}
            </p>
          </div>
          <div>
            <span className="text-gray-500">Hình thức:</span>
            <p className="font-medium text-gray-800">
              {FULFILLMENT_LABELS[order.fulfillmentType]} ({SOURCE_LABELS[order.orderSource]})
            </p>
          </div>
          <div>
            <span className="text-gray-500">Vị trí / Bàn:</span>
            <p className="font-medium text-gray-800">
              {order.tableNumber ? `Bàn ${order.tableNumber}` : "Không có"}
            </p>
          </div>
          <div>
            <span className="text-gray-500">Phương thức TT:</span>
            <p className="font-medium text-gray-800">
              {order.paidOnline ? "Cổng trực tuyến" : "Tại quầy / Tiền mặt"}
            </p>
          </div>
        </div>

        {order.note && (
          <div className="mt-3 rounded border border-warning-200 bg-warning-50 p-2 text-xs text-warning-800">
            <strong>Ghi chú từ khách:</strong> {order.note}
          </div>
        )}
      </div>

      {/* Danh sách món */}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-gray-800">Danh sách món đã đặt</h4>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Món</th>
                <th className="px-4 py-2.5 font-semibold">Tuỳ chọn</th>
                <th className="px-4 py-2.5 font-semibold text-center">SL</th>
                <th className="px-4 py-2.5 font-semibold text-right">Đơn giá</th>
                <th className="px-4 py-2.5 font-semibold text-right">Thành tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {order.items.map((it, idx) => (
                <tr key={idx} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{it.productName}</p>
                    {it.variantName && (
                      <p className="text-xs text-gray-500">Kích cỡ: {it.variantName}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {it.options && it.options.length > 0 ? (
                      <ul className="list-disc pl-3">
                        {it.options.map((opt, oIdx) => (
                          <li key={oIdx}>{opt.optionName}</li>
                        ))}
                      </ul>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-gray-800">
                    {it.quantity}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {formatVnd(it.unitPrice)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {formatVnd(it.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tổng thanh toán */}
      <div className="flex justify-end">
        <div className="w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Tạm tính món:</span>
            <span>{formatVnd(order.subTotal)}</span>
          </div>
          {((order.itemDiscountAmount || 0) + (order.voucherDiscountAmount || 0)) > 0 && (
            <div className="flex justify-between text-success">
              <span>Giảm giá:</span>
              <span>-{formatVnd((order.itemDiscountAmount || 0) + (order.voucherDiscountAmount || 0))}</span>
            </div>
          )}
          {(order.deliveryFee || 0) > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Phí vận chuyển:</span>
              <span>{formatVnd(order.deliveryFee)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold text-gray-900">
            <span>Tổng thanh toán:</span>
            <span className="text-primary-700">{formatVnd(order.finalAmount)}</span>
          </div>
        </div>
      </div>

      {/* Lịch sử trạng thái */}
      {order.statusHistory && order.statusHistory.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Lịch sử cập nhật trạng thái
          </h4>
          <ol className="space-y-1.5 text-xs text-gray-600">
            {order.statusHistory.map((h) => (
              <li key={h.id} className="flex items-center justify-between">
                <span>
                  Chuyển sang <strong>{STATUS_LABELS[h.status] ?? h.status}</strong>
                  {h.note ? ` (${h.note})` : ""}
                </span>
                <span className="text-gray-400">
                  {parseUtc(h.createdAt)?.toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Nút hành động */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
        <div>
          {canCancel && (
            <Button
              variant="outline"
              size="sm"
              className="text-error hover:bg-error-soft"
              onClick={() => setCancelModalOpen(true)}
            >
              Huỷ / Từ chối đơn
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Đóng
          </Button>
          {advanceTargets.map((st) => (
            <Button
              key={st}
              size="sm"
              loading={statusMutation.isPending}
              onClick={() =>
                statusMutation.mutate({
                  to: st,
                  version: order.version,
                })
              }
            >
              Chuyển sang {STATUS_LABELS[st] ?? st}
            </Button>
          ))}
        </div>
      </div>

      {/* Modal nhập lý do huỷ */}
      <Modal
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Huỷ đơn hàng"
        size="sm"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Vui lòng nhập lý do huỷ hoặc từ chối đơn hàng #{order.orderCode}:
          </p>
          <Input
            placeholder="Ví dụ: Khách yêu cầu huỷ, Hết nguyên liệu, Quá tải..."
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancelModalOpen(false)}
              disabled={statusMutation.isPending}
            >
              Quay lại
            </Button>
            <Button
              size="sm"
              className="bg-error hover:bg-error-strong"
              loading={statusMutation.isPending}
              disabled={!cancelReason.trim()}
              onClick={() =>
                statusMutation.mutate({
                  to: cancelTarget,
                  version: order.version,
                  note: cancelReason.trim(),
                })
              }
            >
              Xác nhận huỷ
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
