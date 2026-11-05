import type { Branch } from '@/shared/types';
import type { OnlineFulfillment } from './store';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** Khoảng cách đường chim bay (km) giữa 2 toạ độ. */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Chặn ở FE các chi nhánh không phục vụ đơn Online (Branches.accepts_online_orders, delivery_radius_km).
 * Trả thông báo cho khách, hoặc null nếu hợp lệ. Server vẫn là nơi quyết định cuối cùng (409/422).
 */
export function onlineBranchBlock(
  branch: Pick<Branch, 'status' | 'acceptsOnlineOrders' | 'deliveryRadiusKm' | 'latitude' | 'longitude'>,
  opts: { fulfillmentType: OnlineFulfillment; destination?: GeoPoint | null },
): string | null {
  if (branch.status !== 'Active') return 'Chi nhánh hiện không hoạt động. Vui lòng chọn chi nhánh khác.';
  if (!branch.acceptsOnlineOrders) return 'Chi nhánh này hiện không nhận đơn Online. Vui lòng chọn chi nhánh khác.';
  if (opts.fulfillmentType !== 'Delivery') return null;

  const radius = branch.deliveryRadiusKm;
  if (radius === null || radius === undefined || radius <= 0) return 'Chi nhánh này không hỗ trợ giao hàng. Bạn có thể chọn Mang đi.';
  const { destination } = opts;
  if (destination && typeof branch.latitude === 'number' && typeof branch.longitude === 'number') {
    const d = distanceKm({ latitude: branch.latitude, longitude: branch.longitude }, destination);
    if (d > radius) return `Địa chỉ nằm ngoài phạm vi giao hàng của chi nhánh (tối đa ${radius} km).`;
  }
  return null;
}
