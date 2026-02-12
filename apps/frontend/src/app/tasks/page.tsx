'use client';

import { Suspense, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { Breadcrumbs, createHomeBreadcrumb } from '@/components/ui/Breadcrumbs';
import { TaskInbox } from '@/components/bpmn/tasks/TaskInbox';
import { TaskDetail } from '@/components/bpmn/tasks/TaskDetail';
import { useAuthStore } from '@/store/useAuthStore';
import { useTaskStore } from '@/store/useTaskStore';
import type { UserTask } from '@/types';

function TasksContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || undefined;
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
        router.push(`/workspace/${selectedTask.workspaceId}?entity=${entityId}`);
      }
    },
    [selectedTask, router],
  );

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        <div className="px-6 pt-4 pb-2">
          <Breadcrumbs items={[
            { ...createHomeBreadcrumb(), onClick: () => router.push('/workspace') },
            { label: 'Входящие задания' },
          ]} />
        </div>
        <TaskInbox onTaskSelect={handleTaskSelect} showFilters initialTab={initialTab} />
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
    </AppShell>
  );
}

export default function TasksPage() {
  return (
    <AuthProvider>
      <Suspense>
        <TasksContent />
      </Suspense>
    </AuthProvider>
  );
}
