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

  // Customer - Dine-in
  dineInTable: "/dine-in/table/:tableCode", // QR Ordering Page
  dineInCheckout: "/dine-in/checkout",
  counterPayment: "/dine-in/pay/counter/:orderId", // Counter Payment QR

  // Staff
  staff: "/staff", // Dashboard (tab Tổng quan + tab Thu ngân)
  staffQueue: "/staff/queue",
  staffOrder: "/staff/orders/:orderId",
  staffCheckin: "/staff/checkin",

  // Manager
  manager: "/manager",
  managerInventory: "/manager/inventory",
  managerForecast: "/manager/forecast",

  // Admin
  admin: "/admin",
  adminUsers: "/admin/users",
  adminTables: "/admin/tables", // Table & QR Management (nút "Tạo QR ca hôm nay")
} as const;

export const to = {
  product: (id: string) => `/menu/${id}`,
  order: (orderId: string) => `/orders/${orderId}`,
  payment: (orderId: string) => `/payment/${orderId}`,
  paymentSuccess: (orderId: string) => `/payment/${orderId}/success`,
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
