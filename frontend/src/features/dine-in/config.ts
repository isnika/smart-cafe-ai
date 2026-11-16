/**
 * TableSession (types.ts) không trả branchId nên FE cần biết chi nhánh để gọi catalog.
 * Mock chỉ có chi nhánh 1. Khi backend trả branchId trong session thì bỏ file này.
 */
export const DINE_IN_BRANCH_ID = Number(import.meta.env.VITE_BRANCH_ID ?? 1);
