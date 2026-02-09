'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { TaskInbox } from '@/components/bpmn/tasks/TaskInbox';
import { TaskDetail } from '@/components/bpmn/tasks/TaskDetail';
import { useAuthStore } from '@/store/useAuthStore';
import { useTaskStore } from '@/store/useTaskStore';
import type { UserTask } from '@/types';

const STORAGE_KEY = 'stankoff-selected-workspace';

function TasksContent() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { fetchInboxCount } = useTaskStore();
  const [selectedTask, setSelectedTask] = useState<UserTask | null>(null);

  const handleTaskSelect = useCallback((task: UserTask) => {
    setSelectedTask(task);
  }, []);

  const handleTaskUpdate = useCallback(
    (updatedTask: UserTask) => {
      setSelectedTask(updatedTask);
      fetchInboxCount();
    },
    [fetchInboxCount],
  );

  const handleCloseDetail = useCallback(() => {
    setSelectedTask(null);
  }, []);

  const handleNavigateToEntity = useCallback(
    (entityId: string) => {
      if (selectedTask?.workspaceId) {
        localStorage.setItem(STORAGE_KEY, selectedTask.workspaceId);
      }
      router.push('/dashboard');
    },
    [selectedTask, router],
  );

  const handleWorkspaceChange = useCallback(
    (id: string) => {
      localStorage.setItem(STORAGE_KEY, id);
      router.push('/dashboard');
    },
    [router],
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <ToastContainer />
      <Header />

      <div className="flex">
        <Sidebar
          selectedWorkspace=""
          onWorkspaceChange={handleWorkspaceChange}
        />

        <main className="flex-1">
          <div className="max-w-4xl mx-auto">
            <TaskInbox onTaskSelect={handleTaskSelect} showFilters />
          </div>
        </main>
      </div>

      {selectedTask && user && (
        <TaskDetail
          task={selectedTask}
          currentUserId={user.id}
          onClose={handleCloseDetail}
          onTaskUpdate={handleTaskUpdate}
          onNavigateToEntity={handleNavigateToEntity}
        />
      )}
    </div>
  );
}

export default function TasksPage() {
  return (
    <AuthProvider>
      <TasksContent />
    </AuthProvider>
  );
}
