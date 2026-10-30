import { useRef, useState } from "react";
import { CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import { isApiError } from "@/shared/api";
import { formatVnd, parseUtc } from "@/shared/lib";
import type {
  InvoiceRequestInput,
  OrderDetail,
  PayResult,
} from "@/shared/types";
import { Badge, Button, Modal } from "@/shared/ui";
import { whereLabel } from "@/features/order-queue/status";
import { useCollectCash } from "../hooks/useCashier";
import {
  canCollectAtCounter,
  cashierGroup,
  changeDue,
  GROUP_LABEL,
  isValidOptionalEmail,
  PAYMENT_CHANNEL_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "../model";
import { InvoicePanel } from "./InvoicePanel";

const dateTime = (iso: string) => {
  const d = parseUtc(iso);
  return d ? d.toLocaleString("vi-VN", { hour12: false }) : "—";
};

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 py-1 text-body">
      <dt className="text-gray-600">{label}</dt>
      <dd className={strong ? "font-semibold text-gray-900" : "text-gray-900"}>
        {value}
      </dd>
    </div>
  );
}

interface Receipt {
  order: OrderDetail;
  result: PayResult;
}

/**
 * Hóa đơn của một đơn trong danh sách thu ngân. Đóng modal KHÔNG đổi gì ở trạng thái thanh toán; chỉ nút "Xác nhận đã thu"
 * (đơn đủ điều kiện) mới gọi API. Sau khi API báo thành công, modal giữ lại biên nhận (đơn đã rời danh sách chờ thu
 * vì server coi là đã thanh toán) và cho xem hóa đơn điện tử.
 * `order = null` khi đơn đã rời danh sách (ví dụ đã được xử lý ở nơi khác) trong lúc modal đang mở.
 */
export function BillModal({
  order,
  open,
  onClose,
}: {
  order: OrderDetail | null;
  open: boolean;
  onClose: () => void;
}) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const close = () => {
    setReceipt(null);
    setFailure(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title="Hóa đơn" size="lg">
      {receipt ? (
        <PaidReceipt receipt={receipt} onDone={close} />
      ) : order ? (
        <BillBody
          key={order.id}
          order={order}
          onPaid={(result) => setReceipt({ order, result })}
          onFailed={setFailure}
        />
      ) : (
        <div className="space-y-2">
          {failure && (
            <p
              role="alert"
              className="rounded-md bg-error-soft p-2 text-caption text-error-strong"
            >
              {failure}
            </p>
          )}
          <p role="status" className="text-body text-gray-600">
            Đơn này không còn trong danh sách thu ngân (có thể đã được xử lý).
            Danh sách đã được làm mới.
          </p>
        </div>
      )}
    </Modal>
  );
}

function PaidReceipt({
  receipt,
  onDone,
}: {
  receipt: Receipt;
  onDone: () => void;
}) {
  const [showInvoice, setShowInvoice] = useState(false);
  const { order, result } = receipt;
  const p = result.payment;
  if (showInvoice)
    return (
      <InvoicePanel orderId={order.id} onBack={() => setShowInvoice(false)} />
    );

  return (
    <div className="space-y-4">
      <p
        role="status"
        className="flex gap-2 rounded-md bg-success-soft p-3 text-body font-medium text-success-strong"
      >
        <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
        Đã thu tiền đơn #{order.orderCode} thành công
      </p>
      <dl className="rounded-md bg-gray-50 p-3">
        <Row label="Giao dịch" value={`#${p.id}`} />
        {p.paidAt && <Row label="Thời điểm thu" value={dateTime(p.paidAt)} />}
        <Row
          label="Phương thức"
          value={PAYMENT_METHOD_LABEL[p.paymentMethod]}
        />
        <Row label="Tổng thu" value={formatVnd(p.amount)} strong />
        {p.cashReceived != null && (
          <Row label="Khách đưa" value={formatVnd(p.cashReceived)} />
        )}
        {p.changeAmount != null && (
          <Row label="Tiền trả lại" value={formatVnd(p.changeAmount)} />
        )}
        {result.invoice?.invoiceNumber && (
          <Row label="Hóa đơn" value={result.invoice.invoiceNumber} />
        )}
      </dl>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onDone}>
          Xong
        </Button>
        <Button
          leftIcon={<FileText className="size-4" aria-hidden />}
          onClick={() => setShowInvoice(true)}
        >
          Xem hóa đơn điện tử
        </Button>
      </div>
    </div>
  );
}

const field =
  "h-10 rounded-md border border-gray-300 px-3 text-white disabled:bg-gray-100";

