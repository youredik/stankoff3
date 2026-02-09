'use client';

import { create } from 'zustand';
import { tasksApi } from '@/lib/api/tasks';

interface TaskState {
  inboxCount: number;
  fetchInboxCount: () => Promise<void>;
}

export const useTaskStore = create<TaskState>((set) => ({
  inboxCount: 0,
  fetchInboxCount: async () => {
    try {
      const tasks = await tasksApi.getInbox();
      const activeCount = tasks.filter(
        (t) => t.status !== 'completed' && t.status !== 'cancelled',
      ).length;
      set({ inboxCount: activeCount });
    } catch {
      // Silent fail — badge won't show if API is unavailable
    }
  },
}));
