import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { useAuthStore } from '@/features/auth/store';
import { engagementApi } from '@/shared/api';
import { cn } from '@/shared/lib/cn';

export function NotificationBell() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const role = useAuthStore((state) => state.roleName);
  const enabled = userId !== null && role === 'Customer';
  const unread = useQuery({
    queryKey: ['engagement', 'notifications', userId, 'unread'], enabled,
    queryFn: () => engagementApi.listNotifications({ page: 1, pageSize: 1, unreadOnly: true }),
    refetchInterval: 10000,
  });
  if (!enabled) return null;
  const count = unread.data?.total ?? 0;
  return <NavLink to={PATHS.notifications} aria-label={count ? `Thông báo, ${count} chưa đọc` : 'Thông báo'}
    className={({ isActive }) => cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-caption', isActive ? 'font-semibold text-primary-600' : 'text-gray-500')}>
    <span className="relative"><Bell className="size-5" aria-hidden />
      {count > 0 && <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">{count > 99 ? '99+' : count}</span>}
    </span>
    Thông báo
  </NavLink>;
}