function BillBody({
  order,
  onPaid,
  onFailed,
}: {
  order: OrderDetail;
  onPaid: (r: PayResult) => void;
  onFailed: (message: string) => void;
}) {
  const group = cashierGroup(order);
  const collectable = canCollectAtCounter(order);
  const [cash, setCash] = useState("");
  const [withBuyer, setWithBuyer] = useState(false);
  const [buyer, setBuyer] = useState({
    buyerName: "",
    email: "",
    buyerTaxCode: "",
    buyerAddress: "",
  });
  const [showInvoice, setShowInvoice] = useState(false);
  const submitting = useRef(false); // chặn double-click kể cả khi 2 click đến trước lần render kế tiếp
  const mutation = useCollectCash(order);

  const cashReceived =
    cash.trim() === "" ? null : Number(cash.replace(/\D/g, ""));
  const change = changeDue(order.finalAmount, cashReceived);
  const buyerOk =
    !withBuyer ||
    (buyer.buyerName.trim() !== "" && isValidOptionalEmail(buyer.email));
  const canSubmit = collectable && change !== null && buyerOk;
  const error = mutation.error
    ? isApiError(mutation.error)
      ? mutation.error.message
      : mutation.error.message || "Không thu được tiền. Vui lòng thử lại."
    : null;
  const customer =
    order.fulfillmentType === "Delivery" ? order.deliveryName : null;
  const setB =
    (k: keyof typeof buyer) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setBuyer((b) => ({ ...b, [k]: e.target.value }));

  if (showInvoice)
    return (
      <InvoicePanel orderId={order.id} onBack={() => setShowInvoice(false)} />
    );

  const submit = () => {
    if (submitting.current || !canSubmit) return;
    submitting.current = true;
    const invoice: InvoiceRequestInput | undefined = withBuyer
      ? {
          buyerName: buyer.buyerName.trim(),
          email: buyer.email.trim() || undefined,
          buyerTaxCode: buyer.buyerTaxCode.trim() || undefined,
          buyerAddress: buyer.buyerAddress.trim() || undefined,
        }
      : undefined;
    mutation.mutate(
      { cashReceived: cashReceived ?? 0, invoice },
      {
        onSuccess: onPaid,
        onError: (e) =>
          onFailed(
            isApiError(e) ? e.message : e.message || "Không thu được tiền.",
          ),
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-heading text-h4 text-gray-900">
            Đơn #{order.orderCode}
          </p>
          <p className="text-caption text-gray-600">
            {whereLabel(order)}
            {customer ? ` · ${customer}` : ""} · {dateTime(order.createdAt)}
          </p>
        </div>
        {group && (
          <Badge tone={group === "paid_online" ? "success" : "info"}>
            {GROUP_LABEL[group]}
          </Badge>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-left text-body">
          <caption className="sr-only">Danh sách món</caption>
          <thead className="bg-gray-50 text-caption uppercase text-gray-500">
            <tr>
              <th scope="col" className="px-3 py-2">
                Món
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                SL
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Đơn giá
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Thành tiền
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {order.items.map((i) => {
              const detail = [
                i.variantName !== "Standard" ? `Size ${i.variantName}` : null,
                ...i.options.map((o) => o.optionName),
                i.note,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <tr key={i.id}>
                  <td className="px-3 py-2">
                    {i.productName}
                    {detail && (
                      <span className="block text-caption text-gray-500">
                        {detail}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{i.quantity}</td>
                  <td className="px-3 py-2 text-right">
                    {formatVnd(i.unitPrice + i.optionsUnitTotal)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatVnd(i.lineTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dl className="border-t border-gray-100 pt-2">
        <Row label="Tạm tính" value={formatVnd(order.subTotal)} />
        {order.itemDiscountAmount > 0 && (
          <Row
            label="Giảm giá món"
            value={`-${formatVnd(order.itemDiscountAmount)}`}
          />
        )}
        {order.voucherDiscountAmount > 0 && (
          <Row
            label={
              order.voucherCode ? `Voucher ${order.voucherCode}` : "Voucher"
            }
            value={`-${formatVnd(order.voucherDiscountAmount)}`}
          />
        )}
        {order.deliveryFee > 0 && (
          <Row label="Phí giao hàng" value={formatVnd(order.deliveryFee)} />
        )}
        <div className="mt-1 flex items-baseline justify-between border-t border-gray-200 pt-2">
          <dt className="text-h4 text-gray-900">Tổng thanh toán</dt>
          <dd className="text-h3 text-primary-700">
            {formatVnd(order.finalAmount)}
          </dd>
        </div>
        <p className="text-right text-caption text-gray-500">
          Đã gồm VAT {formatVnd(order.vatAmount)}
        </p>
      </dl>

      <dl className="rounded-md bg-gray-50 p-3">
        <Row
          label="Phương thức"
          value={group ? PAYMENT_CHANNEL_LABEL[group] : "—"}
        />
        <Row
          label="Trạng thái thanh toán"
          value={PAYMENT_STATUS_LABEL[order.paymentStatus]}
          strong
        />
        {order.note && <Row label="Ghi chú" value={order.note} />}
      </dl>

      {collectable ? (
        <section
          aria-label="Thu tiền mặt"
          className="space-y-3 border-t border-gray-100 pt-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="cash-received"
                className="text-body font-medium text-gray-800"
              >
                Khách đưa (₫)
              </label>
              <input
                id="cash-received"
                inputMode="numeric"
                autoComplete="off"
                value={cash}
                disabled={mutation.isPending}
                onChange={(e) => setCash(e.target.value.replace(/\D/g, ""))}
                placeholder="Nhập số tiền khách đưa"
                className={field}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-body font-medium text-gray-800">
                Tiền trả lại
              </span>
              <output className="flex h-10 items-center text-body font-semibold text-success-strong">
                {change === null ? "—" : formatVnd(change)}
              </output>
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-gray-200 p-3">
            <label className="flex items-center gap-2 text-body font-medium text-gray-800">
              <input
                type="checkbox"
                checked={withBuyer}
                disabled={mutation.isPending}
                onChange={(e) => setWithBuyer(e.target.checked)}
              />
              Ghi thông tin người mua trên hóa đơn
            </label>
            <p className="text-caption text-gray-500">
              Hóa đơn điện tử luôn được phát hành sau khi thu tiền; nếu không
              ghi, hóa đơn là hóa đơn bán lẻ “Khách lẻ”.
            </p>
            {withBuyer && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="buyer-name"
                    className="text-body font-medium text-gray-800"
                  >
                    Tên người mua
                  </label>
                  <input
                    id="buyer-name"
                    value={buyer.buyerName}
                    onChange={setB("buyerName")}
                    disabled={mutation.isPending}
                    autoComplete="off"
                    className={field}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="buyer-email"
                    className="text-body font-medium text-gray-800"
                  >
                    Email nhận hóa đơn
                  </label>
                  <input
                    id="buyer-email"
                    type="email"
                    value={buyer.email}
                    onChange={setB("email")}
                    disabled={mutation.isPending}
                    autoComplete="off"
                    aria-invalid={!isValidOptionalEmail(buyer.email)}
                    className={field}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="buyer-tax"
                    className="text-body font-medium text-gray-800"
                  >
                    Mã số thuế
                  </label>
                  <input
                    id="buyer-tax"
                    value={buyer.buyerTaxCode}
                    onChange={setB("buyerTaxCode")}
                    disabled={mutation.isPending}
                    autoComplete="off"
                    className={field}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="buyer-address"
                    className="text-body font-medium text-gray-800"
                  >
                    Địa chỉ
                  </label>
                  <input
                    id="buyer-address"
                    value={buyer.buyerAddress}
                    onChange={setB("buyerAddress")}
                    disabled={mutation.isPending}
                    autoComplete="off"
                    className={field}
                  />
                </div>
              </div>
            )}
          </div>

          <p className="flex gap-2 rounded-md bg-gray-50 p-2 text-caption text-gray-600">
            <ShieldCheck
              className="mt-0.5 size-4 shrink-0 text-primary-600"
              aria-hidden
            />
            Xác nhận đã thu ghi lại người thao tác, thời gian, phương thức và
            tổng tiền. Đơn đã trả online không thu lần hai.
          </p>

          {error && (
            <p
              role="alert"
              className="rounded-md bg-error-soft p-2 text-caption text-error-strong"
            >
              {error}
            </p>
          )}

          <Button
            fullWidth
            size="lg"
            disabled={!canSubmit}
            loading={mutation.isPending}
            onClick={submit}
          >
            Xác nhận đã thu
          </Button>
        </section>
      ) : (
        <div className="space-y-2">
          <p
            role="status"
            className="flex gap-2 rounded-md bg-success-soft p-2 text-caption text-success-strong"
          >
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            {group === "paid_online"
              ? "Đơn đã trả online: chỉ xác nhận/in bill, không thu lại."
              : "Đơn này không thuộc diện thu tiền tại quầy."}
          </p>
          {order.paymentStatus === "Paid" && (
            <Button
              variant="outline"
              leftIcon={<FileText className="size-4" aria-hidden />}
              onClick={() => setShowInvoice(true)}
            >
              Xem hóa đơn điện tử
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
