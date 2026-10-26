import { useState, type FormEvent } from 'react';
import { Ticket } from 'lucide-react';
import { Button } from '@/shared/ui';
import { useOnlineCartStore } from '../store';

/** Ô nhập mã khuyến mãi. Chỉ lưu mã; mức giảm do server trả qua useOnlinePricing. */
export function VoucherBox({ appliedCode, message }: { appliedCode: string | null; message: string | null }) {
  const code = useOnlineCartStore((s) => s.voucherCode);
  const setVoucher = useOnlineCartStore((s) => s.setVoucher);
  const [draft, setDraft] = useState(code ?? '');

  function apply(e: FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    setVoucher(next ? next.toUpperCase() : null);
  }

  return (
    <section aria-labelledby="voucher-title">
      <h2 id="voucher-title" className="mb-2 text-body-lg font-semibold">
        Mã khuyến mãi
      </h2>
      <form onSubmit={apply} className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Mã khuyến mãi</span>
          <Ticket className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Nhập mã giảm giá"
            autoCapitalize="characters"
            className="h-12 w-full rounded-lg border border-primary-100 bg-white pl-9 pr-3 text-body placeholder:text-gray-400 focus:border-primary-600 focus:outline-none"
          />
        </label>
        <Button type="submit" size="lg" className="rounded-lg">
          Áp dụng
        </Button>
      </form>
      {appliedCode && <p className="mt-1.5 text-caption text-success-strong">Đã áp dụng mã {appliedCode}</p>}
      {message && (
        <p role="alert" className="mt-1.5 text-caption text-error-strong">
          {message}
        </p>
      )}
    </section>
  );
}
