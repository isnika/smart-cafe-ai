import { http, HttpResponse } from 'msw';
import type { Branch } from '@/shared/types';
import { BRANCH_ID, DELIVERY_FEE } from '../fixtures';
import { fail, guarded, url } from '../utils';

const BRANCH: Branch = {
  id: BRANCH_ID,
  code: 'B1',
  name: 'Chi nhánh 1 (mock)',
  address: 'Địa chỉ mock',
  timezone: 'Asia/Ho_Chi_Minh',
  acceptsOnlineOrders: true,
  deliveryRadiusKm: 5,
  deliveryFee: DELIVERY_FEE, // cùng nguồn với phí mà POST /orders tính cho đơn Delivery
  status: 'Active',
};

export const branchHandlers = [
  // GET /store/branches/:id  (công khai) – FE cần deliveryFee để hiển thị phí giao hàng
  http.get(
    url('/store/branches/:id'),
    guarded(({ params }) => {
      if (Number(params.id) !== BRANCH.id) fail(404, 'BRANCH_NOT_FOUND', `Không có chi nhánh ${String(params.id)}`);
      return HttpResponse.json(BRANCH);
    }),
  ),
];
