import { useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { Badge, Button, Card, Modal } from '@/shared/ui';
import { formatQty } from '@/features/manager-inventory/model';
import { RESTOCK_WINDOW_DAYS, shortDate, type RestockSuggestion } from '../model';

/** Gợi ý nhập hàng + bản nháp chỉ-đọc. Chưa có API tạo đơn nhập nên KHÔNG tự gửi đơn đi đâu cả. */
export function RestockCard({ suggestions, disabledReason }: { suggestions: RestockSuggestion[]; disabledReason?: string }) {
  const [open, setOpen] = useState(false);
  const first = suggestions[0];
  const disabled = !first || !!disabledReason;

  return (
    <Card padding="md" className="space-y-3">
      <h2 className="text-h4 text-gray-900">Gợi ý nhập · cần rà soát</h2>
      {disabledReason ? (
        <p className="text-body text-gray-600">{disabledReason}</p>
      ) : first ? (
        <>
          <ul className="space-y-1 text-body text-gray-700">
            {suggestions.slice(0, 3).map((s) => (
              <li key={s.ingredientId}>
                <span className="font-medium">{s.name}</span> · {formatQty(s.suggestedQty)} {s.unit} <span className="text-gray-500">· hết từ {shortDate(s.runsOutOn)}</span>
              </li>
            ))}
            {suggestions.length > 3 && <li className="text-caption text-gray-500">và {suggestions.length - 3} nguyên liệu khác</li>}
          </ul>
          <p className="text-caption text-gray-500">Giữ nguyên gợi ý gốc. Không tự gửi đơn.</p>
        </>
      ) : (
        <p className="text-body text-gray-600">Tồn kho đủ cho nhu cầu dự báo {RESTOCK_WINDOW_DAYS} ngày tới.</p>
      )}
      <Button fullWidth leftIcon={<ShoppingCart className="size-4" />} disabled={disabled} onClick={() => setOpen(true)}>
        Tạo đơn nhập từ gợi ý
      </Button>
      <p className="text-caption text-gray-500">Kiểm tra số lượng, nhà cung cấp và ngày giao trước khi xác nhận.</p>

      <Modal open={open} onClose={() => setOpen(false)} title="Bản nháp đơn nhập" size="lg" footer={<Button variant="outline" onClick={() => setOpen(false)}>Đóng</Button>}>
        <p className="mb-3 text-body text-gray-600">
          Tính từ dự báo tiêu thụ {RESTOCK_WINDOW_DAYS} ngày tới trừ tồn khả dụng. Đây là bản nháp để rà soát — hệ thống chưa gửi đơn cho nhà cung cấp.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body">
            <thead className="text-caption text-gray-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Nguyên liệu</th>
                <th className="py-1 pr-3 text-right font-medium">Tồn khả dụng</th>
                <th className="py-1 pr-3 text-right font-medium">Cần {RESTOCK_WINDOW_DAYS} ngày</th>
                <th className="py-1 text-right font-medium">Đề xuất nhập</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((s) => (
                <tr key={s.ingredientId} className="border-t border-gray-100">
                  <td className="py-1.5 pr-3">{s.name}</td>
                  <td className="py-1.5 pr-3 text-right">{formatQty(s.available)} {s.unit}</td>
                  <td className="py-1.5 pr-3 text-right">{formatQty(Math.round(s.needed))} {s.unit}</td>
                  <td className="py-1.5 text-right"><Badge tone="warning">{formatQty(s.suggestedQty)} {s.unit}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </Card>
  );
}
