'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { Breadcrumbs, createHomeBreadcrumb } from '@/components/ui/Breadcrumbs';
import { useEntitySync } from '@/hooks/useEntitySync';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
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

const ProductCatalogView = dynamic(
  () => import('@/components/crm/ProductCatalogView').then((m) => m.ProductCatalogView),
  { ssr: false },
);

function WorkspaceContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const workspaceId = params.id as string;
  const { currentWorkspace } = useWorkspaceStore();
  // CRM workspace: default table, но доступны все views
  const defaultView: DashboardView = currentWorkspace?.isSystem ? 'table' : 'kanban';
  const view = (searchParams.get('view') as DashboardView) || defaultView;

  useEntitySync();

  if (typeof window !== 'undefined') {
    localStorage.setItem('stankoff-selected-workspace', workspaceId);
  }

  return (
    <AppShell>
      <div className="px-6 pt-4 pb-2">
        <Breadcrumbs items={[
          { ...createHomeBreadcrumb(), onClick: () => router.push('/workspace') },
          { label: currentWorkspace?.name ?? '...' },
        ]} />
      </div>
      {view === 'kanban' && (
        <div className="relative p-6 h-full flex flex-col">
          <KanbanBoard workspaceId={workspaceId} />
        </div>
      )}
      {view === 'table' && currentWorkspace?.systemType === 'products' ? (
        <div className="relative flex-1 flex flex-col">
          <ProductCatalogView workspaceId={workspaceId} />
        </div>
      ) : view === 'table' ? (
        <div className="relative p-6">
          <TableView workspaceId={workspaceId} />
        </div>
      ) : null}
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
