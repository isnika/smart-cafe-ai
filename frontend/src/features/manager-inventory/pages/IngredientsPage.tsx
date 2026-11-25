import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, Input, Modal, Skeleton } from "@/shared/ui";
import {
  createIngredient,
  deleteIngredient,
  listIngredientsPaged,
  updateIngredient,
  updateIngredientStatus,
  type IngredientInput,
} from "@/shared/api/inventory";
import type { Ingredient } from "@/shared/types";
import { isApiError } from "@/shared/api/http";

const keys = {
  ingredients: ["inventory", "ingredients"] as const,
};

const displayError = (e: unknown) =>
  isApiError(e) ? e.message : e instanceof Error ? e.message : "Đã có lỗi xảy ra.";

export default function IngredientsPage() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [editingItem, setEditingItem] = useState<Ingredient | null | undefined>(undefined);

  const qc = useQueryClient();

  const isActiveParam =
    statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined;

  const ingredientsQuery = useQuery({
    queryKey: [...keys.ingredients, { q: q.trim(), isActive: isActiveParam, page, size: pageSize }],
    queryFn: ({ signal }) =>
      listIngredientsPaged(
        {
          q: q.trim() || undefined,
          isActive: isActiveParam,
          page,
          size: pageSize,
        },
        signal,
      ),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: keys.ingredients });
    void qc.invalidateQueries({ queryKey: ["inventory", "stock"] });
  };

  const saveMutation = useMutation({
    mutationFn: async (data: { id?: number; input: IngredientInput }) => {
      if (data.id) {
        return updateIngredient(data.id, data.input);
      }
      return createIngredient(data.input);
    },
    onSuccess: (_, vars) => {
      toast.success(vars.id ? "Đã cập nhật nguyên liệu" : "Đã tạo nguyên liệu mới");
      setEditingItem(undefined);
      invalidate();
    },
    onError: (err) => toast.error(displayError(err)),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, nextStatus }: { id: number; nextStatus: boolean }) =>
      updateIngredientStatus(id, nextStatus),
    onSuccess: () => {
      toast.success("Đã cập nhật trạng thái nguyên liệu");
      invalidate();
    },
    onError: (err) => toast.error(displayError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => deleteIngredient(id),
    onSuccess: () => {
      toast.success("Đã xoá nguyên liệu thành công");
      invalidate();
    },
    onError: (err) => toast.error(displayError(err)),
  });

  const items = ingredientsQuery.data?.items ?? [];
  const meta = ingredientsQuery.data?.meta ?? {
    page: 1,
    size: pageSize,
    totalElements: items.length,
    totalPages: 1,
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-caption text-gray-500">Quản lý / Nguyên liệu</p>
          <h1 className="flex items-center gap-2 text-h2 text-gray-900">
            <Boxes className="size-6 text-primary-600" aria-hidden /> Quản lý nguyên liệu
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Quản lý danh sách nguyên liệu thô, định lượng đơn vị và đơn giá trung bình cho hệ thống.
          </p>
        </div>
        <Button
          leftIcon={<Plus className="size-4" />}
          onClick={() => setEditingItem(null)}
        >
          Thêm nguyên liệu
        </Button>
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-[240px] flex-1">
          <Input
            aria-label="Tìm nguyên liệu"
            placeholder="Tìm theo tên nguyên liệu..."
            leftIcon={<Search aria-hidden />}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          aria-label="Lọc theo trạng thái"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as "all" | "active" | "inactive");
            setPage(1);
          }}
          className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="active">Đang sử dụng</option>
          <option value="inactive">Ngừng sử dụng</option>
        </select>
        <Button
          variant="outline"
          leftIcon={<RefreshCw className="size-4" />}
          loading={ingredientsQuery.isFetching}
          onClick={() => void ingredientsQuery.refetch()}
        >
          Làm mới
        </Button>
      </Card>

      <Card padding="none" className="overflow-hidden">
        {ingredientsQuery.isPending ? (
          <div className="space-y-3 p-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : ingredientsQuery.isError ? (
          <div className="p-8 text-center">
            <p className="text-body font-medium text-error">
              {displayError(ingredientsQuery.error)}
            </p>
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => void ingredientsQuery.refetch()}
            >
              Thử lại
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-14 text-center">
            <Boxes className="mx-auto size-10 text-gray-400" />
            <h3 className="mt-3 text-h4 text-gray-900">Không tìm thấy nguyên liệu nào</h3>
            <p className="mt-1 text-sm text-gray-500">
              {q.trim() || statusFilter !== "all"
                ? "Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm."
                : "Bấm nút Thêm nguyên liệu để tạo nguyên liệu đầu tiên."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Mã</th>
                  <th className="px-5 py-3.5 font-semibold">Tên nguyên liệu</th>
                  <th className="px-5 py-3.5 font-semibold">Đơn vị cơ sở</th>
                  <th className="px-5 py-3.5 font-semibold">Chi phí trung bình</th>
                  <th className="px-5 py-3.5 font-semibold">Trạng thái</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((ing) => (
                  <tr key={ing.id} className="hover:bg-gray-50/70">
                    <td className="px-5 py-4 font-mono text-xs text-gray-500">
                      #{ing.id}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-gray-900">{ing.name}</p>
                    </td>
                    <td className="px-5 py-4 text-gray-700">
                      <span className="inline-block rounded bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
                        {ing.unit}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-700">
                      {ing.averageCost != null
                        ? `${Number(ing.averageCost).toLocaleString("vi-VN")} ₫ / ${ing.unit}`
                        : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={ing.isActive ? "success" : "neutral"}>
                        {ing.isActive ? "Đang sử dụng" : "Ngừng sử dụng"}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<Pencil className="size-3.5" />}
                          onClick={() => setEditingItem(ing)}
                        >
                          Sửa
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={
                            toggleStatusMutation.isPending &&
                            toggleStatusMutation.variables?.id === ing.id
                          }
                          onClick={() =>
                            toggleStatusMutation.mutate({
                              id: ing.id,
                              nextStatus: !ing.isActive,
                            })
                          }
                        >
                          {ing.isActive ? "Tạm ngưng" : "Kích hoạt"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-error hover:bg-error-soft"
                          loading={
                            deleteMutation.isPending &&
                            deleteMutation.variables === ing.id
                          }
                          onClick={() => {
                            if (
                              window.confirm(
                                `Bạn có chắc muốn xoá nguyên liệu "${ing.name}"? Thao tác này không thể hoàn tác nếu nguyên liệu chưa có dữ liệu liên kết.`,
                              )
                            ) {
                              deleteMutation.mutate(ing.id);
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 p-4 text-sm text-gray-500">
            <span>
              Trang {meta.page} / {meta.totalPages} (Tổng {meta.totalElements} nguyên liệu)
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
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={editingItem !== undefined}
        onClose={() => {
          if (!saveMutation.isPending) setEditingItem(undefined);
        }}
        title={editingItem ? "Chỉnh sửa nguyên liệu" : "Thêm nguyên liệu mới"}
        size="md"
      >
        {editingItem !== undefined && (
          <IngredientForm
            initial={editingItem ?? undefined}
            busy={saveMutation.isPending}
            onCancel={() => setEditingItem(undefined)}
            onSubmit={(input) => saveMutation.mutate({ id: editingItem?.id, input })}
          />
        )}
      </Modal>
    </div>
  );
}

function IngredientForm({
  initial,
  busy,
  onCancel,
  onSubmit,
}: {
  initial?: Ingredient;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: IngredientInput) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "g");
  const [averageCost, setAverageCost] = useState(
    initial?.averageCost != null ? String(initial.averageCost) : "",
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Tên nguyên liệu không được để trống.");
      return;
    }
    if (!unit.trim()) {
      setError("Đơn vị tính không được để trống.");
      return;
    }

    const costNum = averageCost.trim() ? Number(averageCost) : undefined;
    if (costNum !== undefined && (isNaN(costNum) || costNum < 0)) {
      setError("Chi phí trung bình phải là số lớn hơn hoặc bằng 0.");
      return;
    }

    setError(null);
    onSubmit({
      name: name.trim(),
      unit: unit.trim(),
      averageCost: costNum,
      isActive,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-error-soft p-3 text-sm text-error">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-semibold text-gray-700">
          Tên nguyên liệu <span className="text-error">*</span>
        </label>
        <Input
          placeholder="Ví dụ: Cà phê Arabica, Sữa tươi tiệt trùng, Đường kính..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-semibold text-gray-700">
            Đơn vị cơ sở <span className="text-error">*</span>
          </label>
          <Input
            placeholder="g, ml, kg, lon, chai, quả..."
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-gray-500">Đơn vị dùng để tính công thức (vd: g, ml).</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-gray-700">
            Chi phí ước tính (₫)
          </label>
          <Input
            type="number"
            min="0"
            step="100"
            placeholder="Ví dụ: 120000"
            value={averageCost}
            onChange={(e) => setAverageCost(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-500">Giá vốn bình quân trên mỗi đơn vị.</p>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-gray-700">
          Trạng thái hoạt động
        </label>
        <select
          value={isActive ? "true" : "false"}
          onChange={(e) => setIsActive(e.target.value === "true")}
          className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-800"
        >
          <option value="true">Đang sử dụng (Active)</option>
          <option value="false">Ngừng sử dụng (Inactive)</option>
        </select>
      </div>

      <div className="flex justify-end gap-3 pt-3">
        <Button variant="outline" type="button" onClick={onCancel} disabled={busy}>
          Hủy
        </Button>
        <Button type="submit" loading={busy}>
          {initial ? "Lưu thay đổi" : "Tạo nguyên liệu"}
        </Button>
      </div>
    </form>
  );
}
