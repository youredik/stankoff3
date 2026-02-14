'use client';

import { create } from 'zustand';
import { tasksApi } from '@/lib/api/tasks';
import { guardedFetch } from '@/lib/fetchGuard';

interface TaskState {
  inboxCount: number;
  fetchInboxCount: () => Promise<void>;
}

export const useTaskStore = create<TaskState>((set) => ({
  inboxCount: 0,
  fetchInboxCount: async () => {
    return guardedFetch('inbox-count', async () => {
      try {
        const result = await tasksApi.getInbox({ perPage: 1 });
        set({ inboxCount: result.total });
      } catch {
        // Допустимо молча — бейдж просто не покажется
      }
    });
  },
}));
