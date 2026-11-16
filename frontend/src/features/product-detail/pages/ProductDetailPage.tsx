import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { PATHS } from "@/app/routes";
import { PageHeader } from "@/features/dine-in/components/PageHeader";
import { useCategories } from "@/features/dine-in/hooks/useMenu";
import { isApiError } from "@/shared/api";
import { ProductDetailView } from "../components/ProductDetailView";
import { ProductDetailSkeleton, ProductLoadError, ProductNotFound } from "../components/ProductDetailStates";
import { useProduct } from "../hooks/useProduct";
import { parseProductId } from "../model";

const Shell = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-primary-50">
    <PageHeader title="Chi tiết món" back={PATHS.menu} />
    {children}
  </div>
);

/** /menu/:id – chi tiết món: chọn size/tuỳ chọn, số lượng, thêm vào giỏ Online, và đánh giá của món. */
export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const productId = parseProductId(id);
  const product = useProduct(productId);
  const categories = useCategories();

  // id không hợp lệ: không gọi API (useProduct bị tắt), hiển thị luôn trạng thái không tìm thấy.
  if (productId === null) {
    return (
      <Shell>
        <ProductNotFound />
      </Shell>
    );
  }
  if (product.isPending) {
    return (
      <Shell>
        <ProductDetailSkeleton />
      </Shell>
    );
  }
  if (product.isError) {
    return (
      <Shell>
        {isApiError(product.error) && product.error.status === 404 ? (
          <ProductNotFound />
        ) : (
          <ProductLoadError error={product.error} onRetry={() => void product.refetch()} />
        )}
      </Shell>
    );
  }

  // Danh mục chỉ là thông tin phụ: tải lỗi/chưa xong thì bỏ qua, không chặn trang.
  const categoryName = categories.data?.find((c) => c.id === product.data.categoryId)?.name;
  return (
    <Shell>
      <ProductDetailView key={product.data.id} detail={product.data} categoryName={categoryName} />
    </Shell>
  );
}
