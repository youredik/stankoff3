import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { browserNotifications } from '@/hooks/useBrowserNotifications';

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

// Заголовки для браузерных уведомлений по типу
const NOTIFICATION_TITLES: Record<NotificationType, string> = {
  entity: 'Новая заявка',
  comment: 'Новый комментарий',
  status: 'Изменение статуса',
  assignment: 'Назначение исполнителя',
  mention: 'Упоминание',
};

interface NotificationStore {
  notifications: AppNotification[];
  browserNotificationsEnabled: boolean;
  setBrowserNotificationsEnabled: (enabled: boolean) => void;
  addNotification: (data: {
    text: string;
    type?: NotificationType;
    entityId?: string;
    workspaceId?: string;
  }) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set, get) => ({
      notifications: [],
      browserNotificationsEnabled: false,

      setBrowserNotificationsEnabled: (enabled: boolean) => {
        set({ browserNotificationsEnabled: enabled });
      },

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

        // Показываем браузерное уведомление если включено
        const state = get();
        if (state.browserNotificationsEnabled) {
          const title = data.type ? NOTIFICATION_TITLES[data.type] : 'Stankoff';
          browserNotifications.show(title, {
            body: data.text,
            tag: data.entityId || notification.id,
          });
        }

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
    }),
    {
      name: 'notification-settings',
      partialize: (state) => ({
        browserNotificationsEnabled: state.browserNotificationsEnabled,
      }),
    }
  )
);
