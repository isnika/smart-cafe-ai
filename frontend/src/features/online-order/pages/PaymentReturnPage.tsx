import { AlertCircle, CheckCircle2, Clock, Loader2, WifiOff, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PATHS, to } from '@/app/routes';
import { formatVnd, parseUtc } from '@/shared/lib';
import type { Payment, PaymentGatewayStatus } from '@/shared/types';
import { Button } from '@/shared/ui';
import { usePaymentReturn, type PaymentReturnOptions } from '../hooks/usePaymentReturn';
import { usePaymentRetry, type PaymentRetryOptions } from '../hooks/usePaymentRetry';
import { browserRedirect } from '../payment';
import { resolvePaymentId } from '../payment-session';

const positiveInt = (raw: string | null | undefined): number | null => {
  const n = Number(raw);
  return raw != null && raw.trim() !== '' && Number.isInteger(n) && n > 0 ? n : null;
};

const paidAtText = (iso: string | null | undefined): string | null => {
  const d = parseUtc(iso);
  return d
    ? d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;
};

const FAILURE_TITLE: Record<Exclude<PaymentGatewayStatus, 'Pending' | 'Success'>, string> = {
  Failed: 'Thanh toán chưa thành công',
  Cancelled: 'Thanh toán chưa thành công',
  Expired: 'Giao dịch đã hết hạn',
};

const FAILURE_NOTE: Record<Exclude<PaymentGatewayStatus, 'Pending' | 'Success'>, string> = {
  Failed: 'Cổng thanh toán báo giao dịch không thành công.',
  Cancelled: 'Giao dịch đã bị hủy.',
  Expired: 'Giao dịch đã quá thời hạn thanh toán.',
};

function Screen({ tone, icon, title, children, actions }: {
  tone: 'success' | 'error' | 'neutral'; icon: ReactNode; title: string; children?: ReactNode; actions: ReactNode;
}) {
  const ring = { success: 'bg-success-soft text-success-strong', error: 'bg-error-soft text-error-strong', neutral: 'bg-primary-100 text-primary-700' }[tone];
  return (
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-md flex-col items-center px-5 pb-10 pt-16 text-center" role={tone === 'error' ? 'alert' : 'status'}>
      <span className={`grid size-20 place-items-center rounded-full ${ring}`} aria-hidden>{icon}</span>
      <h1 className="mt-6 font-heading text-h2 text-gray-900">{title}</h1>
      {children && <div className="mt-1 space-y-1 text-body text-gray-600">{children}</div>}
      <div className="mt-6 w-full space-y-3">{actions}</div>
    </div>
  );
}

const trackLink = (orderId: number) => (
  <Link to={to.order(String(orderId))} className="block">
    <Button size="lg" fullWidth tabIndex={-1}>Theo dõi đơn hàng</Button>
  </Link>
);
const homeLink = (
  <Link to={PATHS.home} className="block py-2 text-body font-semibold text-gray-800 hover:underline">Về trang chủ</Link>
);

type PageProps = Pick<PaymentReturnOptions, 'pollMs' | 'timeoutMs' | 'fetchPayment'> & Pick<PaymentRetryOptions, 'retry'>;

/**
 * Giao dịch Failed/Cancelled/Expired: nút tạo giao dịch MỚI cho cùng đơn. Hook tự refetch đơn và chặn khi đơn không
 * còn Pending_Payment/đã hết hạn (khi đó ẩn nút, hiện thông báo). Thành công → sang cổng như lúc checkout.
 */
function RetryAction({ orderId, payment, retry }: { orderId: number; payment: Payment; retry: PageProps['retry'] }) {
  const navigate = useNavigate();
  const state = usePaymentRetry({ orderId, payment, ...(retry ? { retry } : {}) });

  async function onRetry() {
    const result = await state.retry();
    if (!result) return;
    const { next } = result;
    if (next.kind === 'external') browserRedirect.assign(next.url);
    else if (next.kind === 'gateway') navigate(next.path, { replace: true });
  }

  if (state.blocked) {
    return <p role="alert" className="rounded-lg bg-error-soft p-3 text-body text-error-strong">{state.blocked}</p>;
  }
  return (
    <>
      {state.error && <p role="alert" className="rounded-lg bg-error-soft p-3 text-body text-error-strong">{state.error}</p>}
      <Button size="lg" fullWidth loading={state.isRetrying} onClick={() => void onRetry()}>Thử thanh toán lại</Button>
    </>
  );
}

