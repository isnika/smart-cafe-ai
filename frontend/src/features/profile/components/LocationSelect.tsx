import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { normalizeLocationName } from '../locations';

export interface LocationOption { code: string; name: string }

interface Props {
  label: string;
  placeholder: string;
  value: string;
  options: LocationOption[];
  disabled?: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
  onChange: (value: string) => void;
}

export function LocationSelect({ label, placeholder, value, options, disabled, loading, error, onRetry, onChange }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number }>();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const selected = options.find((option) => option.code === value);
  const filtered = options.filter((option) => normalizeLocationName(option.name).includes(normalizeLocationName(editing ? search : '')));
  const listId = `${id}-list`;
  const isDisabled = disabled || loading || error;

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const input = inputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      const dialog = input.closest('dialog')?.getBoundingClientRect();
      const topLimit = Math.max(0, dialog?.top ?? 0);
      const bottomLimit = Math.min(window.innerHeight, dialog?.bottom ?? window.innerHeight);
      const below = Math.max(0, bottomLimit - rect.bottom - 8);
      const above = Math.max(0, rect.top - topLimit - 8);
      const useAbove = below < 160 && above > below;
      const maxHeight = Math.min(240, useAbove ? above : below);
      const next = { top: useAbove ? undefined : rect.bottom + 4, bottom: useAbove ? window.innerHeight - rect.top + 4 : undefined, left: rect.left, width: rect.width, maxHeight };
      setPosition((previous) => previous && previous.top === next.top && previous.bottom === next.bottom && previous.left === next.left && previous.width === next.width && previous.maxHeight === next.maxHeight ? previous : next);
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => { window.removeEventListener('resize', updatePosition); window.removeEventListener('scroll', updatePosition, true); };
  }, [open]);

  useEffect(() => () => clearTimeout(blurTimer.current), []);

  useEffect(() => {
    const list = listRef.current;
    const item = list?.children.item(active) as HTMLElement | null;
    if (!list || !item) return;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
    }
  }, [active, open, position]);

  function choose(option: LocationOption) {
    clearTimeout(blurTimer.current);
    setEditing(false);
    setSearch('');
    onChange(option.code);
    inputRef.current?.focus();
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { setOpen(true); setActive(0); return; }
      setActive((current) => Math.max(0, Math.min(filtered.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))));
    } else if (event.key === 'Enter' && open && filtered[active]) {
      event.preventDefault();
      choose(filtered[active]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  const popup = open && !isDisabled && position && portalTarget && createPortal(
    <div ref={listRef} id={listId} role="listbox" aria-label={label} style={{ position: 'fixed', top: position.top, bottom: position.bottom, left: position.left, width: position.width, maxHeight: position.maxHeight }} className="z-[80] overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
      {filtered.length ? filtered.map((option, index) => <div key={option.code} id={`${id}-option-${index}`} role="option" aria-selected={option.code === value} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)} className={`cursor-pointer px-3 py-2 text-body ${index === active ? 'bg-primary-50' : ''}`}>{option.name}</div>) : <p className="px-3 py-2 text-caption text-gray-600">Không tìm thấy địa phương phù hợp.</p>}
    </div>, portalTarget,
  );

  return <div className="space-y-1">
    <label htmlFor={id} className="block text-body font-medium">{label}</label>
    <div className="relative">
      <input ref={inputRef} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open && !isDisabled} aria-controls={open ? listId : undefined} aria-activedescendant={open && filtered[active] ? `${id}-option-${active}` : undefined} autoComplete="off" required className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 pr-10 text-body focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:bg-gray-100" placeholder={loading ? 'Đang tải…' : placeholder} value={editing ? search : selected?.name ?? ''} disabled={isDisabled} onFocus={(event) => { clearTimeout(blurTimer.current); setPortalTarget(event.currentTarget.closest('dialog') ?? document.body); setOpen(true); setActive(0); }} onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }} onClick={() => setOpen(true)} onChange={(event) => { setEditing(true); setSearch(event.target.value); setActive(0); setOpen(true); if (value) onChange(''); }} onKeyDown={handleKeyDown} />
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-600" />
    </div>
    {popup}
    {loading && <p role="status" className="text-caption text-gray-600">Đang tải dữ liệu địa giới…</p>}
    {error && <p role="alert" className="text-caption text-error-strong">Không tải được dữ liệu. <button type="button" className="underline" onClick={onRetry}>Thử lại</button></p>}
  </div>;
}
