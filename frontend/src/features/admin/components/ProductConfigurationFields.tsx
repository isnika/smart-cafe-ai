import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui";

type Status = "Active" | "Inactive";
export type VariantDraft = { id: string; name: string; price: string; status: Status };
export type OptionDraft = { id: string; name: string; price: string; isDefault: boolean; status: Status };
export type GroupDraft = { id: string; name: string; type: "Single" | "Multiple"; required: boolean; min: string; max: string; options: OptionDraft[] };
let nextDraftId = 0;
const id = () => String(++nextDraftId);
export const newVariant = (): VariantDraft => ({ id: id(), name: "", price: "", status: "Active" });
const newOption = (): OptionDraft => ({ id: id(), name: "", price: "0", isDefault: false, status: "Active" });
const newGroup = (): GroupDraft => ({ id: id(), name: "", type: "Single", required: false, min: "0", max: "1", options: [newOption()] });
const field = "mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm";

export function validateConfiguration(variants: VariantDraft[], groups: GroupDraft[], productStatus: Status): string | null {
  if (productStatus === "Active" && !variants.some((v) => v.status === "Active")) return "Sản phẩm đang bán cần ít nhất một biến thể đang bán.";
  for (const group of groups) {
    const min = Number(group.min), max = Number(group.max);
    const active = group.options.filter((option) => option.status === "Active");
    if (!group.min.trim() || !group.max.trim() || !Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || max > 255 || min > max || (group.type === "Single" && max !== 1) || (group.required && min < 1))
      return `Kiểm tra số lượng lựa chọn của nhóm “${group.name || "chưa đặt tên"}”.`;
    if (active.length < Math.max(1, min)) return `Nhóm “${group.name || "chưa đặt tên"}” cần đủ lựa chọn đang bán để khách có thể chọn.`;
    if (group.options.some((o) => o.isDefault && o.status !== "Active") || active.filter((o) => o.isDefault).length > max)
      return `Kiểm tra các lựa chọn mặc định trong nhóm “${group.name || "chưa đặt tên"}”.`;
  }
  return null;
}

