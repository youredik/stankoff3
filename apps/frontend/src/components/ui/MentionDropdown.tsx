'use client';

import { createPortal } from 'react-dom';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { User } from '@/types';

interface MentionDropdownProps {
  items: User[];
  selectedIndex: number;
  clientRect: (() => DOMRect | null) | null;
  onSelect: (user: User) => void;
}

export function MentionDropdown({ items, selectedIndex, clientRect, onSelect }: MentionDropdownProps) {
  if (!items.length || !clientRect || typeof document === 'undefined') return null;

  const rect = clientRect();
  if (!rect) return null;

  return createPortal(
    <div
      className="fixed z-[100] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 w-52"
      style={{ top: rect.bottom + 4, left: rect.left }}
    >
      {items.map((user, i) => (
        <button
          key={user.id}
          className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${
            i === selectedIndex
              ? 'bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(user);
          }}
        >
          <UserAvatar
            firstName={user.firstName}
            lastName={user.lastName}
            userId={user.id}
            size="xs"
          />
          <span>
            {user.firstName} {user.lastName}
          </span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
