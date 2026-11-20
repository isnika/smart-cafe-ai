import { useQuery } from "@tanstack/react-query";
import { catalogApi } from "@/shared/api";
import { useCategories } from "@/features/dine-in/hooks/useMenu";
import { useOnlineCartStore } from "@/features/online-order/store";

export { useCategories };

/** Menu công khai theo chi nhánh (catalog API không cần đăng nhập). Ẩn món hết hàng mặc định. */
export const usePublicMenu = () => {
  const branchId = useOnlineCartStore((state) => state.branchId);
  return useQuery({
    queryKey: ["catalog", "products", branchId],
    enabled: branchId !== null,
    queryFn: ({ signal }) => catalogApi.listProducts({ branchId: branchId! }, signal),
    select: (rows) => rows.filter((p) => p.price !== null && p.isAvailable).sort((a, b) => a.sortOrder - b.sortOrder),
  });
};
