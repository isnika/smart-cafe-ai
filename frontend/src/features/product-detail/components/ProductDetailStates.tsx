import { Link } from "react-router-dom";
import { PATHS } from "@/app/routes";
import { StateMessage } from "@/features/dine-in/components/StateMessage";
import { isApiError } from "@/shared/api";
import { Button, Skeleton } from "@/shared/ui";

export function ProductDetailSkeleton() {
  return (
    <div aria-busy aria-label="Đang tải sản phẩm">
      <Skeleton className="aspect-[3/2] w-full rounded-none" />
      <div className="space-y-4 px-4 pt-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-12" />
        <Skeleton className="h-20" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}

const BackToMenu = () => (
  <Link
    to={PATHS.menu}
    className="inline-flex h-10 items-center rounded-md bg-primary-600 px-4 text-body font-medium text-white hover:bg-primary-700"
  >
    Quay lại thực đơn
  </Link>
);

/** id trên URL không hợp lệ hoặc API trả 404 (món không tồn tại / đã ẩn). */
export function ProductNotFound() {
  return (
    <StateMessage title="Không tìm thấy sản phẩm" action={<BackToMenu />}>
      Món này không tồn tại hoặc đã ngừng bán.
    </StateMessage>
  );
}

/** Lỗi mạng / máy chủ: cho thử lại, vẫn có đường quay về thực đơn. */
export function ProductLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div role="alert" className="mx-4 mt-6 rounded-xl border border-primary-100 bg-white p-6 text-center">
      <p className="font-semibold">Không tải được sản phẩm</p>
      <p className="mt-1 text-body text-gray-600">{isApiError(error) ? error.message : "Vui lòng thử lại."}</p>
      <div className="mt-3 flex items-center justify-center gap-3">
        <Button variant="outline" onClick={onRetry}>
          Thử lại
        </Button>
        <BackToMenu />
      </div>
    </div>
  );
}
