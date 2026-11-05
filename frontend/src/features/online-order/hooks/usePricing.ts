import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { calcSubTotal, countItems, toOrderLines } from '@/features/dine-in/cart';
import { engagementApi, storeApi } from '@/shared/api';
import { onlineBranchBlock } from '../branch-policy';
import { syncOnlineCart } from '../cart-sync';
import { isVoucherEnabled, ONLINE_BRANCH_ID } from '../config';
import { describeOnlineError } from '../errors';
import { calcTotals } from '../pricing';
import { useOnlineCartStore } from '../store';

/** Chi nhánh phục vụ đơn Online (GET /branches/{id}, công khai): phí giao hàng, accepts_online_orders, delivery_radius_km. */
export function useOnlineBranch(enabled: boolean) {
  return useQuery({
    queryKey: ['store', 'branch', ONLINE_BRANCH_ID],
    enabled,
    queryFn: () => storeApi.getBranch(ONLINE_BRANCH_ID),
  });
}

/**
 * Nguồn sự thật DUY NHẤT cho tiền của luồng Online: giỏ hàng và checkout cùng gọi hook này.
 * Đã đăng nhập → tạm tính (sub_total) đọc từ pricing◇ của GIỎ SERVER (đồng bộ giỏ rồi GET /carts/current);
 * chưa đăng nhập → chỉ tạm tính để hiển thị. FE không gửi bất kỳ số tiền nào lên server.
 * Voucher thuộc Engagement: chỉ hoạt động ở mock.
 */
export function useOnlinePricing() {
  const fulfillmentType = useOnlineCartStore((s) => s.fulfillmentType);
  const lines = useOnlineCartStore((s) => s.lines);
  const voucherCode = useOnlineCartStore((s) => s.voucherCode);
  const delivery = useOnlineCartStore((s) => s.delivery);
  const userId = useAuthStore((s) => s.user?.id);
  const roleName = useAuthStore((s) => s.roleName);

  const isDelivery = fulfillmentType === 'Delivery';
  const signedIn = !!userId && roleName === 'Customer';

  const branch = useOnlineBranch(fulfillmentType !== null);
  const destination =
    delivery && typeof delivery.latitude === 'number' && typeof delivery.longitude === 'number'
      ? { latitude: delivery.latitude, longitude: delivery.longitude }
      : null;
  const branchBlock = branch.data && fulfillmentType ? onlineBranchBlock(branch.data, { fulfillmentType, destination }) : null;

  const useServerCart = signedIn && fulfillmentType !== null && lines.length > 0 && !branchBlock && branch.isSuccess;
  const cart = useQuery({
    queryKey: ['online-cart', userId, fulfillmentType, JSON.stringify(toOrderLines(lines))],
    enabled: useServerCart,
    retry: false,
    staleTime: 0,
    queryFn: () => syncOnlineCart({ fulfillmentType: fulfillmentType!, branchId: ONLINE_BRANCH_ID, lines }),
  });

  const subTotal = cart.data?.pricing?.subTotal ?? calcSubTotal(lines);

  const voucherOn = isVoucherEnabled();
  const voucher = useQuery({
    queryKey: ['engagement', 'voucher', voucherCode, fulfillmentType, subTotal],
    enabled: voucherOn && !!voucherCode && fulfillmentType !== null && subTotal > 0,
    queryFn: () =>
      engagementApi.validateVoucher({
        code: voucherCode!,
        branchId: ONLINE_BRANCH_ID,
        fulfillmentType: fulfillmentType!,
        subTotal,
        ...(userId ? { userId } : {}),
      }),
    staleTime: 0,
  });

  const quote = voucherOn ? voucher.data : undefined;
  const serverFee = cart.data?.pricing?.deliveryFee;
  const totals = calcTotals({
    subTotal,
    discount: quote?.valid ? quote.discountAmount : 0,
    deliveryFee: isDelivery ? (serverFee ?? branch.data?.deliveryFee ?? 0) : 0,
  });

  return {
    fulfillmentType,
    lines,
    itemCount: countItems(lines),
    totals,
    /** Mã đang được dùng thật (hợp lệ); null nếu chưa nhập, đang kiểm tra hoặc không hợp lệ. */
    appliedCode: quote?.valid ? voucherCode : null,
    voucherMessage: voucherOn && voucherCode && quote && !quote.valid ? (quote.message ?? 'Mã giảm giá không hợp lệ') : null,
    /** false khi còn thiếu dữ liệu để tính tổng (đang tải chi nhánh / đồng bộ giỏ / kiểm tra mã) hoặc chi nhánh không phục vụ → chặn bấm tiếp. */
    ready:
      branch.isSuccess &&
      !branchBlock &&
      (!useServerCart || cart.isSuccess) &&
      !(voucherOn && voucherCode && voucher.isFetching),
    /** Chi nhánh không nhận đơn Online / không giao hàng / ngoài phạm vi → thông báo cho khách. */
    branchBlock,
    /** Lỗi đồng bộ giỏ server (vd 422 OUT_OF_STOCK) → thông báo nghiệp vụ. */
    cartError: cart.isError ? describeOnlineError(cart.error).message : null,
    feeError: isDelivery && branch.isError,
    refetchFee: branch.refetch,
  };
}
