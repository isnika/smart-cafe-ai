import { DINE_IN_BRANCH_ID } from '@/features/dine-in/config';

/** Fallback legacy for saved carts; online ordering requires an explicit branch selection. */
export const ONLINE_BRANCH_ID = DINE_IN_BRANCH_ID;

/**
 * Chế độ mock (VITE_USE_MOCK=true). Đọc tại thời điểm gọi (không cache) để test dùng được vi.stubEnv.
 * Dùng cho các hành vi chỉ tồn tại ở mock: voucher (Engagement ngoài phạm vi) và gợi ý phương thức thanh toán cho mock.
 */
export const isMockMode = (): boolean => import.meta.env.VITE_USE_MOCK === 'true';

/** Voucher thuộc Engagement (ngoài phạm vi lát này): chỉ hoạt động ở mock, chế độ thật vô hiệu hoá và không gửi voucher_code. */
export const isVoucherEnabled = isMockMode;
