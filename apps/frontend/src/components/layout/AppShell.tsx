'use client';

import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ToastContainer } from '@/components/ui/ToastContainer';

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
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
      <ToastContainer />
      <Header />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main
          className={`flex-1 min-w-0 relative overflow-y-auto ${mainClassName ?? ''}`}
          style={mainStyle}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
