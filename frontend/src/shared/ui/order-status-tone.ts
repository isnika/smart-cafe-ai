import type { BadgeTone } from "./Badge";

/** Map trạng thái đơn -> tông màu, dùng chung cho Order Queue, Tracking, Mini Card */
export const orderStatusTone: Record<string, BadgeTone> = {
  PENDING: "warning",
  CONFIRMED: "info",
  PREPARING: "primary",
  SERVING: "primary",
  READY: "success",
  DELIVERING: "info",
  COMPLETED: "success",
  CANCELLED: "error",
};