/**
 * Trang khách quay về từ cổng VNPay/Momo (return_url). KHÔNG suy ra kết quả từ query của cổng (vnp_*...): chỉ xác định
 * giao dịch (đã lưu lúc khởi tạo), rồi polling GET /payments/{id} — kết quả do server chốt. Không tạo đơn;
 * chỉ khi khách bấm "Thử thanh toán lại" mới tạo giao dịch mới (RetryAction).
 */
export default function PaymentReturnPage(props: PageProps) {
  const { orderId: rawOrderId } = useParams<{ orderId: string }>();
  const [search] = useSearchParams();
  const orderId = positiveInt(rawOrderId);
  const paymentId = orderId === null ? null : resolvePaymentId(orderId, search);
  const state = usePaymentReturn({ orderId, paymentId, ...props });

  if (state.phase === 'invalid' || state.phase === 'error' || orderId === null) {
    return (
      <Screen tone="error" icon={<AlertCircle className="size-11" />} title="Không tìm thấy giao dịch"
        actions={<>{orderId !== null && trackLink(orderId)}{homeLink}</>}>
        <p>Chưa xác định được giao dịch thanh toán của đơn này. Bạn có thể xem trạng thái đơn hàng bên dưới.</p>
      </Screen>
    );
  }

  if (state.phase === 'settled') {
    const { payment } = state.result;
    if (payment.status === 'Success') {
      const at = paidAtText(payment.paidAt);
      return (
        <Screen tone="success" icon={<CheckCircle2 className="size-11" />} title="Thanh toán thành công"
          actions={<>{trackLink(orderId)}{homeLink}</>}>
          <p className="font-heading text-h3 text-primary-600">{formatVnd(payment.amount)}</p>
          <p>Smart Cafe đã nhận được thanh toán cho đơn hàng của bạn.</p>
          {at && <p className="text-caption text-gray-500">Thanh toán lúc {at}</p>}
          {payment.transactionId && <p className="text-caption text-gray-500">Mã giao dịch: {payment.transactionId}</p>}
        </Screen>
      );
    }
    const status = payment.status as Exclude<PaymentGatewayStatus, 'Pending' | 'Success'>;
    return (
      <Screen tone="error" icon={<XCircle className="size-11" />} title={FAILURE_TITLE[status] ?? 'Thanh toán chưa thành công'}
        actions={<><RetryAction orderId={orderId} payment={payment} retry={props.retry} />{trackLink(orderId)}{homeLink}</>}>
        <p>{FAILURE_NOTE[status] ?? 'Giao dịch chưa được ghi nhận thanh toán.'}</p>
        <p>Đơn hàng của bạn chưa được thanh toán.</p>
      </Screen>
    );
  }

  if (state.phase === 'timeout') {
    return (
      <Screen tone="neutral" icon={<Clock className="size-11" />} title="Chưa xác nhận được kết quả thanh toán"
        actions={<>{trackLink(orderId)}{homeLink}</>}>
        <p>Hệ thống chưa nhận được kết quả từ cổng thanh toán. Điều này chưa có nghĩa giao dịch thất bại.</p>
        <p>Vui lòng kiểm tra lại trạng thái đơn hàng sau ít phút.</p>
      </Screen>
    );
  }

  // polling
  return (
    <Screen tone="neutral" icon={<Loader2 className="size-11 animate-spin" />} title="Đang xác nhận thanh toán"
      actions={homeLink}>
      <p>Vui lòng không đóng trang trong khi chúng tôi xác nhận kết quả với cổng thanh toán.</p>
      {state.lastError != null && (
        <p className="inline-flex items-center gap-1.5 text-warning-strong"><WifiOff className="size-4" aria-hidden />Mất kết nối, đang thử lại…</p>
      )}
    </Screen>
  );
}
