'use client';

import { useEffect, useCallback, useState } from 'react';

export interface Shortcut {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  description: string;
  action: () => void;
}

function isInputFocused(): boolean {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((document.activeElement as HTMLElement)?.isContentEditable) return true;
  return false;
}

/**
 * Регистрирует глобальные keyboard shortcuts.
 * Shortcuts с meta/ctrl срабатывают даже в input.
 * Остальные (простые буквы) — только вне input/textarea.
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const handler = useCallback(
    (e: KeyboardEvent) => {
      for (const s of shortcuts) {
        const keyMatch = e.key.toLowerCase() === s.key.toLowerCase();
        const metaMatch = s.meta ? e.metaKey || e.ctrlKey : true;
        const ctrlMatch = s.ctrl ? e.ctrlKey : true;
        const shiftMatch = s.shift ? e.shiftKey : !e.shiftKey;

        if (!keyMatch || !metaMatch || !ctrlMatch || !shiftMatch) continue;

        // Простые буквы без модификаторов — не срабатывают в input
        if (!s.meta && !s.ctrl && !s.shift && isInputFocused()) continue;

        e.preventDefault();
        s.action();
        return;
      }
    },
    [shortcuts],
  );

  useEffect(() => {
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handler]);
}

/** Данные для модалки справки */
export const GLOBAL_SHORTCUTS = [
  { keys: ['Cmd', 'K'], description: 'Поиск' },
  { keys: ['N'], description: 'Новая заявка' },
  { keys: ['?'], description: 'Справка по клавишам' },
  { keys: ['Esc'], description: 'Закрыть панель' },
];
