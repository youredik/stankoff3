'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { workspacesApi } from '@/lib/api/workspaces';
import { useWebSocket } from '@/hooks/useWebSocket';

const KanbanBoard = dynamic(
  () => import('@/components/kanban/KanbanBoard').then((m) => m.KanbanBoard),
  { ssr: false },
);

export default function DashboardPage() {
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  useWebSocket();

  useEffect(() => {
    workspacesApi.getAll().then((workspaces) => {
      if (workspaces.length > 0) {
        setSelectedWorkspace(workspaces[0].id);
      }
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer />
      <Header />

      <div className="flex">
        <Sidebar
          selectedWorkspace={selectedWorkspace}
          onWorkspaceChange={setSelectedWorkspace}
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
