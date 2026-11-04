import { useAuthStore } from '@/features/auth/store';
import { usePlacedOrders } from '@/features/dine-in/placed-orders';
import { resetCartInternals, useDineInCartStore } from '@/features/dine-in/store';
import { openDineInSession } from '@/features/dine-in/session';
import { resetSubmitState } from '@/features/dine-in/submit';
import { resetDb } from '@/mocks/db';
import { mockConfig } from '@/mocks/utils';
import { resetGuestMemory } from '@/shared/api/guest';
import type { NewCartLine } from '@/features/dine-in/cart';
import type { User } from '@/shared/types';

export const TABLE_CODE = 'QR-B1-T01';

export const latte: NewCartLine = {
  productId: 1, productName: 'Cà phê sữa đá', variantId: 12, variantName: 'M', unitPrice: 35_000,
  options: [
    { optionId: 101, optionName: '100% đường', extraPrice: 0, quantity: 1 },
    { optionId: 104, optionName: 'Trân châu', extraPrice: 10_000, quantity: 1 },
  ],
};

/** Đưa mọi store/mock về trạng thái ban đầu giữa các test. */
export function resetWorld(): void {
  resetDb();
  mockConfig.latencyMs = 0;
  mockConfig.enforceAuth = false;
  resetSubmitState();
  resetCartInternals();
  resetGuestMemory();
  useDineInCartStore.setState({
    tableSessionId: null, tableCode: null, sessionCode: null, branchId: null,
    cartId: null, lines: [], serverSubTotal: null, pending: 0, error: null,
  });
  if (typeof localStorage !== 'undefined') localStorage.clear();
  usePlacedOrders.setState({ orders: [] });
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
  useAuthStore.setState({ status: 'anonymous', accessToken: null, user: null, roleName: null });
}

/** Mở phiên bàn thật qua MSW rồi gắn vào giỏ — giống DineInTablePage làm khi vào /dine-in/table/:code. */
export async function startTableSession(code = TABLE_CODE): Promise<number> {
  const session = await openDineInSession(code);
  useDineInCartStore.getState().bindSession(session.id, code, session.sessionCode, session.branchId);
  await useDineInCartStore.getState().loadCart(); // chờ nạp giỏ server (rỗng) xong để test không race
  return session.id;
}

export const fakeUser = (over: Partial<User> = {}): User => ({
  id: 'u-1', fullName: 'Nhân viên Test', roleId: 1, status: 'Active',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...over,
});

export function loginAs(roleName: 'Customer' | 'Staff', over: Partial<User> = {}): void {
  useAuthStore.setState({ status: 'authenticated', accessToken: 't', user: fakeUser(over), roleName });
}
