export const PATHS = {
  // Auth
  login: "/login",
  register: "/register",
  verifyOtp: "/verify-otp",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",

  // Customer
  start: "/", // Order Mode Selection (entry, công khai)
  home: "/home",
  menu: "/menu",
  product: "/menu/:id",
  cart: "/cart",
  checkout: "/checkout", // Checkout online
  orders: "/orders",
  order: "/orders/:orderId", // Order Tracking (online)
  profile: "/profile",
  payment: "/payment/:orderId", // Payment Gateway (dùng chung dine-in & online)
  paymentSuccess: "/payment/:orderId/success",
  paymentReturn: "/payment/:orderId/return", // Khách quay về từ cổng VNPay/Momo (polling GET /payments/{id})

  // Customer - Dine-in
  dineInTable: "/dine-in/table/:tableCode", // QR Ordering Page
  dineInCheckout: "/dine-in/checkout",
  counterPayment: "/dine-in/pay/counter/:orderId", // Counter Payment QR

  // Staff
  staff: "/staff", // Dashboard (tab Tổng quan + tab Thu ngân)
  staffQueue: "/staff/queue",
  staffOrder: "/staff/orders/:orderId",
  staffCheckin: "/staff/checkin",
  staffLeave: "/staff/leave",
  staffSchedule: "/staff/schedule",
  staffTables: "/staff/tables", // Bàn & phiên bàn (Staff)

  // Manager
  manager: "/manager",
  managerOrders: "/manager/orders",
  managerInventory: "/manager/inventory",
  managerIngredients: "/manager/ingredients",
  managerForecast: "/manager/forecast",
  managerLeave: "/manager/leave-requests",
  managerSchedules: "/manager/schedules",

  // Admin
  admin: "/admin",
  adminRevenue: "/admin/revenue",
  adminOrders: "/admin/orders",
  adminBranches: "/admin/branches",
  adminTables: "/admin/tables",
  adminUsers: "/admin/users",
  adminProducts: "/admin/products",
  adminCategories: "/admin/categories",
  adminMenus: "/admin/menus",
  adminIngredients: "/admin/ingredients",
  adminSchedules: "/admin/schedules",
} as const;

export const to = {
  product: (id: string) => `/menu/${id}`,
  order: (orderId: string) => `/orders/${orderId}`,
  payment: (orderId: string) => `/payment/${orderId}`,
  paymentSuccess: (orderId: string) => `/payment/${orderId}/success`,
  paymentReturn: (orderId: string) => `/payment/${orderId}/return`,
  dineInTable: (tableCode: string) => `/dine-in/table/${tableCode}`,
  counterPayment: (orderId: string) => `/dine-in/pay/counter/${orderId}`,
  staffOrder: (orderId: string) => `/staff/orders/${orderId}`,
  // Tab Thu ngân nằm trong Dashboard, không có route riêng
  staffCashier: () => `/staff?tab=cashier`,
} as const;

import type { RoleName } from "@/shared/types";

export const roleHome: Record<RoleName, string> = {
  Customer: PATHS.home,
  Staff: PATHS.staff,
  Manager: PATHS.manager,
  Admin: PATHS.admin,
};

/** Resolve a successful login target without trusting a return URL from another role. */
export function homeAfterLogin(roleName: RoleName, requestedPath?: string | null): string {
  if (!requestedPath) return roleHome[roleName];
  const allowed: Record<RoleName, readonly string[]> = {
    Customer: [PATHS.home, PATHS.menu, PATHS.cart, PATHS.checkout, PATHS.orders, PATHS.profile],
    Staff: [PATHS.staff, PATHS.staffQueue, PATHS.staffCheckin, PATHS.staffTables, '/staff/orders/'],
    Manager: [PATHS.manager, PATHS.managerOrders, PATHS.managerInventory, PATHS.managerIngredients, PATHS.managerForecast, PATHS.managerSchedules],
    Admin: [PATHS.admin, PATHS.adminRevenue, PATHS.adminOrders, PATHS.adminBranches, PATHS.adminTables, PATHS.adminUsers, PATHS.adminProducts, PATHS.adminCategories, PATHS.adminMenus, PATHS.adminIngredients, PATHS.adminSchedules],
  };
  const canOpen = allowed[roleName].some((path) =>
    path.endsWith('/') ? requestedPath.startsWith(path) : requestedPath === path || requestedPath.startsWith(`${path}/`),
  );
  return canOpen ? requestedPath : roleHome[roleName];
}
