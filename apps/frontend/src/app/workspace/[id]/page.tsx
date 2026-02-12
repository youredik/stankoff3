'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useEntitySync } from '@/hooks/useEntitySync';
import type { DashboardView } from '@/components/layout/Header';

const KanbanBoard = dynamic(
  () => import('@/components/kanban/KanbanBoard').then((m) => m.KanbanBoard),
  { ssr: false },
);

const AnalyticsDashboard = dynamic(
  () => import('@/components/analytics/AnalyticsDashboard').then((m) => m.AnalyticsDashboard),
  { ssr: false },
);

const TableView = dynamic(
  () => import('@/components/table/TableView').then((m) => m.TableView),
  { ssr: false },
);

function WorkspaceContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const workspaceId = params.id as string;
  const view = (searchParams.get('view') as DashboardView) || 'kanban';

  useWebSocket();
  useEntitySync();

  if (typeof window !== 'undefined') {
    localStorage.setItem('stankoff-selected-workspace', workspaceId);
  }

  return (
    <AppShell
      mainStyle={view === 'kanban' ? {
        backgroundImage: 'url(/kanban-bg.svg)',
        backgroundSize: '200px 200px',
        backgroundRepeat: 'repeat',
      } : undefined}
    >
      {view === 'kanban' && (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50/60 via-gray-100/50 to-gray-50/60 dark:from-gray-900/70 dark:via-gray-800/60 dark:to-gray-900/70 pointer-events-none" />
      )}

      {view === 'kanban' && (
        <div className="relative p-6">
          <KanbanBoard workspaceId={workspaceId} />
        </div>
      )}
      {view === 'table' && (
        <div className="relative p-6">
          <TableView workspaceId={workspaceId} />
        </div>
      )}
      {view === 'analytics' && (
        <AnalyticsDashboard />
      )}
    </AppShell>
  );
}

export default function WorkspacePage() {
  return (
    <AuthProvider>
      <Suspense>
        <WorkspaceContent />
      </Suspense>
    </AuthProvider>
  );
}
