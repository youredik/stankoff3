'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { TaskInbox } from '@/components/bpmn/tasks/TaskInbox';
import { TaskDetail } from '@/components/bpmn/tasks/TaskDetail';
import { useAuthStore } from '@/store/useAuthStore';
import { useTaskStore } from '@/store/useTaskStore';
import type { UserTask } from '@/types';

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
        router.push(`/workspace/${selectedTask.workspaceId}?entity=${entityId}`);
      }
    },
    [selectedTask, router],
  );

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        <TaskInbox onTaskSelect={handleTaskSelect} showFilters />
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
      <TasksContent />
    </AuthProvider>
  );
}
