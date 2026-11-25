import type { MenuProduct } from "@/shared/types";

const normalize = (value: string) => value.toLocaleLowerCase("vi").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim();

export function filterMenu(products: MenuProduct[], categoryId: number | null, keyword: string) {
  const query = normalize(keyword);
  return products.filter((product) =>
    (categoryId === null || product.categoryId === categoryId) && normalize(product.name).includes(query),
  );
}
