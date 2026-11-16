import { useMemo } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { isApiError } from '@/shared/api';
import { Skeleton } from '@/shared/ui';
import type { InventoryItemView } from '@/shared/types';
import { StockStatusBadge } from '@/features/manager-inventory/components/StockStatusBadge';
import { countByStatus, formatQty, statusOfItem } from '@/features/manager-inventory/model';
import { lowStockTop } from '../model';
import { SectionEmpty, SectionError, StaleNote } from './SectionState';

const TOP_N = 5;

/** Nội dung card "Cảnh báo kho": tự xử lý chưa gán chi nhánh / đang tải / lỗi / kho ổn. */
export function LowStockCard({ branchId, stock }: { branchId: number | null; stock: UseQueryResult<InventoryItemView[]> }) {
  const items = useMemo(() => stock.data ?? [], [stock.data]);
  const top = useMemo(() => lowStockTop(items, TOP_N), [items]);
  const counts = useMemo(() => countByStatus(items), [items]);
  const more = counts.low + counts.out - top.length;

  if (branchId === null) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <AlertTriangle aria-hidden className="size-8 text-warning" />
        <p className="font-medium text-gray-900">Tài khoản chưa được gán chi nhánh</p>
        <p className="max-w-md text-body text-gray-600">Liên hệ quản trị viên để được gán chi nhánh trước khi xem cảnh báo kho.</p>
      </div>
    );
  }

  if (stock.isPending) {
    return (
      <div role="status" aria-label="Đang tải cảnh báo kho" className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!stock.data) {
    return (
      <SectionError
        title="Không tải được dữ liệu kho"
        message={isApiError(stock.error) ? stock.error.message : undefined}
        onRetry={() => void stock.refetch()}
        retrying={stock.isFetching}
      />
    );
  }

  return (
    <div className="space-y-3">
      {stock.isError && <StaleNote onRetry={() => void stock.refetch()}>Không cập nhật được kho, đang hiển thị dữ liệu lần tải trước.</StaleNote>}
      {items.length === 0 ? (
        <SectionEmpty>Chưa có nguyên liệu nào trong kho</SectionEmpty>
      ) : top.length === 0 ? (
        <p role="status" className="flex items-center justify-center gap-2 rounded-lg bg-success-soft py-6 text-success-strong">
          <CheckCircle2 aria-hidden className="size-5" /> Kho đang ổn
        </p>
      ) : (
        <>
          <ul className="divide-y divide-gray-100">
            {top.map((item) => (
              <li key={item.ingredientId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{item.ingredientName}</p>
                  <p className="text-caption text-gray-500">
                    Khả dụng {formatQty(item.available)} / ngưỡng {formatQty(item.reorderLevel)} {item.unit}
                  </p>
                </div>
                <StockStatusBadge status={statusOfItem(item)} />
              </li>
            ))}
          </ul>
          {more > 0 && <p className="text-caption text-gray-500">Còn {more} nguyên liệu khác cần chú ý.</p>}
        </>
      )}
      <Link to={PATHS.managerInventory} className="inline-block text-body font-medium text-primary-700 underline-offset-2 hover:underline">
        Xem kho
      </Link>
    </div>
  );
}
