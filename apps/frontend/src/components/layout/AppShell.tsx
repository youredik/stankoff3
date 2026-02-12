'use client';

import { useState, useMemo } from 'react';
import { WifiOff } from 'lucide-react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { KeyboardShortcutsHelp } from '@/components/ui/KeyboardShortcutsHelp';
import { useKeyboardShortcuts, type Shortcut } from '@/hooks/useKeyboardShortcuts';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface AppShellProps {
  children: React.ReactNode;
  /** Extra className for <main> element */
  mainClassName?: string;
  /** Inline styles for <main> element (e.g. kanban background) */
  mainStyle?: React.CSSProperties;
}

/**
 * Shared application shell: fixed header + sidebar with internal scroll + scrollable main area.
 * Every authenticated page with sidebar should use this component.
 */
export function AppShell({ children, mainClassName, mainStyle }: AppShellProps) {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const isOnline = useOnlineStatus();

  const shortcuts: Shortcut[] = useMemo(
    () => [
      {
        key: '?',
        shift: true,
        description: 'Справка по клавишам',
        action: () => setShowShortcuts((v) => !v),
      },
    ],
    [],
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
      <ToastContainer />

      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-amber-500 text-white text-sm font-medium px-4 py-2 flex items-center justify-center gap-2 flex-shrink-0">
          <WifiOff className="w-4 h-4" />
          Нет подключения к интернету
        </div>
      )}

      <Header />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main
          id="main-content"
          className={`flex-1 min-w-0 relative overflow-y-auto ${mainClassName ?? ''}`}
          style={mainStyle}
        >
          {children}
        </main>
      </div>

      {showShortcuts && (
        <KeyboardShortcutsHelp onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  );
}
