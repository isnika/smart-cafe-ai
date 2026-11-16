import type { Address } from '@/shared/types';
import type { DeliveryDetails } from './store';

/** Ghép địa chỉ đã lưu thành MỘT chuỗi cho `delivery_address` (Orders lưu snapshot dạng chuỗi, không có address_id). */
export function formatDeliveryAddress(a: Pick<Address, 'addressLine' | 'ward' | 'district' | 'province'>): string {
  return [a.addressLine, a.ward, a.district, a.province]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(', ');
}

/** Địa chỉ đã lưu → thông tin nhận hàng của checkout (kèm toạ độ nếu có). */
export function addressToDelivery(a: Address): DeliveryDetails {
  return {
    receiverName: a.receiverName,
    phone: a.phone,
    addressLine: formatDeliveryAddress(a),
    ...(typeof a.latitude === 'number' && typeof a.longitude === 'number' ? { latitude: a.latitude, longitude: a.longitude } : {}),
  };
}

/** Địa chỉ mặc định, nếu không có thì địa chỉ đầu tiên. */
export const pickDefaultAddress = (list: readonly Address[]): Address | undefined => list.find((a) => a.isDefault) ?? list[0];
