import { useQuery } from "@tanstack/react-query";
import { catalogApi } from "@/shared/api";
import { DINE_IN_BRANCH_ID } from "@/features/dine-in/config";
import { useCategories } from "@/features/dine-in/hooks/useMenu";

export { useCategories };

/** Menu công khai theo chi nhánh (catalog API không cần đăng nhập). Ẩn món hết hàng mặc định. */
export const usePublicMenu = () =>
  useQuery({
    queryKey: ["catalog", "products", DINE_IN_BRANCH_ID],
    queryFn: ({ signal }) => catalogApi.listProducts({ branchId: DINE_IN_BRANCH_ID }, signal),
    select: (rows) => rows.filter((p) => p.price !== null && p.isAvailable).sort((a, b) => a.sortOrder - b.sortOrder),
  });
