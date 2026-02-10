'use client';

import { usePresenceStore } from '@/store/usePresenceStore';

export interface UserAvatarProps {
  firstName?: string;
  lastName?: string;
  email?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showOnline?: boolean;
  userId?: string;
  className?: string;
}

const SIZE_CONFIG = {
  xs: { container: 'w-5 h-5', text: 'text-[9px]', dot: 'w-2 h-2 border-[1.5px]' },
  sm: { container: 'w-6 h-6', text: 'text-[10px]', dot: 'w-2.5 h-2.5 border-2' },
  md: { container: 'w-8 h-8', text: 'text-xs', dot: 'w-3 h-3 border-2' },
  lg: { container: 'w-9 h-9', text: 'text-sm', dot: 'w-3.5 h-3.5 border-2' },
} as const;

function getInitials(firstName?: string, lastName?: string, email?: string): string {
  const first = firstName?.[0] || '';
  const last = lastName?.[0] || '';
  const initials = (first + last).toUpperCase();
  if (initials) return initials;
  return (email?.[0] || 'U').toUpperCase();
}

export function UserAvatar({
  firstName,
  lastName,
  email,
  size = 'sm',
  showOnline,
  userId,
  className,
}: UserAvatarProps) {
  const isOnline = usePresenceStore((s) => {
    if (showOnline === true) return true;
    if (showOnline === false) return false;
    if (userId) return s.onlineUserIds.has(userId);
    return false;
  });

  const config = SIZE_CONFIG[size];
  const initials = getInitials(firstName, lastName, email);

  return (
    <div className={`relative inline-flex flex-shrink-0 ${className || ''}`}>
      <div
        className={`${config.container} bg-primary-600 rounded-full flex items-center justify-center`}
      >
        <span className={`text-white font-medium ${config.text}`}>{initials}</span>
      </div>
      {isOnline && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 ${config.dot} bg-green-500 border-white dark:border-gray-800 rounded-full`}
        />
      )}
    </div>
  );
}
