import { FULFILLMENT_BADGE } from '../pricing';
import type { OnlineFulfillment } from '../store';

/** Pill "Giao hàng / Mang đi" ở góc phải header (theo thiết kế giỏ hàng & checkout Online). */
export function FulfillmentBadge({ type }: { type: OnlineFulfillment }) {
  return (
    <span className="rounded-full bg-accent-50 px-3 py-1 text-caption font-medium text-accent-700">{FULFILLMENT_BADGE[type]}</span>
  );
}
