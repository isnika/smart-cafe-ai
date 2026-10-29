/** Chu kỳ làm mới danh sách thu ngân (polling, không dùng WebSocket). */
export const CASHIER_REFETCH_MS = 5_000;

/**
 * Cho phép nút "Xác nhận đã thu" gọi API thật.
 * Phase 1: TẮT vì chưa có mock `POST /payment/payments`; bật lại (true) ở phase 2 khi mock + e-invoice đã có.
 * Khi tắt, UI không giả lập thu thành công bằng cách đổi state phía frontend.
 */
export const COUNTER_PAYMENT_ENABLED = false;
