import type { PageMeta } from '@/shared/api/order-me.types';
import { Button } from '@/shared/ui';

interface Props {
  meta: PageMeta;
  busy?: boolean;
  onPage: (page: number) => void;
}

/** Điều khiển trang dựa hoàn toàn vào meta của API (page/totalPages). Chỉ hiện khi có nhiều hơn một trang. */
export function OrderPagination({ meta, busy = false, onPage }: Props) {
  if (meta.totalPages <= 1) return null;
  return (
    <nav aria-label="Phân trang đơn hàng" className="flex items-center justify-between gap-3 pt-2">
      <Button variant="outline" size="sm" disabled={busy || meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
        Trang trước
      </Button>
      <p className="text-caption text-gray-600" aria-live="polite">
        Trang {meta.page}/{meta.totalPages}
      </p>
      <Button variant="outline" size="sm" disabled={busy || meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>
        Trang sau
      </Button>
    </nav>
  );
}
