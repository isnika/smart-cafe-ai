import type {
  CartLineInput,
  CartView,
  ChangeOrderStatusInput,
  CreateOrderInput,
  GetCartInput,
  ListOrdersParams,
  OrderDetail,
  Page,
  UpdateCartItemInput,
} from '@/shared/types';
import { http } from './http';

const P = '/orders-svc';

// Cart
/** Lấy (hoặc tạo) giỏ Active. QR ẩn danh nên không bắt buộc token. */
export const getCart = (input: GetCartInput) => http.post<CartView>(`${P}/carts/active`, input);
export const addCartItem = (cartId: number, line: CartLineInput) => http.post<CartView>(`${P}/carts/${cartId}/items`, line);
export const updateCartItem = (cartId: number, itemId: number, input: UpdateCartItemInput) =>
  http.patch<CartView>(`${P}/carts/${cartId}/items/${itemId}`, input);
export const removeCartItem = (cartId: number, itemId: number) => http.delete<CartView>(`${P}/carts/${cartId}/items/${itemId}`);

// Order
export const createOrder = (input: CreateOrderInput) => http.post<OrderDetail>(`${P}/orders`, input);
/** Page<OrderDetail>: Kanban cần items/tableNumber để vẽ card mà không phải gọi N lần. */
export const listOrders = (params: ListOrdersParams = {}, signal?: AbortSignal) =>
  http.get<Page<OrderDetail>>(`${P}/orders`, { query: params, signal });
export const getOrder = (id: number) => http.get<OrderDetail>(`${P}/orders/${id}`);

/** Lệch version → ApiError 409 VERSION_CONFLICT; sai transition → INVALID_TRANSITION. */
export const changeOrderStatus = (id: number, input: ChangeOrderStatusInput) =>
  http.patch<OrderDetail>(`${P}/orders/${id}/status`, input);