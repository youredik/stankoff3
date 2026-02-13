'use client';

import { useRef, useLayoutEffect, useState } from 'react';
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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!clientRect) return;
    const rect = clientRect();
    if (!rect) return;

    const dropdownHeight = dropdownRef.current?.offsetHeight || 200;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;

    // Show above cursor if not enough space below (like Telegram)
    const top = spaceBelow < dropdownHeight + 8
      ? rect.top - dropdownHeight - 4
      : rect.bottom + 4;

    // Clamp left to stay within viewport
    const left = Math.min(rect.left, window.innerWidth - 220);

    setPosition({ top: Math.max(8, top), left: Math.max(8, left) });
  }, [clientRect, items.length]);

  if (!items.length || !clientRect || typeof document === 'undefined') return null;

  const rect = clientRect();
  if (!rect) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-[100] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 w-56 max-h-[240px] overflow-y-auto"
      style={{ top: position.top, left: position.left }}
    >
      {items.map((user, i) => (
        <button
          key={user.id}
          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors ${
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
            avatar={user.avatar}
            userId={user.id}
            size="xs"
          />
          <div className="flex flex-col min-w-0">
            <span className="truncate font-medium">
              {user.firstName} {user.lastName}
            </span>
          </div>
        </button>
      ))}
    </div>,
    document.body,
  );
}
