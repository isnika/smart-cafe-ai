import { isApiError, orderApi } from '@/shared/api';
import { parseUtc } from '@/shared/lib';
import type { OrderDetail, Payment } from '@/shared/types';
import { PaymentRetryBlockedError } from './errors';
import { choiceOfMethod, initiatePayment, newKey, type PaymentNext } from './payment';

/**
 * Retry thanh toán online (VNPay/Momo) cho CÙNG một đơn sau khi giao dịch trước Failed/Cancelled/Expired.
 * Phạm vi: chỉ tạo giao dịch MỚI; không tạo đơn, không sửa/huỷ đơn, không tái sử dụng giao dịch cũ.
 */

/** Giao dịch có thể retry: đã chốt không thành công. Success/Pending không bao giờ retry. */
export const RETRYABLE_PAYMENT_STATUSES: ReadonlySet<string> = new Set(['Failed', 'Cancelled', 'Expired']);
export const isRetryableStatus = (status: string): boolean => RETRYABLE_PAYMENT_STATUSES.has(status);

const BLOCK_MESSAGE = {
  ORDER_NOT_FOUND: 'Không tìm thấy đơn hàng để thanh toán lại.',
  ORDER_NOT_PENDING_PAYMENT: 'Đơn hàng không còn ở trạng thái chờ thanh toán nên không thể thanh toán lại. Vui lòng kiểm tra đơn hàng.',
  ORDER_EXPIRED: 'Đơn hàng đã quá hạn thanh toán nên không thể thanh toán lại. Vui lòng đặt đơn mới.',
  ORDER_ALREADY_PAID: 'Đơn hàng này đã được thanh toán.',
  PAYMENT_METHOD_UNSUPPORTED: 'Phương thức thanh toán của giao dịch trước không hỗ trợ thanh toán lại.',
} as const;

const blocked = (code: keyof typeof BLOCK_MESSAGE) => new PaymentRetryBlockedError(code, BLOCK_MESSAGE[code]);

/**
 * Đơn có được phép retry không — dựa trên bản đơn VỪA lấy từ server (không dùng bản cache/placed-orders).
 * Phải là đơn Online, còn Pending_Payment, chưa Paid, chưa quá `expiresAt`. Thiếu `expiresAt` coi là chưa có hạn
 * (server vẫn là nơi quyết định cuối: POST /payments sẽ trả 409 nếu thực tế không còn hợp lệ).
 * Đồng hồ máy khách chỉ để chặn sớm; lệch giờ không gây trả tiền sai vì server kiểm tra lại.
 */
export function retryBlockReason(order: Pick<OrderDetail, 'orderSource' | 'status' | 'paymentStatus' | 'expiresAt'>, nowMs: number): PaymentRetryBlockedError | null {
  if (order.paymentStatus === 'Paid' || order.paymentStatus === 'Refunded' || order.paymentStatus === 'Partially_Refunded') return blocked('ORDER_ALREADY_PAID');
  if (order.orderSource !== 'Online' || order.status !== 'Pending_Payment') return blocked('ORDER_NOT_PENDING_PAYMENT');
  const deadline = parseUtc(order.expiresAt);
  if (deadline && deadline.getTime() <= nowMs) return blocked('ORDER_EXPIRED');
  return null;
}

// Idempotency-Key của lần retry: sinh MỚI cho mỗi lần retry có chủ đích (khác key của giao dịch đầu), rồi giữ nguyên
// khi gọi lại sau lỗi mạng/timeout của chính lần retry đó (server có thể đã tạo giao dịch). Xong/bị chặn → bỏ khoá.
const retryKeys = new Map<number, string>();
const inflight = new Map<number, Promise<RetryResult>>();
/** Chỉ dành cho test. */
export const resetPaymentRetry = (): void => {
  retryKeys.clear();
  inflight.clear();
};

const keyForRetry = (orderId: number, previousKey: string | null): string => {
  let key = retryKeys.get(orderId);
  if (!key) {
    key = newKey();
    while (key === previousKey) key = newKey(); // không bao giờ trùng key của giao dịch cũ
    retryKeys.set(orderId, key);
  }
  return key;
};

export interface RetryResult {
  order: OrderDetail;
  next: PaymentNext;
}

export interface RetryDeps {
  /** Mặc định GET /orders/{id} (có mapper tiền → number). Test có thể thay. */
  getOrder?: (id: number) => Promise<OrderDetail>;
  initiate?: typeof initiatePayment;
  now?: () => number;
}

const fetchOrder = async (id: number): Promise<OrderDetail> => orderApi.toOrderDetail(await orderApi.getOrder(id));

async function run(
  orderId: number,
  failed: Pick<Payment, 'paymentMethod' | 'idempotencyKey'>,
  deps: RetryDeps,
): Promise<RetryResult> {
  const choice = choiceOfMethod(failed.paymentMethod);
  if (!choice) throw blocked('PAYMENT_METHOD_UNSUPPORTED');
  const getOrder = deps.getOrder ?? fetchOrder;
  const initiate = deps.initiate ?? initiatePayment;
  const now = deps.now ?? Date.now;

  // 1) Luôn lấy đơn mới nhất từ server trước khi tạo giao dịch.
  let order: OrderDetail;
  try {
    order = await getOrder(orderId);
  } catch (e) {
    if (isApiError(e) && e.status === 404) throw blocked('ORDER_NOT_FOUND');
    throw e; // mạng/5xx/401/403: không kết luận đơn không hợp lệ; UI báo lỗi và cho bấm lại
  }

  // 2) Đơn không hợp lệ → chặn, KHÔNG gọi POST /payments.
  const block = retryBlockReason(order, now());
  if (block) {
    retryKeys.delete(orderId);
    throw block;
  }

  // 3) Giao dịch MỚI cho cùng đơn: số tiền theo đơn vừa lấy, Idempotency-Key mới (rememberPaymentId ghi đè id cũ).
  try {
    const next = await initiate(order, choice, { idempotencyKey: keyForRetry(orderId, failed.idempotencyKey ?? null) });
    retryKeys.delete(orderId);
    return { order, next };
  } catch (e) {
    if (isApiError(e) && e.status === 409) {
      if (e.code === 'ORDER_ALREADY_PAID') {
        retryKeys.delete(orderId);
        throw blocked('ORDER_ALREADY_PAID');
      }
      if (e.code === 'ORDER_NOT_PAYABLE') {
        retryKeys.delete(orderId);
        throw blocked('ORDER_NOT_PENDING_PAYMENT');
      }
    }
    throw e; // lỗi tạm thời: giữ nguyên key của lần retry này cho lần bấm tiếp theo
  }
}

/**
 * Thử thanh toán lại. Hai lần gọi đồng thời cho cùng đơn dùng chung một lần chạy (không tạo hai giao dịch).
 * Ném `PaymentRetryBlockedError` khi đơn không hợp lệ; các lỗi khác (mạng, 5xx…) ném nguyên để UI báo và cho thử lại.
 */
export function retryPayment(
  orderId: number,
  failed: Pick<Payment, 'paymentMethod' | 'idempotencyKey'>,
  deps: RetryDeps = {},
): Promise<RetryResult> {
  const running = inflight.get(orderId);
  if (running) return running;
  const p = run(orderId, failed, deps).finally(() => {
    if (inflight.get(orderId) === p) inflight.delete(orderId);
  });
  inflight.set(orderId, p);
  return p;
}
