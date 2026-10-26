import { useState, type FormEvent } from 'react';
import { Button, Input, Modal } from '@/shared/ui';
import { normalizeDelivery, validateDelivery, type DeliveryErrors } from '../delivery';
import type { DeliveryDetails } from '../store';

/** Form nhập/sửa thông tin nhận hàng (nút "Thay đổi" ở checkout). */
export function DeliveryModal({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: DeliveryDetails;
  onClose: () => void;
  onSave: (d: DeliveryDetails) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Địa chỉ giao hàng">
      {/* key: mở lại modal thì form khởi tạo lại từ dữ liệu hiện tại */}
      {open && <DeliveryForm key={JSON.stringify(initial)} initial={initial} onClose={onClose} onSave={onSave} />}
    </Modal>
  );
}

function DeliveryForm({ initial, onClose, onSave }: { initial: DeliveryDetails; onClose: () => void; onSave: (d: DeliveryDetails) => void }) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<DeliveryErrors>({});
  const set = (k: keyof DeliveryDetails) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateDelivery(draft);
    setErrors(found);
    if (Object.keys(found).length === 0) onSave(normalizeDelivery(draft));
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <Input label="Tên người nhận" value={draft.receiverName} onChange={set('receiverName')} error={errors.receiverName} autoComplete="name" />
      <Input label="Số điện thoại" value={draft.phone} onChange={set('phone')} error={errors.phone} inputMode="tel" autoComplete="tel" />
      <Input label="Địa chỉ" value={draft.addressLine} onChange={set('addressLine')} error={errors.addressLine} autoComplete="street-address" />
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
          Huỷ
        </Button>
        <Button type="submit" className="flex-1">
          Lưu địa chỉ
        </Button>
      </div>
    </form>
  );
}
