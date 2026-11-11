import { cn } from '@/shared/lib/cn';
import type { StaffTable } from '@/shared/api/staff-table.types';
import { Badge } from '@/shared/ui';
import { TABLE_STATUS_LABEL } from '../model';

/** Mỗi ô hiển thị đúng `status` server trả cho bàn đó; không đọc danh sách phiên để đoán Empty/Occupied. */
export function TableGrid({ tables }: { tables: readonly StaffTable[] }) {
  return (
    <ul aria-label="Danh sách bàn" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {tables.map((t) => (
        <li
          key={t.id}
          aria-label={`Bàn ${t.tableNumber}: ${t.status ? TABLE_STATUS_LABEL[t.status] : 'Không rõ trạng thái'}${t.isActive ? '' : ', tạm ngưng'}`}
          className={cn(
            'space-y-1 rounded-lg border p-3',
            t.status === 'Occupied' ? 'border-warning/40 bg-warning-soft/40' : 'border-gray-200 bg-white',
            !t.isActive && 'opacity-60',
          )}
        >
          <p className="font-heading text-h4 text-gray-900">Bàn {t.tableNumber}</p>
          <div className="flex flex-wrap gap-1">
            <Badge tone={t.status === 'Occupied' ? 'warning' : t.status === 'Empty' ? 'success' : 'neutral'}>
              {t.status ? TABLE_STATUS_LABEL[t.status] : 'Không rõ'}
            </Badge>
            {!t.isActive && <Badge tone="neutral">Tạm ngưng</Badge>}
          </div>
          {t.openSessionId !== null && <p className="text-caption text-gray-500">Phiên #{t.openSessionId}</p>}
        </li>
      ))}
    </ul>
  );
}
