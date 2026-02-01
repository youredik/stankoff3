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

const KanbanBoard = dynamic(
  () => import('@/components/kanban/KanbanBoard').then((m) => m.KanbanBoard),
  { ssr: false },
);

function DashboardContent() {
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  useWebSocket();

  useEffect(() => {
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

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer />
      <Header />

      <div className="flex">
        <Sidebar
          selectedWorkspace={selectedWorkspace}
          onWorkspaceChange={handleWorkspaceChange}
        />

        <main className="flex-1 p-6">
          {selectedWorkspace && (
            <KanbanBoard workspaceId={selectedWorkspace} />
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
