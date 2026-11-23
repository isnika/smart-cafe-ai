import { useQuery } from "@tanstack/react-query";
import { Coffee } from "lucide-react";
import { getAdminProduct } from "@/shared/api/admin";
import { Badge, Button } from "@/shared/ui";

const money = (value: number | string) => `${Number(value).toLocaleString("vi-VN")} ₫`;
const temperatureLabels: Record<string, string> = { Hot: "Nóng", Iced: "Đá", Hot_Or_Iced: "Nóng hoặc đá", Blended: "Đá xay" };
const caffeineLabels: Record<string, string> = { None: "Không có", Low: "Thấp", Medium: "Trung bình", High: "Cao" };

export function AdminProductDetail({ id }: { id: number }) {
  const detail = useQuery({
    queryKey: ["admin", "product-detail", id],
    queryFn: ({ signal }) => getAdminProduct(id, signal),
  });
  if (detail.isPending) return <p role="status">Đang tải chi tiết sản phẩm…</p>;
  if (detail.isError) return <div role="alert" className="space-y-3"><p>Không tải được chi tiết sản phẩm: {detail.error instanceof Error ? detail.error.message : "Lỗi kết nối"}</p><Button variant="outline" onClick={() => void detail.refetch()}>Thử lại</Button></div>;
  const p = detail.data;
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        {p.image ? <img src={p.image} alt={p.name} className="size-24 rounded-xl object-cover" /> : <span className="grid size-24 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700"><Coffee className="size-8" aria-hidden /></span>}
        <div className="space-y-2"><h3 className="text-lg font-semibold">{p.name}</h3><p className="text-sm text-gray-500">Mã sản phẩm: #{p.id}</p><Badge tone={p.status === "Active" ? "success" : "neutral"}>{p.status === "Active" ? "Đang bán" : "Ngừng bán"}</Badge></div>
      </div>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-gray-500">Danh mục</dt><dd className="mt-1 font-medium">{p.categoryName || "—"}</dd></div>
        <div><dt className="text-gray-500">Cách dùng</dt><dd className="mt-1 font-medium">{p.temperature ? temperatureLabels[p.temperature] ?? p.temperature : "—"}</dd></div>
        <div><dt className="text-gray-500">Caffeine</dt><dd className="mt-1 font-medium">{p.caffeineLevel ? caffeineLabels[p.caffeineLevel] ?? p.caffeineLevel : "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-gray-500">Hương vị</dt><dd className="mt-1">{p.flavorTags?.length ? p.flavorTags.join(", ") : "Chưa có"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-gray-500">Mô tả</dt><dd className="mt-1 whitespace-pre-wrap">{p.description || "Chưa có mô tả"}</dd></div>
      </dl>
      <section aria-labelledby="admin-product-variants"><h3 id="admin-product-variants" className="mb-3 font-semibold">Biến thể và giá</h3>
        {p.variants.length === 0 ? <p className="text-sm text-gray-500">Chưa có biến thể.</p> : <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">{p.variants.map((v) => <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"><span className="font-medium">{v.variantName}</span><span>{money(v.price)} · {v.status === "Active" ? "Đang bán" : "Ngừng bán"}</span></li>)}</ul>}
      </section>
      <section aria-labelledby="admin-product-options"><h3 id="admin-product-options" className="mb-3 font-semibold">Nhóm tùy chọn</h3>
        {p.optionGroups.length === 0 ? <p className="text-sm text-gray-500">Chưa có tùy chọn.</p> : <div className="space-y-3">{p.optionGroups.map((group) => <div key={group.id} className="rounded-lg border border-gray-200 p-4"><h4 className="font-medium">{group.name}</h4><p className="mt-1 text-sm text-gray-500">{group.isRequired ? "Bắt buộc" : "Không bắt buộc"} · Chọn {group.minSelect}–{group.maxSelect}</p>{group.options.length === 0 ? <p className="mt-2 text-sm text-gray-500">Chưa có lựa chọn.</p> : <ul className="mt-2 space-y-1 text-sm">{group.options.map((option) => <li key={option.id} className="flex flex-wrap justify-between gap-2"><span>{option.optionName}{option.isDefault ? " (mặc định)" : ""}</span><span>{money(option.extraPrice)} · {option.status === "Active" ? "Đang bán" : "Ngừng bán"}</span></li>)}</ul>}</div>)}</div>}
      </section>
    </div>
  );
}
