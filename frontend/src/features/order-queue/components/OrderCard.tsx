import { Link } from 'react-router-dom';
import { ShoppingBag, Store, Bike } from 'lucide-react';
import { to } from '@/app/routes';
import type { OrderDetail } from '@/shared/types';
import { itemCount, minutesSince, whereLabel } from '../status';

const ICON = { Dine_In: Store, Pickup: ShoppingBag, Delivery: Bike } as const;

export function OrderCard({ order, now }: { order: OrderDetail; now: number }) {
  const Icon = ICON[order.fulfillmentType];
  return (
    <Link
      to={to.staffOrder(String(order.id))}
      className="block rounded-md border border-gray-200 bg-white p-3 shadow-card transition-shadow hover:shadow-dropdown"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-heading font-semibold text-gray-900">#{order.orderCode}</span>
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-caption text-gray-600">{minutesSince(order.createdAt, now)} phút</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-body text-gray-700">
        <span className="flex items-center gap-1.5">
          <Icon className="size-4 text-primary-600" aria-hidden />
          {whereLabel(order)}
        </span>
        <span className="text-caption text-gray-500">{itemCount(order)} món</span>
      </div>
    </Link>
  );
}
