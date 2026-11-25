export type Status = "Active" | "Inactive";
export type VariantDraft = { id: string; name: string; price: string; status: Status };
export type OptionDraft = { id: string; name: string; price: string; isDefault: boolean; status: Status };
export type GroupDraft = { id: string; name: string; type: "Single" | "Multiple"; required: boolean; min: string; max: string; options: OptionDraft[] };
let nextDraftId = 0;
const id = () => String(++nextDraftId);
export const newVariant = (): VariantDraft => ({ id: id(), name: "", price: "", status: "Active" });
export const newOption = (): OptionDraft => ({ id: id(), name: "", price: "0", isDefault: false, status: "Active" });
export const newGroup = (): GroupDraft => ({ id: id(), name: "", type: "Single", required: false, min: "0", max: "1", options: [newOption()] });

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
