import { FULFILLMENT_LABEL, SOURCE_LABEL, formatPercent, type OrderMix } from '../model';

interface Row {
  key: string;
  label: string;
  count: number;
}

function BarGroup({ title, rows, total }: { title: string; rows: Row[]; total: number }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="text-body font-medium text-gray-700">{title}</h3>
      <ul className="space-y-2">
        {rows.map((row) => {
          const ratio = total > 0 ? row.count / total : 0;
          return (
            <li key={row.key}>
              <div className="flex items-baseline justify-between text-body">
                <span className="text-gray-800">{row.label}</span>
                <span className="text-gray-600">
                  <span className="font-semibold text-gray-900">{row.count}</span> đơn · {formatPercent(ratio)}
                </span>
              </div>
              <div aria-hidden className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-primary-500" style={{ width: `${ratio * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Thanh ngang theo hình thức và theo nguồn; đã loại đơn huỷ/từ chối (xem orderMix). */
export function OrderMixCard({ mix }: { mix: OrderMix }) {
  const fulfillment = (Object.keys(FULFILLMENT_LABEL) as (keyof OrderMix['byFulfillment'])[]).map((key) => ({
    key,
    label: FULFILLMENT_LABEL[key],
    count: mix.byFulfillment[key],
  }));
  const source = (Object.keys(SOURCE_LABEL) as (keyof OrderMix['bySource'])[]).map((key) => ({
    key,
    label: SOURCE_LABEL[key],
    count: mix.bySource[key],
  }));

  return (
    <div className="space-y-5">
      <BarGroup title="Theo hình thức" rows={fulfillment} total={mix.total} />
      <BarGroup title="Theo nguồn" rows={source} total={mix.total} />
      <p className="text-caption text-gray-500">{mix.total} đơn, không tính đơn đã huỷ/từ chối.</p>
    </div>
  );
}
