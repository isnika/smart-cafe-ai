import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { to } from "@/app/routes";
import { openDineInSession, describeSessionError } from "@/features/dine-in/session";

/**
 * Vào bàn bằng mã (nhập tay hoặc quét QR): chỉ điều hướng khi server mở được phiên cho mã đó.
 * Phiên được nạp vào cache cùng queryKey với trang bàn nên trang bàn không mở phiên lần hai.
 * Trả về thông báo lỗi (hoặc null nếu thành công).
 */
export function useEnterTable() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useCallback(
    async (code: string): Promise<string | null> => {
      try {
        const session = await openDineInSession(code);
        qc.setQueryData(["dine-in", "session", code], session);
        navigate(to.dineInTable(code));
        return null;
      } catch (err) {
        return describeSessionError(err).message;
      }
    },
    [qc, navigate],
  );
}
