import { parseUtc } from '@/shared/lib';

/** API timestamps without an offset are UTC; display them in the user's time zone. */
export function NotificationTime({ createdAt }: { createdAt: string }) {
  const date = parseUtc(createdAt);
  if (!date) return null;
  const label = date.toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false,
  });
  return <time dateTime={date.toISOString()} className="mt-1 block text-xs text-gray-500">{label}</time>;
}
