import { Card } from '@/shared/ui';
import { ConsumptionChart, type ConsumptionBar } from '@/features/manager-inventory/components/ConsumptionChart';
import { formatQty } from '@/features/manager-inventory/model';
import { INGREDIENT_FORECAST_DAYS, type IngredientOption } from '../model';

/** Tiêu thụ 1 nguyên liệu: cột xám = thực tế, cột tím = dự báo (dùng lại ConsumptionChart của màn Kho). */
export function IngredientForecastCard({
  options, selectedId, onSelect, bars, unit,
}: {
  options: IngredientOption[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  bars: ConsumptionBar[];
  unit: string;
}) {
  const forecastTotal = bars.filter((b) => b.forecast).reduce((s, b) => s + b.value, 0);
  return (
    <Card padding="md" className="space-y-3">
      <h2 className="text-h4 text-gray-900">Tiêu thụ nguyên liệu · {INGREDIENT_FORECAST_DAYS} ngày</h2>
      <select
        aria-label="Chọn nguyên liệu"
        value={selectedId ?? ''}
        onChange={(e) => onSelect(Number(e.target.value))}
        className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-body text-gray-800"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name} ({o.unit})</option>
        ))}
      </select>
      {bars.length === 0 ? (
        <p role="status" className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-gray-500">Chưa có dự báo cho nguyên liệu này</p>
      ) : (
        <ConsumptionChart
          data={bars}
          unit={unit}
          highlightLast={false}
          summaryLabel="Tiêu thụ thực tế gần nhất và dự báo"
          caption={`Nâu: thực tế · Tím: dự báo · dự báo ${INGREDIENT_FORECAST_DAYS} ngày tới ${formatQty(Math.round(forecastTotal))} ${unit}`}
        />
      )}
    </Card>
  );
}
