/**
 * Nhớ `paymentId` của giao dịch online theo đơn, để trang return (khách quay về từ cổng VNPay/Momo) biết hỏi
 * GET /payments/{id} giao dịch nào. Cổng thật chỉ gắn query của riêng nó (vnp_*, ...) vào return_url, không mang
 * paymentId của hệ thống, và các query đó KHÔNG đáng tin để kết luận thanh toán — nên id phải lấy từ dữ liệu đã lưu
 * lúc khởi tạo. sessionStorage: sống qua redirect/F5 trong cùng tab, tự mất khi đóng tab.
 */
const KEY = (orderId: number) => `smartcafe.onlinePayment.${orderId}`;

const positiveInt = (raw: string | null | undefined): number | null => {
  const n = Number(raw);
  return raw != null && raw.trim() !== '' && Number.isInteger(n) && n > 0 ? n : null;
};

/** Lưu paymentId của đơn (ghi đè giao dịch cũ của cùng đơn). Lỗi storage (chế độ riêng tư, đầy) → bỏ qua. */
export function rememberPaymentId(orderId: number, paymentId: number): void {
  try {
    sessionStorage.setItem(KEY(orderId), String(paymentId));
  } catch {
    /* không có storage: return page vẫn thử dùng query `paymentId` (mock) */
  }
}

export function recalledPaymentId(orderId: number): number | null {
  try {
    return positiveInt(sessionStorage.getItem(KEY(orderId)));
  } catch {
    return null;
  }
}

/**
 * Xác định giao dịch cho trang return: dữ liệu đã lưu trước; không có thì dùng `?paymentId=` (URL cổng giả lập của mock
 * mang theo). TUYỆT ĐỐI không đọc vnp_* / trạng thái trên query: chúng không phải bằng chứng thanh toán. Dù id đến từ
 * đâu, trạng thái vẫn chỉ do server (GET /payments/{id}, có kiểm tra chủ giao dịch) quyết định.
 */
export function resolvePaymentId(orderId: number, search: URLSearchParams): number | null {
  return recalledPaymentId(orderId) ?? positiveInt(search.get('paymentId'));
}
