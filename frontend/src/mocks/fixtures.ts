import type { Product, ProductOption, ProductOptionGroup, ProductVariant, Table } from '@/shared/types';

/**
 * Quy ước ID để dễ đọc khi debug:
 *   variantId = productId*10 + thứ tự   (cà phê sữa đá = 1 → 11, 12, 13)
 *   groupId   = productId*10 + thứ tự
 *   optionId  = productId*100 + thứ tự
 */
export interface SeedGroup extends ProductOptionGroup {
  options: ProductOption[];
}
export interface SeedProduct {
  product: Product;
  variants: ProductVariant[];
  groups: SeedGroup[];
}

export const BRANCH_ID = 1;
export const DELIVERY_FEE = 15_000;
const T0 = '2026-01-01T00:00:00';

const base = (id: number, categoryId: number, name: string, o: Partial<Product> = {}): Product => ({
  id, categoryId, name,
  image: null, description: null,
  temperature: 'Iced', caffeineLevel: 'None', flavorTags: [],
  sortOrder: id, status: 'Active', createdAt: T0, updatedAt: T0,
  ...o,
});

const variants = (productId: number, rows: Array<[name: string, price: number]>): ProductVariant[] =>
  rows.map(([variantName, price], i) => ({
    id: productId * 10 + i + 1, productId, variantName, price, sortOrder: i + 1, status: 'Active',
  }));

const option = (productId: number, n: number, groupId: number, optionName: string, extraPrice: number, isDefault = false): ProductOption => ({
  id: productId * 100 + n, groupId, optionName, extraPrice, isDefault, sortOrder: n, status: 'Active',
});

/** Bắt buộc chọn đúng 1 mức đường → test OPTION_REQUIRED. */
const sugar = (productId: number): SeedGroup => {
  const id = productId * 10 + 1;
  return {
    id, productId, name: 'Đường', selectionType: 'Single', isRequired: true, minSelect: 1, maxSelect: 1, sortOrder: 1,
    options: [option(productId, 1, id, '100% đường', 0, true), option(productId, 2, id, '70% đường', 0), option(productId, 3, id, '50% đường', 0)],
  };
};

/** Tuỳ chọn, tối đa 2. */
const toppings = (productId: number): SeedGroup => {
  const id = productId * 10 + 2;
  return {
    id, productId, name: 'Topping', selectionType: 'Multiple', isRequired: false, minSelect: 0, maxSelect: 2, sortOrder: 2,
    options: [option(productId, 4, id, 'Trân châu', 10_000), option(productId, 5, id, 'Thạch cà phê', 8_000), option(productId, 6, id, 'Kem cheese', 12_000)],
  };
};

export const seedProducts = (): SeedProduct[] => [
  { product: base(1, 1, 'Cà phê sữa đá', { caffeineLevel: 'High', flavorTags: ['creamy', 'bold'] }),
    variants: variants(1, [['S', 29_000], ['M', 35_000], ['L', 39_000]]), groups: [sugar(1), toppings(1)] },
  { product: base(2, 1, 'Bạc xỉu', { caffeineLevel: 'Medium', flavorTags: ['creamy', 'sweet'] }),
    variants: variants(2, [['M', 35_000], ['L', 39_000]]), groups: [sugar(2), toppings(2)] },
  { product: base(3, 1, 'Americano', { temperature: 'Hot_Or_Iced', caffeineLevel: 'High', flavorTags: ['bold'] }),
    variants: variants(3, [['M', 39_000]]), groups: [sugar(3)] },
  // Variant 41 bị đánh dấu hết hàng ở chi nhánh 1 (xem db.ts) → ẩn khỏi menu mặc định.
  { product: base(4, 2, 'Matcha latte', { temperature: 'Hot_Or_Iced', caffeineLevel: 'Medium', flavorTags: ['creamy', 'earthy'] }),
    variants: variants(4, [['M', 49_000]]), groups: [sugar(4)] },
  { product: base(5, 2, 'Trà đào cam sả', { caffeineLevel: 'Low', flavorTags: ['fruity', 'refreshing'] }),
    variants: variants(5, [['M', 45_000], ['L', 52_000]]), groups: [sugar(5), toppings(5)] },
  { product: base(6, 2, 'Cacao đá xay', { temperature: 'Blended', flavorTags: ['sweet', 'chocolate'] }),
    variants: variants(6, [['M', 55_000]]), groups: [sugar(6)] },
  // Không phải đồ uống: temperature = null, không có option group.
  { product: base(7, 3, 'Bánh croissant', { temperature: null, flavorTags: ['buttery'] }),
    variants: variants(7, [['Standard', 35_000]]), groups: [] },
  // Không còn variant Active → price/maxPrice = null (UI phải xử lý).
  { product: base(8, 3, 'Combo mùa thu', { temperature: null }),
    variants: variants(8, [['Standard', 79_000]]).map((v) => ({ ...v, status: 'Inactive' as const })), groups: [] },
];

export const seedTables = (): Table[] => [
  ...[1, 2, 3, 4, 5].map((n) => ({ id: n, branchId: BRANCH_ID, tableNumber: String(n).padStart(2, '0'), qrCode: `QR-B1-T0${n}`, isActive: true })),
  { id: 6, branchId: BRANCH_ID, tableNumber: '06', qrCode: 'QR-B1-T06', isActive: false }, // bàn đang khoá
];