export function ProductConfigurationFields({ variants, setVariants, groups, setGroups }: {
  variants: VariantDraft[]; setVariants: (value: VariantDraft[]) => void;
  groups: GroupDraft[]; setGroups: (value: GroupDraft[]) => void;
}) {
  const updateVariant = (index: number, patch: Partial<VariantDraft>) => setVariants(variants.map((v, i) => i === index ? { ...v, ...patch } : v));
  const updateGroup = (index: number, patch: Partial<GroupDraft>) => setGroups(groups.map((g, i) => i === index ? { ...g, ...patch } : g));
  return <div className="space-y-6">
    <section aria-labelledby="create-variants" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 id="create-variants" className="font-semibold">Biến thể và giá</h3><p className="text-sm text-gray-500">Chọn kích cỡ và giá tương ứng.</p></div><Button type="button" variant="outline" size="sm" disabled={variants.length >= 3} leftIcon={<Plus className="size-4" />} onClick={() => setVariants([...variants, newVariant()])}>Thêm biến thể</Button></div>
      {variants.map((variant, index) => <div key={variant.id} className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3">
        <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Biến thể {index + 1}</h4>{variants.length > 1 && <button type="button" aria-label={`Xóa biến thể ${index + 1}`} className="text-gray-500 hover:text-error-strong" onClick={() => setVariants(variants.filter((_, i) => i !== index))}><Trash2 className="size-4" /></button>}</div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Tên biến thể<select aria-label={`Tên biến thể ${index + 1}`} className={field} value={variant.name} onChange={(e) => updateVariant(index, { name: e.target.value })} required><option value="">Chọn kích cỡ</option>{["Size S", "Size M", "Size L"].map((size) => <option key={size} value={size} disabled={variants.some((v, i) => i !== index && v.name === size)}>{size}</option>)}</select></label><label className="text-sm font-medium">Giá (₫)<input aria-label={`Giá biến thể ${index + 1}`} className={field} type="number" min="0" max="999999999999999" step="1" value={variant.price} onChange={(e) => updateVariant(index, { price: e.target.value })} required /></label></div>
        <label className="block text-sm font-medium">Trạng thái<select aria-label={`Trạng thái biến thể ${index + 1}`} className={field} value={variant.status} onChange={(e) => updateVariant(index, { status: e.target.value as Status })}><option value="Active">Đang bán</option><option value="Inactive">Ngừng bán</option></select></label>
      </div>)}
    </section>
    <section aria-labelledby="create-groups" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 id="create-groups" className="font-semibold">Nhóm tùy chọn</h3><p className="text-sm text-gray-500">Thêm mức đường, đá, topping hoặc tùy chọn khác.</p></div><Button type="button" variant="outline" size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setGroups([...groups, newGroup()])}>Thêm nhóm tùy chọn</Button></div>
      {groups.length === 0 && <p className="text-sm text-gray-500">Sản phẩm chưa có nhóm tùy chọn.</p>}
      {groups.map((group, index) => <div key={group.id} className="space-y-4 rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between"><h4 className="font-semibold">Nhóm {index + 1}</h4><button type="button" aria-label={`Xóa nhóm ${index + 1}`} className="text-gray-500 hover:text-error-strong" onClick={() => setGroups(groups.filter((_, i) => i !== index))}><Trash2 className="size-4" /></button></div>
        <label className="block text-sm font-medium">Tên nhóm<input aria-label={`Tên nhóm ${index + 1}`} className={field} value={group.name} onChange={(e) => updateGroup(index, { name: e.target.value })} placeholder="Ví dụ: Chọn mức đường" maxLength={50} required /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Kiểu lựa chọn<select aria-label={`Kiểu lựa chọn nhóm ${index + 1}`} className={field} value={group.type} onChange={(e) => { const type = e.target.value as GroupDraft["type"]; updateGroup(index, { type, ...(type === "Single" ? { max: "1", min: group.required ? "1" : "0" } : {}) }); }}><option value="Single">Chọn một</option><option value="Multiple">Chọn nhiều</option></select></label><label className="flex items-center gap-2 self-end py-2 text-sm font-medium"><input type="checkbox" checked={group.required} onChange={(e) => updateGroup(index, { required: e.target.checked, min: e.target.checked && Number(group.min) < 1 ? "1" : group.min })} />Bắt buộc chọn</label></div>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Chọn tối thiểu<input aria-label={`Chọn tối thiểu nhóm ${index + 1}`} className={field} type="number" min={group.required ? 1 : 0} max="255" step="1" value={group.min} onChange={(e) => updateGroup(index, { min: e.target.value })} required /></label><label className="text-sm font-medium">Chọn tối đa<input aria-label={`Chọn tối đa nhóm ${index + 1}`} className={field} type="number" min="1" max="255" step="1" value={group.max} onChange={(e) => updateGroup(index, { max: e.target.value })} disabled={group.type === "Single"} required /></label></div>
        <div className="space-y-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">Các lựa chọn</span><Button type="button" variant="outline" size="sm" onClick={() => updateGroup(index, { options: [...group.options, newOption()] })}>Thêm lựa chọn</Button></div>
          {group.options.map((option, optionIndex) => { const updateOption = (patch: Partial<OptionDraft>) => updateGroup(index, { options: group.options.map((o, i) => i === optionIndex ? { ...o, ...patch } : o) }); return <div key={option.id} className="space-y-3 rounded-lg bg-gray-50 p-3"><div className="flex items-center justify-between"><span className="text-sm font-medium">Lựa chọn {optionIndex + 1}</span>{group.options.length > 1 && <button type="button" aria-label={`Xóa lựa chọn ${optionIndex + 1} nhóm ${index + 1}`} className="text-gray-500 hover:text-error-strong" onClick={() => updateGroup(index, { options: group.options.filter((_, i) => i !== optionIndex) })}><Trash2 className="size-4" /></button>}</div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Tên lựa chọn<input aria-label={`Tên lựa chọn ${optionIndex + 1} nhóm ${index + 1}`} className={field} value={option.name} onChange={(e) => updateOption({ name: e.target.value })} maxLength={100} required /></label><label className="text-sm font-medium">Giá thêm (₫)<input aria-label={`Giá lựa chọn ${optionIndex + 1} nhóm ${index + 1}`} className={field} type="number" min="0" max="999999999999999" step="1" value={option.price} onChange={(e) => updateOption({ price: e.target.value })} required /></label></div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Trạng thái<select aria-label={`Trạng thái lựa chọn ${optionIndex + 1} nhóm ${index + 1}`} className={field} value={option.status} onChange={(e) => updateOption({ status: e.target.value as Status })}><option value="Active">Đang bán</option><option value="Inactive">Ngừng bán</option></select></label><label className="flex items-center gap-2 self-end py-2 text-sm font-medium"><input type="checkbox" aria-label={`Mặc định lựa chọn ${optionIndex + 1} nhóm ${index + 1}`} checked={option.isDefault} onChange={(e) => updateOption({ isDefault: e.target.checked })} />Mặc định</label></div>
          </div>; })}
        </div>
      </div>)}
    </section>
  </div>;
}
