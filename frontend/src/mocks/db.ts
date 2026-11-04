import type {
  AIForecast, AIRecommendation, ChatMessage, ChatSession, Ingredient, Inventory, InventoryLog, Invoice, InvoiceItem, InvoiceRequestInput, MenuProduct, OrderDetail, Payment, PaymentOrderAllocation,
  ProductReviewView, ProductVariant, Schedule, Shift, StaffProfile, Table, TableSession, Timekeeping,
} from '@/shared/types';
import { BRANCH_ID, seedProducts, seedTables, type SeedProduct } from './fixtures';
import { buildForecastSeed } from './forecast-seed';
import { buildInventorySeed } from './inventory-seed';
import { buildRecommendationSeed } from './recommendation-seed';
import { seedReviews } from './review-seed';
import { buildWorkforceSeed } from './workforce-seed';

export { BRANCH_ID };

/** Hóa đơn + liên kết nội bộ (Invoice trong contract không mang paymentId/orderId). 1 payment ↔ tối đa 1 hóa đơn. */
export interface MockInvoiceRecord {
  invoice: Invoice;
  paymentId: number;
  orderIds: number[];
  items: InvoiceItem[];
}

/** Giỏ QR server-side (spec "4. Order / Giỏ hàng"): một giỏ Active cho mỗi (phiên bàn, client key). */
export interface MockCartItem {
  id: number;
  variantId: number;
  quantity: number;
  note: string | null;
  options: { optionId: number; quantity: number }[];
}
export interface MockCart {
  id: number;
  branchId: number;
  tableSessionId: number;
  clientKey: string;
  status: 'Active' | 'Converted' | 'Abandoned';
  items: MockCartItem[];
  createdAt: string;
  updatedAt: string;
}

export interface MockDb {
  products: SeedProduct[];
  tables: Table[];
  sessions: TableSession[];
  carts: MockCart[];
  orders: OrderDetail[];
  payments: Payment[];
  allocations: PaymentOrderAllocation[];
  invoices: MockInvoiceRecord[];
  /** Thông tin người mua khách xin lúc tạo giao dịch cổng thanh toán; dùng khi giao dịch thành công. paymentId → input. */
  invoiceRequests: Record<number, InvoiceRequestInput>;
  /** "branchId:variantId" – không có key = CÒN HÀNG (đúng quy ước của types.ts). */
  unavailableVariants: Set<string>;
  /** Kho: nguyên liệu, tồn kho theo chi nhánh (có version cho optimistic locking) và nhật ký biến động. */
  ingredients: Ingredient[];
  inventory: Inventory[];
  inventoryLogs: InventoryLog[];
  /** Dự báo AI (Intelligence service): doanh thu + tiêu thụ nguyên liệu theo ngày, gồm cả lượt chạy cũ (isLatest=false). Chỉ đọc. */
  forecasts: AIForecast[];
  /** Gợi ý AI theo người dùng (Intelligence service). Nằm trong RAM: bấm vào gợi ý sẽ ghi clickedAt, reset cùng resetDb. */
  recommendations: AIRecommendation[];
  /** Review món (mọi trạng thái; API công khai chỉ trả Approved). Chỉ đọc – chưa có API tạo review. */
  reviews: ProductReviewView[];
  /** Chat AI cho khách (Intelligence service): phiên + tin nhắn, giữ trong RAM nên F5 là mất (reset cùng resetDb). */
  chatSessions: ChatSession[];
  chatMessages: ChatMessage[];
  /** Workforce (Store service): ca, hồ sơ nhân viên, lịch làm và bản ghi chấm công. Nằm trong RAM, reset cùng resetDb. */
  shifts: Shift[];
  staffProfiles: StaffProfile[];
  schedules: Schedule[];
  timekeepings: Timekeeping[];
  seq: {
    order: number; item: number; option: number; history: number; session: number;
    payment: number; allocation: number; invoice: number; invoiceItem: number; inventoryLog: number;
    chatSession: number; chatMessage: number; timekeeping: number; cart: number; cartItem: number;
  };
}

export const availKey = (branchId: number, variantId: number) => `${branchId}:${variantId}`;

const createDb = (): MockDb => {
  const inv = buildInventorySeed();
  const wf = buildWorkforceSeed();
  return {
    products: seedProducts(),
    tables: seedTables(),
    sessions: [],
    carts: [],
    orders: [],
    payments: [],
    allocations: [],
    invoices: [],
    invoiceRequests: {},
    unavailableVariants: new Set([availKey(BRANCH_ID, 41)]), // Matcha hết hàng
    ingredients: inv.ingredients,
    inventory: inv.inventory,
    inventoryLogs: inv.logs,
    forecasts: buildForecastSeed(),
    recommendations: buildRecommendationSeed(),
    reviews: seedReviews(),
    chatSessions: [],
    chatMessages: [],
    shifts: wf.shifts,
    staffProfiles: wf.staffProfiles,
    schedules: wf.schedules,
    timekeepings: [],
    seq: {
      order: 0, item: 0, option: 0, history: 0, session: 0, payment: 0, allocation: 0, invoice: 0, invoiceItem: 0,
      inventoryLog: inv.logs.length, chatSession: 0, chatMessage: 0, timekeeping: 0, cart: 0, cartItem: 0,
    },
  };
};

export const db: MockDb = createDb();

/** Đưa mọi thứ về seed ban đầu (dùng trong beforeEach của test hoặc `__mock.resetDb()`). */
export const resetDb = () => Object.assign(db, createDb());

/** Backend lưu datetime không kèm timezone (UTC) → mock cố ý trả đúng dạng đó để normalizeTimestamps được chạy thật. */
export const nowNaive = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString().slice(0, 19);
export const isExpired = (naive?: string | null) => !!naive && Date.parse(`${naive}Z`) <= Date.now();

export function findVariant(variantId: number): { seed: SeedProduct; variant: ProductVariant } | undefined {
  for (const seed of db.products) {
    const variant = seed.variants.find((v) => v.id === variantId);
    if (variant) return { seed, variant };
  }
  return undefined;
}

/** Sellable ⇔ product Active ∧ variant Active ∧ (không có row ∨ isAvailable). */
export const isSellable = (branchId: number, seed: SeedProduct, variant: ProductVariant) =>
  seed.product.status === 'Active' && variant.status === 'Active' && !db.unavailableVariants.has(availKey(branchId, variant.id));

export function toMenuProduct(seed: SeedProduct, branchId: number): MenuProduct {
  const active = seed.variants.filter((v) => v.status === 'Active');
  const prices = active.map((v) => v.price);
  const p = seed.product;
  return {
    id: p.id, categoryId: p.categoryId, name: p.name, image: p.image, description: p.description,
    temperature: p.temperature, caffeineLevel: p.caffeineLevel, flavorTags: p.flavorTags,
    status: p.status, sortOrder: p.sortOrder,
    price: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    isAvailable: active.some((v) => isSellable(branchId, seed, v)),
  };
}

/** Giả lập "người khác vừa sửa đơn" → lần PATCH kế tiếp của UI sẽ dính 409 VERSION_CONFLICT. */
export function bumpVersion(orderId: number): void {
  const order = db.orders.find((o) => o.id === orderId);
  if (order) {
    order.version += 1;
    order.updatedAt = nowNaive();
  }
}