import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, ChevronRight, Gift, MapPin, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { useAuthStore } from '@/features/auth/store';
import { identityApi, engagementApi } from '@/shared/api';
import type { Address } from '@/shared/types';
import type { AddressInput } from '@/shared/api/identity';
import { PageHeader } from '@/features/dine-in/components/PageHeader';
import { Modal } from '@/shared/ui/Modal';
import { Button, Input } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';

const blankAddress: AddressInput = { label: '', receiverName: '', phone: '', province: '', district: '', ward: '', addressLine: '', latitude: null, longitude: null, isDefault: false };
const inputClass = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-body focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200';
const addressLabel = (a: Address) => [a.addressLine, a.ward, a.district, a.province].filter(Boolean).join(', ');

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [editingName, setEditingName] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [addressDraft, setAddressDraft] = useState<AddressInput | null>(null);
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addresses = useQuery({ queryKey: ['identity', 'addresses', user?.id], enabled: !!user?.id, queryFn: () => identityApi.listAddresses() });
  const loyalty = useQuery({ queryKey: ['engagement', 'loyalty', user?.id], enabled: !!user?.id, queryFn: () => engagementApi.getLoyaltySummary() });
  const transactions = useQuery({ queryKey: ['engagement', 'loyalty-transactions', user?.id], enabled: !!user?.id, queryFn: () => engagementApi.getLoyaltyTransactions(1, 5) });
  const saveAddress = useMutation({
    mutationFn: (draft: AddressInput) => editingAddressId ? identityApi.updateAddress(editingAddressId, draft) : identityApi.createAddress(draft),
    onSuccess: () => { setAddressDraft(null); setEditingAddressId(null); void queryClient.invalidateQueries({ queryKey: ['identity', 'addresses', user?.id] }); setError(null); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Không thể lưu địa chỉ.'),
  });
  const removeAddress = useMutation({ mutationFn: (id: number) => identityApi.deleteAddress(id), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['identity', 'addresses', user?.id] }) });
  const defaultAddress = useMutation({ mutationFn: (id: number) => identityApi.setDefaultAddress(id), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['identity', 'addresses', user?.id] }) });

  function saveName(event: FormEvent) {
    event.preventDefault();
    const next = fullName.trim();
    if (!next) return setError('Vui lòng nhập họ tên.');
    void identityApi.updateProfile({ fullName: next }).then((saved) => {
      useAuthStore.setState({ user: saved });
      setEditingName(false);
      setError(null);
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Không thể cập nhật hồ sơ.'));
  }

  function editAddress(address?: Address) {
    setEditingAddressId(address?.id ?? null);
    setAddressDraft(address ? { label: address.label ?? '', receiverName: address.receiverName, phone: address.phone, province: address.province, district: address.district ?? '', ward: address.ward, addressLine: address.addressLine, latitude: address.latitude ?? null, longitude: address.longitude ?? null, isDefault: address.isDefault } : { ...blankAddress });
    setError(null);
  }

  function submitAddress(event: FormEvent) {
    event.preventDefault();
    if (!addressDraft) return;
    if (!addressDraft.receiverName.trim() || !addressDraft.phone.trim() || !addressDraft.province.trim() || !addressDraft.ward.trim() || !addressDraft.addressLine.trim()) return setError('Vui lòng điền tên người nhận, số điện thoại và địa chỉ đầy đủ.');
    saveAddress.mutate(addressDraft);
  }

  const stampCount = loyalty.data?.currentStamps ?? 0;
  const progress = Math.min(10, Math.max(0, stampCount));
  const stampsToNextReward = Math.max(0, 10 - stampCount);

  return <div className="min-h-screen bg-primary-50 pb-8">
    <PageHeader title="Trang cá nhân" back={PATHS.home} />
    <section className="flex items-center gap-4 border-b border-gray-100 bg-white px-5 py-5">
      <div className="relative grid size-20 shrink-0 place-items-center rounded-md bg-primary-100 text-primary-700">
        {user?.avatar ? <img src={user.avatar} alt="Ảnh đại diện" className="size-full rounded-md object-cover" /> : <UserRound className="size-9" aria-hidden />}
        <button type="button" aria-label="Cập nhật ảnh đại diện" title="Cập nhật ảnh đại diện" className="absolute -bottom-1 -right-1 rounded bg-primary-700 p-1.5 text-white"><Camera className="size-4" aria-hidden /></button>
      </div>
      <div className="min-w-0"><h2 className="text-h4">{user?.fullName ?? 'Khách hàng'}</h2><p className="text-caption text-gray-600">Thành viên từ {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('vi-VN', { month: 'numeric', year: 'numeric' }) : 'Smart Café'}</p></div>
    </section>
    <div className="space-y-6 px-5 py-5">
      <section aria-labelledby="personal-info"><h2 id="personal-info" className="mb-3 text-body-lg font-semibold">Thông tin cá nhân</h2><div className="divide-y divide-gray-100 rounded-lg bg-white">
        {editingName ? <form onSubmit={saveName} className="space-y-3 p-4"><Input label="Họ và tên" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus /><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => { setEditingName(false); setFullName(user?.fullName ?? ''); }}>Huỷ</Button><Button type="submit">Lưu</Button></div></form> : <button type="button" onClick={() => { setFullName(user?.fullName ?? ''); setEditingName(true); }} className="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50"><span><span className="block text-caption text-gray-600">Họ và tên</span><span className="text-body">{user?.fullName ?? 'Chưa cập nhật'}</span></span><Pencil className="size-5 text-gray-600" aria-hidden /></button>}
        <div className="flex items-center justify-between p-4"><span><span className="block text-caption text-gray-600">Số điện thoại</span><span className="text-body">{user?.phone || 'Chưa cập nhật'}</span></span><span title="Cập nhật số điện thoại cần xác minh OTP" className="text-caption text-gray-500">Xác minh OTP</span></div>
        {user?.email && <div className="px-4 py-3"><span className="block text-caption text-gray-600">Email</span><span className="text-body">{user.email}</span></div>}
      </div></section>

      <section aria-labelledby="addresses"><h2 id="addresses" className="mb-3 text-body-lg font-semibold">Địa chỉ giao hàng</h2>
        {addresses.isPending ? <p className="rounded-lg bg-white p-4 text-body text-gray-600">Đang tải địa chỉ…</p> : addresses.isError ? <div className="rounded-lg bg-white p-4 text-body text-error-strong">Không tải được địa chỉ. <button type="button" className="underline" onClick={() => void addresses.refetch()}>Thử lại</button></div> : <div className="space-y-2">
          {addresses.data?.map((address) => <article key={address.id} className="flex items-center gap-3 rounded-lg bg-white p-3.5"><MapPin className="size-5 shrink-0 text-primary-700" aria-hidden /><button type="button" onClick={() => editAddress(address)} className="min-w-0 flex-1 text-left"><span className="flex items-center gap-2 font-semibold">{address.label || 'Địa chỉ'}{address.isDefault && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px]">Mặc định</span>}</span><span className="block truncate text-caption text-gray-700">{address.receiverName} · {address.phone}</span><span className="line-clamp-2 block text-caption text-gray-600">{addressLabel(address)}</span></button>{!address.isDefault && <button type="button" aria-label={`Đặt ${address.label || 'địa chỉ'} làm mặc định`} onClick={() => defaultAddress.mutate(address.id)} className="rounded p-2 text-gray-500 hover:bg-primary-50"><Check className="size-5" /></button>}<button type="button" aria-label={`Xoá ${address.label || 'địa chỉ'}`} onClick={() => { if (window.confirm('Bạn có muốn xoá địa chỉ này?')) removeAddress.mutate(address.id); }} className="rounded p-2 text-gray-500 hover:bg-red-50 hover:text-error"><Trash2 className="size-5" /></button></article>)}
          {(!addresses.data || addresses.data.length === 0) && <p className="rounded-lg bg-white p-4 text-body text-gray-600">Bạn chưa lưu địa chỉ giao hàng.</p>}
          <button type="button" onClick={() => editAddress()} className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-gray-500 px-4 py-3 font-semibold hover:bg-white"><Plus className="size-5" aria-hidden />Thêm địa chỉ mới</button>
        </div>}
      </section>

      <section aria-labelledby="loyalty"><div className="mb-3 flex items-center justify-between"><h2 id="loyalty" className="text-body-lg font-semibold">Thành viên &amp; Quà tặng</h2><Link to={PATHS.profile} className="inline-flex items-center gap-1 text-caption font-medium text-primary-700">Chi tiết<ChevronRight className="size-4" /></Link></div>
        <div className="rounded-lg bg-white p-4">
          {loyalty.isPending ? <p className="text-caption text-gray-600">Đang tải thẻ tích tem…</p> : loyalty.isError ? <p role="alert" className="text-caption text-error-strong">Không tải được thẻ tích tem. <button type="button" className="underline" onClick={() => void loyalty.refetch()}>Thử lại</button></p> : <div className="flex items-center gap-4"><div className="relative grid size-24 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#a9683b ${progress * 10}%, #e7e5e4 0)` }}><div className="grid size-[82px] place-items-center rounded-full bg-white text-center"><span><strong className="block text-h3 leading-8">{stampCount}/10</strong><span className="text-caption">ly cafe</span></span></div></div><div><Gift className="mb-1 size-6 text-primary-700" aria-hidden /><p className="font-semibold">{stampsToNextReward > 0 ? `Còn ${stampsToNextReward} ly nữa để nhận quà` : 'Bạn đã đủ tem để đổi quà'}</p><p className="text-caption text-gray-600">{loyalty.data?.lifetimeStampsEarned ?? 0} tem tích luỹ</p></div></div>}
          {transactions.isPending ? <p className="mt-4 text-caption text-gray-600">Đang tải lịch sử tem…</p> : transactions.isError ? <p role="alert" className="mt-4 text-caption text-error-strong">Không tải được lịch sử tích tem. <button type="button" className="underline" onClick={() => void transactions.refetch()}>Thử lại</button></p> : transactions.data?.items?.length ? <ul className="mt-4 divide-y divide-gray-100 border-t border-gray-100">{transactions.data.items.slice(0, 3).map((tx) => <li key={tx.id} className="flex items-center justify-between gap-3 py-3"><span className="min-w-0"><span className="block truncate font-medium">{tx.note || (tx.stamps > 0 ? 'Tích điểm đơn hàng' : 'Đổi quà')}</span><span className="text-caption text-gray-600">{new Date(tx.createdAt).toLocaleDateString('vi-VN')}</span></span><strong className={cn('shrink-0', tx.stamps > 0 ? 'text-gray-900' : 'text-gray-600')}>{tx.stamps > 0 ? '+' : ''}{tx.stamps} tem</strong></li>)}</ul> : <p className="mt-4 border-t border-gray-100 pt-3 text-caption text-gray-600">Chưa có lịch sử tích điểm.</p>}
        </div>
      </section>
      <div className="space-y-2 pt-1"><button type="button" onClick={() => void logout()} className="w-full rounded-md px-4 py-3 font-semibold hover:bg-white">Đăng xuất</button><Link to={PATHS.orders} className="flex items-center justify-center gap-1 py-2 text-caption text-gray-600 hover:underline">Đơn hàng của tôi<ChevronRight className="size-4" /></Link></div>
      {error && !addressDraft && <p role="alert" className="text-caption text-error-strong">{error}</p>}
    </div>
    <Modal open={addressDraft !== null} onClose={() => { setAddressDraft(null); setEditingAddressId(null); }} title={editingAddressId ? 'Sửa địa chỉ' : 'Thêm địa chỉ mới'} size="md">
      {addressDraft && <form onSubmit={submitAddress} className="space-y-3">
        <label className="block"><span className="mb-1 block text-body font-medium">Tên địa chỉ</span><input className={inputClass} placeholder="Nhà riêng, Công ty…" value={addressDraft.label ?? ''} onChange={(e) => setAddressDraft({ ...addressDraft, label: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-body font-medium">Người nhận</span><input required className={inputClass} value={addressDraft.receiverName} onChange={(e) => setAddressDraft({ ...addressDraft, receiverName: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-body font-medium">Số điện thoại</span><input required inputMode="tel" className={inputClass} value={addressDraft.phone} onChange={(e) => setAddressDraft({ ...addressDraft, phone: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-body font-medium">Địa chỉ chi tiết</span><input required className={inputClass} placeholder="Số nhà, tên đường" value={addressDraft.addressLine} onChange={(e) => setAddressDraft({ ...addressDraft, addressLine: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-body font-medium">Phường / xã</span><input required className={inputClass} value={addressDraft.ward} onChange={(e) => setAddressDraft({ ...addressDraft, ward: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-body font-medium">Tỉnh / thành phố</span><input required className={inputClass} value={addressDraft.province} onChange={(e) => setAddressDraft({ ...addressDraft, province: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-body"><input type="checkbox" checked={addressDraft.isDefault} onChange={(e) => setAddressDraft({ ...addressDraft, isDefault: e.target.checked })} className="size-4 accent-primary-700" />Đặt làm địa chỉ mặc định</label>
        {error && <p role="alert" className="text-caption text-error-strong">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3"><Button type="button" variant="outline" onClick={() => { setAddressDraft(null); setEditingAddressId(null); }}>Huỷ</Button><Button type="submit" loading={saveAddress.isPending}>Lưu địa chỉ</Button></div>
      </form>}
    </Modal>
  </div>;
}
