/** Polling bàn/phiên (spec không có SSE/WebSocket cho FE). React Query tự dừng khi tab ẩn / không còn component dùng. */
export const TABLES_REFETCH_MS = 15_000;
/** Số phiên mỗi trang ở các bộ lọc đã đóng (Completed/Cancelled). Phiên mở ≤ số bàn nên lấy tối đa 1 trang. */
export const SESSION_PAGE_SIZE = 20;
