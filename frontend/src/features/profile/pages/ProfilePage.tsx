import { useRef, useState, type ChangeEvent, type FormEvent, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, ChevronRight, Gift, MapPin, Pencil, Plus, Trash2, UserRound, FileText, LockKeyhole, Download, BadgeCheck, Phone } from 'lucide-react';
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
import { paymentApi } from '@/shared/api';
import { LocationSelect } from '../components/LocationSelect';
import { listProvinces, listWards } from '../locations';

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
  const [chosenWardCode, setChosenWardCode] = useState('');
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [invoiceNotice, setInvoiceNotice] = useState('');
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState(user?.phone ?? '');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneStep, setPhoneStep] = useState<'phone' | 'otp'>('phone');
  const [phoneError, setPhoneError] = useState('');
  const [phoneNotice, setPhoneNotice] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarNotice, setAvatarNotice] = useState('');
  const addresses = useQuery({ queryKey: ['identity', 'addresses', user?.id], enabled: !!user?.id, queryFn: () => identityApi.listAddresses() });
  const provinces = useQuery({ queryKey: ['locations-v2', 'provinces'], enabled: addressDraft !== null, queryFn: ({ signal }) => listProvinces(signal), staleTime: 1000 * 60 * 60 });
  const provinceMatches = provinces.data?.filter((p) => p.name === addressDraft?.province) ?? [];
  const selectedProvince = provinceMatches.length === 1 ? provinceMatches[0].code : '';
  const wards = useQuery({ queryKey: ['locations-v2', 'wards', selectedProvince], enabled: addressDraft !== null && !!selectedProvince, queryFn: ({ signal }) => listWards(selectedProvince, signal), staleTime: 1000 * 60 * 60 });
  const wardMatches = wards.data?.filter((w) => w.name === addressDraft?.ward) ?? [];
  const selectedWard = chosenWardCode || (wardMatches.length === 1 ? wardMatches[0].code : '');
  const loyalty = useQuery({ queryKey: ['engagement', 'loyalty', user?.id], enabled: !!user?.id, queryFn: () => engagementApi.getLoyaltySummary() });
  const transactions = useQuery({ queryKey: ['engagement', 'loyalty-transactions', user?.id], enabled: !!user?.id, queryFn: () => engagementApi.getLoyaltyTransactions(1, 5) });
  const invoices = useQuery({ queryKey: ['payment', 'invoices-me', user?.id], enabled: !!user?.id, queryFn: () => paymentApi.listMyInvoices(1, 5) });
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

  async function sendPhoneOtp(event: FormEvent) {
    event.preventDefault();
    const normalized = phoneDraft.trim().replace(/[\s.()-]/g, '');
    if (!/^\+?\d{10,12}$/.test(normalized)) { setPhoneError('Nhập số điện thoại hợp lệ.'); return; }
    setPhoneBusy(true); setPhoneError('');
    try {
      await identityApi.requestPhoneChangeOtp(normalized);
      setPhoneDraft(normalized); setPhoneStep('otp'); setPhoneNotice(`Mã xác minh đã được gửi tới email ${user?.email ?? 'đã xác minh'} của bạn.`);
    } catch (e) { setPhoneError(e instanceof Error ? e.message : 'Không thể gửi mã xác minh.'); }
    finally { setPhoneBusy(false); }
  }

  async function verifyPhoneOtp(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(phoneOtp)) { setPhoneError('Nhập mã xác minh gồm 6 chữ số.'); return; }
    setPhoneBusy(true); setPhoneError('');
    try {
      const saved = await identityApi.updatePhoneWithOtp(phoneDraft, phoneOtp);
      useAuthStore.setState({ user: saved }); setPhoneNotice('Đã cập nhật số điện thoại.');
      setPhoneOpen(false); setPhoneStep('phone'); setPhoneOtp('');
    } catch (e) { setPhoneError(e instanceof Error ? e.message : 'Mã xác minh không hợp lệ.'); }
    finally { setPhoneBusy(false); }
  }

  async function onAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setAvatarError('');
    setAvatarNotice('');
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setAvatarError('Chỉ hỗ trợ ảnh JPG hoặc PNG.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Kích thước ảnh không được vượt quá 5 MB.');
      return;
    }

    const preview = URL.createObjectURL(file);
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('Không thể đọc ảnh này.'));
      image.src = preview;
    }).catch((e: unknown) => {
      setAvatarError(e instanceof Error ? e.message : 'Không thể đọc ảnh này.');
      URL.revokeObjectURL(preview);
      return null;
    });
    if (!dimensions) return;
    if (dimensions.width <= 0 || dimensions.height <= 0 || dimensions.width > 4096 || dimensions.height > 4096) {
      setAvatarError('Chiều rộng và chiều cao ảnh không được vượt quá 4096 px.');
      URL.revokeObjectURL(preview);
      return;
    }

    setAvatarPreview(preview);
    setAvatarLoadFailed(false);
    setAvatarBusy(true);
    try {
      const avatar = await identityApi.uploadAvatar(file);
      const current = useAuthStore.getState().user;
      if (current) useAuthStore.setState({ user: { ...current, avatar } });
      setAvatarPreview(null);
      setAvatarNotice('Đã cập nhật ảnh đại diện.');
    } catch (e) {
      setAvatarPreview(null);
      setAvatarError(e instanceof Error ? e.message : 'Không thể cập nhật ảnh đại diện.');
    } finally {
      URL.revokeObjectURL(preview);
      setAvatarBusy(false);
    }
  }

  function editAddress(address?: Address) {
    setChosenWardCode('');
    setEditingAddressId(address?.id ?? null);
    setAddressDraft(address ? { label: address.label ?? '', receiverName: address.receiverName, phone: address.phone, province: address.province, district: address.district ?? '', ward: address.ward, addressLine: address.addressLine, latitude: address.latitude ?? null, longitude: address.longitude ?? null, isDefault: address.isDefault } : { ...blankAddress });
    setError(null);
  }

  function submitAddress(event: FormEvent) {
    event.preventDefault();
    if (!addressDraft) return;
    if (!addressDraft.receiverName.trim() || !addressDraft.phone.trim() || !addressDraft.addressLine.trim()) return setError('Vui lòng điền tên người nhận, số điện thoại và địa chỉ đầy đủ.');
    if (!selectedProvince || !wards.data?.some((w) => w.code === selectedWard && w.provinceCode === selectedProvince && w.name === addressDraft.ward)) return setError('Vui lòng chọn tỉnh và phường/xã hợp lệ.');
    saveAddress.mutate(addressDraft);
  }

  const stampCount = loyalty.data?.currentStamps ?? 0;
  const progress = Math.min(10, Math.max(0, stampCount));
  const stampsToNextReward = Math.max(0, 10 - stampCount);

  return <div className="min-h-screen bg-primary-50 pb-8">
    <PageHeader title="Trang cá nhân" back={PATHS.home} />
    <section className="flex items-center gap-4 border-b border-gray-100 bg-white px-5 py-5">
      <button
        type="button"
        aria-label="Cập nhật ảnh đại diện"
        title="Nhấn để cập nhật ảnh đại diện"
        disabled={avatarBusy}
        onClick={() => avatarInputRef.current?.click()}
        className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-primary-100 bg-gradient-to-br from-primary-100 to-primary-200 text-primary-700 shadow-sm disabled:cursor-wait"
      >
        {avatarPreview ? <img src={avatarPreview} alt="Xem trước ảnh đại diện" className="absolute inset-0 size-full object-cover" /> : user?.avatar && !avatarLoadFailed ? <img src={user.avatar} alt="Ảnh đại diện" onError={(event: SyntheticEvent<HTMLImageElement>) => { event.currentTarget.hidden = true; setAvatarLoadFailed(true); }} className="absolute inset-0 size-full object-cover" /> : <UserRound className="size-9" aria-hidden />}
        <span className="absolute -bottom-0.5 -right-0.5 grid size-7 place-items-center rounded-full border-2 border-white bg-primary-700 text-white">
          <Camera className={cn('size-3.5', avatarBusy && 'animate-pulse')} aria-hidden />
        </span>
      </button>
      <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(event) => void onAvatarChange(event)} />
      <div className="min-w-0"><h2 className="text-h4">{user?.fullName ?? 'Khách hàng'}</h2><p className="text-caption text-gray-600">Thành viên từ {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('vi-VN', { month: 'numeric', year: 'numeric' }) : 'Smart Café'}</p></div>
      {avatarNotice && <p role="status" className="ml-auto max-w-52 text-right text-caption text-primary-700">{avatarNotice}</p>}
      {avatarError && <p role="alert" className="ml-auto max-w-52 text-right text-caption text-error-strong">{avatarError}</p>}
    </section>
    <div className="space-y-6 px-5 py-5">
      <section aria-labelledby="personal-info"><h2 id="personal-info" className="mb-3 text-body-lg font-semibold">Thông tin cá nhân</h2><div className="divide-y divide-gray-100 rounded-lg bg-white">
        {editingName ? <form onSubmit={saveName} className="space-y-3 p-4"><Input label="Họ và tên" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus /><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => { setEditingName(false); setFullName(user?.fullName ?? ''); }}>Huỷ</Button><Button type="submit">Lưu</Button></div></form> : <button type="button" onClick={() => { setFullName(user?.fullName ?? ''); setEditingName(true); }} className="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50"><span><span className="block text-caption text-gray-600">Họ và tên</span><span className="text-body">{user?.fullName ?? 'Chưa cập nhật'}</span></span><Pencil className="size-5 text-gray-600" aria-hidden /></button>}
        <div className="flex items-center justify-between gap-3 p-4"><span><span className="block text-caption text-gray-600">Số điện thoại</span><span className="inline-flex items-center gap-1 text-body">{user?.phone || 'Chưa cập nhật'}{user?.phoneVerifiedAt ? <BadgeCheck aria-label="Đã xác minh" className="size-4 text-green-700"/> : null}</span><span className={cn('block text-caption', user?.phoneVerifiedAt ? 'text-green-700' : 'text-amber-700')}>{user?.phoneVerifiedAt ? 'Đã xác minh' : 'Chưa xác minh'}</span></span><Button size="sm" variant="outline" leftIcon={<Phone className="size-4"/>} onClick={() => { setPhoneDraft(user?.phone ?? ''); setPhoneOtp(''); setPhoneStep('phone'); setPhoneError(''); setPhoneNotice(''); setPhoneOpen(true); }}>{user?.phone ? 'Cập nhật' : 'Thêm số'}</Button></div>
        {phoneNotice && <p role="status" className="px-4 pb-3 text-caption text-primary-700">{phoneNotice}</p>}
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
      <section aria-labelledby="invoices"><h2 id="invoices" className="mb-3 text-body-lg font-semibold">Hóa đơn điện tử</h2><div className="rounded-lg bg-white p-4">
        {invoiceNotice && <p role="status" className="mb-2 text-caption text-primary-700">{invoiceNotice}</p>}
        {invoices.isPending ? <p className="text-caption text-gray-600">Đang tải hóa đơn…</p> : invoices.isError ? <p className="text-caption text-error-strong">Không tải được hóa đơn.</p> : invoices.data?.length ? <ul className="divide-y divide-gray-100">{invoices.data.map((inv) => <li key={inv.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><span><span className="block font-medium">Hóa đơn #{inv.id}</span><span className="text-caption text-gray-600">{inv.status} · {new Date(inv.createdAt).toLocaleDateString('vi-VN')}</span></span><button type="button" aria-label={`Tải hóa đơn ${inv.id}`} onClick={() => void paymentApi.downloadInvoice(inv.id).then((blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `invoice_${inv.id}.pdf`; a.click(); URL.revokeObjectURL(a.href); }).catch((e: unknown) => setInvoiceNotice(e instanceof Error ? e.message : 'Không tải được hóa đơn.'))} className="rounded p-2 text-primary-700 hover:bg-primary-50"><Download className="size-5"/></button></li>)}</ul> : <p className="text-caption text-gray-600">Chưa có hóa đơn.</p>}
        <Link to={PATHS.orders} className="mt-2 inline-flex items-center gap-2 text-caption font-medium text-primary-700"><FileText className="size-4"/>Yêu cầu hóa đơn trong chi tiết đơn hàng</Link>
      </div></section>
      <section aria-labelledby="security"><h2 id="security" className="mb-3 text-body-lg font-semibold">Bảo mật</h2><button type="button" onClick={() => { setPasswordError(''); setPasswordOpen(true); }} className="flex w-full items-center gap-3 rounded-lg bg-white p-4 text-left font-medium hover:bg-primary-50"><LockKeyhole className="size-5 text-primary-700"/>Đổi mật khẩu<ChevronRight className="ml-auto size-4"/></button></section>
      <div className="space-y-2 pt-1"><button type="button" onClick={() => void logout()} className="w-full rounded-md px-4 py-3 font-semibold hover:bg-white">Đăng xuất</button><Link to={PATHS.orders} className="flex items-center justify-center gap-1 py-2 text-caption text-gray-600 hover:underline">Đơn hàng của tôi<ChevronRight className="size-4" /></Link></div>
      {error && !addressDraft && <p role="alert" className="text-caption text-error-strong">{error}</p>}
    </div>
    <Modal open={addressDraft !== null} onClose={() => { setAddressDraft(null); setEditingAddressId(null); }} title={editingAddressId ? 'Sửa địa chỉ' : 'Thêm địa chỉ mới'} size="md">
      {addressDraft && <form onSubmit={submitAddress} className="space-y-3">
        <label className="block"><span className="mb-1 block text-body font-medium">Người nhận</span><input required className={inputClass} value={addressDraft.receiverName} onChange={(e) => setAddressDraft({ ...addressDraft, receiverName: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-body font-medium">Số điện thoại</span><input required inputMode="tel" className={inputClass} value={addressDraft.phone} onChange={(e) => setAddressDraft({ ...addressDraft, phone: e.target.value })} /></label>
        {editingAddressId && provinces.isSuccess && !selectedProvince && <p className="text-caption text-gray-600">Tỉnh đã lưu: {addressDraft.province}. Vui lòng chọn lại theo địa giới mới.</p>}
        {editingAddressId && selectedProvince && wards.isSuccess && !selectedWard && <p className="text-caption text-gray-600">Phường/xã đã lưu: {addressDraft.ward}. Vui lòng chọn lại theo địa giới mới.</p>}
        <LocationSelect label="Tỉnh / thành phố" placeholder="Chọn tỉnh / thành phố" value={selectedProvince} options={provinces.data ?? []} loading={provinces.isLoading} error={provinces.isError} onRetry={() => void provinces.refetch()} onChange={(code) => { const province = provinces.data?.find((p) => p.code === code); setChosenWardCode(''); setAddressDraft({ ...addressDraft, province: province?.name ?? '', ward: '', district: '' }); }} />
        <LocationSelect key={selectedProvince} label="Phường / xã" placeholder="Chọn phường / xã" value={selectedWard} options={wards.data ?? []} disabled={!selectedProvince} loading={wards.isLoading} error={wards.isError} onRetry={() => void wards.refetch()} onChange={(code) => { const ward = wards.data?.find((w) => w.code === code); setChosenWardCode(code); setAddressDraft({ ...addressDraft, ward: ward?.name ?? '', district: '' }); }} />
        <label className="block"><span className="mb-1 block text-body font-medium">Địa chỉ chi tiết</span><input required className={inputClass} placeholder="Số nhà, tên đường" value={addressDraft.addressLine} onChange={(e) => setAddressDraft({ ...addressDraft, addressLine: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-body"><input type="checkbox" checked={addressDraft.isDefault} onChange={(e) => setAddressDraft({ ...addressDraft, isDefault: e.target.checked })} className="size-4 accent-primary-700" />Đặt làm địa chỉ mặc định</label>
        {error && <p role="alert" className="text-caption text-error-strong">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3"><Button type="button" variant="outline" onClick={() => { setAddressDraft(null); setEditingAddressId(null); }}>Huỷ</Button><Button type="submit" loading={saveAddress.isPending}>Lưu địa chỉ</Button></div>
      </form>}
    </Modal>
    <Modal open={passwordOpen} onClose={() => setPasswordOpen(false)} title="Đổi mật khẩu" size="sm">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const currentPassword = String(f.get('currentPassword') ?? ''); const newPassword = String(f.get('newPassword') ?? ''); if (newPassword.length < 8) { setPasswordError('Mật khẩu mới cần ít nhất 8 ký tự.'); return; } void identityApi.changePassword({ currentPassword, newPassword }).then(() => { setPasswordOpen(false); setPasswordError(''); }).catch((err: unknown) => setPasswordError(err instanceof Error ? err.message : 'Không thể đổi mật khẩu.')); }}>
        <Input name="currentPassword" type="password" label="Mật khẩu hiện tại" required autoComplete="current-password"/><Input name="newPassword" type="password" label="Mật khẩu mới" required minLength={8} autoComplete="new-password"/>
        {passwordError && <p role="alert" className="text-caption text-error-strong">{passwordError}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setPasswordOpen(false)}>Huỷ</Button><Button type="submit">Cập nhật</Button></div>
      </form>
    </Modal>
    <Modal open={phoneOpen} onClose={() => { if (phoneBusy) return; setPhoneOpen(false); }} title={phoneStep === 'phone' ? 'Cập nhật số điện thoại' : 'Nhập mã xác minh'} size="sm">
      {phoneStep === 'phone' ? <form className="space-y-3" onSubmit={(e) => void sendPhoneOtp(e)}><p className="text-caption text-gray-600">Mã xác minh sẽ được gửi tới email hiện tại đã xác minh của tài khoản.</p><Input label="Số điện thoại mới" type="tel" inputMode="tel" autoComplete="tel" value={phoneDraft} onChange={(e) => setPhoneDraft(e.target.value)} required/>{phoneError && <p role="alert" className="text-caption text-error-strong">{phoneError}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setPhoneOpen(false)}>Huỷ</Button><Button type="submit" loading={phoneBusy}>Gửi mã OTP</Button></div></form> : <form className="space-y-3" onSubmit={(e) => void verifyPhoneOtp(e)}><p className="text-caption text-gray-600">Nhập mã 6 chữ số được gửi tới {user?.email || 'email đã xác minh'} để cập nhật {phoneDraft}.</p><Input label="Mã OTP" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={phoneOtp} onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} required/><p role="status" className="text-caption text-primary-700">{phoneNotice}</p>{phoneError && <p role="alert" className="text-caption text-error-strong">{phoneError}</p>}<div className="flex justify-between gap-2"><Button type="button" variant="ghost" disabled={phoneBusy} onClick={() => { setPhoneStep('phone'); setPhoneError(''); }}>Đổi số</Button><div className="flex gap-2"><Button type="button" variant="outline" disabled={phoneBusy} onClick={() => void identityApi.requestPhoneChangeOtp(phoneDraft).then(() => setPhoneNotice('Đã gửi lại mã OTP.')).catch((e: unknown) => setPhoneError(e instanceof Error ? e.message : 'Không gửi lại được mã.'))}>Gửi lại mã</Button><Button type="submit" loading={phoneBusy}>Xác minh</Button></div></div></form>}
    </Modal>
  </div>;
}
