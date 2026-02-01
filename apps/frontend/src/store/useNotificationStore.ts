import { create } from 'zustand';

export type NotificationType = 'entity' | 'comment' | 'status' | 'assignment' | 'mention';

export interface AppNotification {
  id: string;
  text: string;
  time: Date;
  read: boolean;
  type?: NotificationType;
  entityId?: string;
  workspaceId?: string;
}

interface NotificationStore {
  notifications: AppNotification[];
  addNotification: (data: {
    text: string;
    type?: NotificationType;
    entityId?: string;
    workspaceId?: string;
  }) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],

  addNotification: (data) => {
    const notification: AppNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: data.text,
      time: new Date(),
      read: false,
      type: data.type,
      entityId: data.entityId,
      workspaceId: data.workspaceId,
    };
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, 50),
    }));
  },

  markAllRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    }));
  },

  markRead: (id: string) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    }));
  },
}));
