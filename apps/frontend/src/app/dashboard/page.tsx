'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { workspacesApi } from '@/lib/api/workspaces';
import { useWebSocket } from '@/hooks/useWebSocket';

const STORAGE_KEY = 'stankoff-selected-workspace';
const VIEW_KEY = 'stankoff-dashboard-view';

const KanbanBoard = dynamic(
  () => import('@/components/kanban/KanbanBoard').then((m) => m.KanbanBoard),
  { ssr: false },
);

const AnalyticsDashboard = dynamic(
  () => import('@/components/analytics/AnalyticsDashboard').then((m) => m.AnalyticsDashboard),
  { ssr: false },
);

export type DashboardView = 'kanban' | 'analytics';

function DashboardContent() {
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [currentView, setCurrentView] = useState<DashboardView>('kanban');
  useWebSocket();

  useEffect(() => {
    // Restore view preference
    const savedView = localStorage.getItem(VIEW_KEY) as DashboardView;
    if (savedView === 'kanban' || savedView === 'analytics') {
      setCurrentView(savedView);
    }

    workspacesApi.getAll().then((workspaces) => {
      if (workspaces.length > 0) {
        // Восстанавливаем сохранённое рабочее место или берём первое
        const savedId = localStorage.getItem(STORAGE_KEY);
        const exists = savedId && workspaces.some((w) => w.id === savedId);
        setSelectedWorkspace(exists ? savedId : workspaces[0].id);
      }
    });
  }, []);

  const handleWorkspaceChange = useCallback((id: string) => {
    setSelectedWorkspace(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const handleViewChange = useCallback((view: DashboardView) => {
    setCurrentView(view);
    localStorage.setItem(VIEW_KEY, view);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <ToastContainer />
      <Header currentView={currentView} onViewChange={handleViewChange} />

      <div className="flex">
        <Sidebar
          selectedWorkspace={selectedWorkspace}
          onWorkspaceChange={handleWorkspaceChange}
        />

        <main className="flex-1">
          {currentView === 'kanban' && selectedWorkspace && (
            <div className="p-6">
              <KanbanBoard workspaceId={selectedWorkspace} />
            </div>
          )}
          {currentView === 'analytics' && (
            <AnalyticsDashboard />
          )}
        </main>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthProvider>
      <DashboardContent />
    </AuthProvider>
  );
}
