import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { calcSubTotal, countItems } from '@/features/dine-in/cart';
import { engagementApi, storeApi } from '@/shared/api';
import { ONLINE_BRANCH_ID } from '../config';
import { calcTotals } from '../pricing';
import { useOnlineCartStore } from '../store';

/** Phí giao hàng của chi nhánh (Branch.deliveryFee). Pickup không cần nên không gọi. */
export function useDeliveryFee(enabled: boolean) {
  return useQuery({
    queryKey: ['store', 'branch', ONLINE_BRANCH_ID],
    enabled,
    queryFn: () => storeApi.getBranch(ONLINE_BRANCH_ID),
    select: (b) => b.deliveryFee,
  });
}

/**
 * Nguồn sự thật DUY NHẤT cho tiền của luồng Online: giỏ hàng và checkout cùng gọi hook này.
 * Mức giảm do server (validate voucher) quyết định, FE chỉ hiển thị.
 */
export function useOnlinePricing() {
  const fulfillmentType = useOnlineCartStore((s) => s.fulfillmentType);
  const lines = useOnlineCartStore((s) => s.lines);
  const voucherCode = useOnlineCartStore((s) => s.voucherCode);
  const userId = useAuthStore((s) => s.user?.id);

  const subTotal = calcSubTotal(lines);
  const isDelivery = fulfillmentType === 'Delivery';
  const fee = useDeliveryFee(isDelivery);

  const voucher = useQuery({
    queryKey: ['engagement', 'voucher', voucherCode, fulfillmentType, subTotal],
    enabled: !!voucherCode && fulfillmentType !== null && subTotal > 0,
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

  const quote = voucher.data;
  const totals = calcTotals({
    subTotal,
    discount: quote?.valid ? quote.discountAmount : 0,
    deliveryFee: isDelivery ? (fee.data ?? 0) : 0,
  });

  return {
    fulfillmentType,
    lines,
    itemCount: countItems(lines),
    totals,
    /** Mã đang được dùng thật (hợp lệ); null nếu chưa nhập, đang kiểm tra hoặc không hợp lệ. */
    appliedCode: quote?.valid ? voucherCode : null,
    voucherMessage: voucherCode && quote && !quote.valid ? (quote.message ?? 'Mã giảm giá không hợp lệ') : null,
    /** false khi còn thiếu dữ liệu để tính tổng (đang tải phí giao hàng / đang kiểm tra mã) → chặn bấm tiếp. */
    ready: (!isDelivery || fee.isSuccess) && !(voucherCode && voucher.isFetching),
    feeError: isDelivery && fee.isError,
    refetchFee: fee.refetch,
  };
}
