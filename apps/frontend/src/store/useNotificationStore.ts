import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { browserNotifications } from '@/hooks/useBrowserNotifications';
import type { NotificationPreferences } from '@/types';

export type NotificationType = 'entity' | 'comment' | 'status' | 'assignment' | 'mention' | 'workspace' | 'sla_warning' | 'sla_breach' | 'ai_suggestion';

/** Map WebSocket event types to NotificationPreferences keys */
const TYPE_TO_PREF_KEY: Partial<Record<NotificationType, keyof NotificationPreferences>> = {
  entity: 'entityCreated',
  comment: 'commentReceived',
  status: 'statusChanged',
  assignment: 'entityCreated',
  mention: 'mentionReceived',
  sla_warning: 'slaWarning',
  sla_breach: 'slaBreach',
  ai_suggestion: 'aiSuggestion',
};

/** Check if notification should be shown based on server preferences */
function isNotificationAllowed(
  prefs: NotificationPreferences | null | undefined,
  type?: NotificationType,
): boolean {
  if (!prefs || !type) return true;
  const key = TYPE_TO_PREF_KEY[type];
  if (key && prefs[key] === false) return false;

  // DND check
  if (prefs.dndEnabled) {
    const hour = new Date().getHours();
    const start = prefs.dndStartHour ?? 22;
    const end = prefs.dndEndHour ?? 8;
    if (start > end) {
      if (hour >= start || hour < end) return false;
    } else if (start < end) {
      if (hour >= start && hour < end) return false;
    }
  }

  return true;
}

export interface AppNotification {
  id: string;
  text: string;
  time: Date;
  read: boolean;
  type?: NotificationType;
  entityId?: string;
  workspaceId?: string;
  urgent?: boolean; // Для SLA breach уведомлений
}

// Заголовки для браузерных уведомлений по типу
const NOTIFICATION_TITLES: Record<NotificationType, string> = {
  entity: 'Новая заявка',
  comment: 'Новый комментарий',
  status: 'Изменение статуса',
  assignment: 'Назначение исполнителя',
  mention: 'Упоминание',
  workspace: 'Рабочее место',
  sla_warning: 'Предупреждение SLA',
  sla_breach: 'Нарушение SLA',
  ai_suggestion: 'AI подсказка',
};

// Звуковое уведомление через Web Audio API (880Hz sine wave, 300ms)
export function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
    setTimeout(() => ctx.close(), 500);
  } catch {
    // Audio not available
  }
}

interface NotificationStore {
  notifications: AppNotification[];
  browserNotificationsEnabled: boolean;
  soundEnabled: boolean;
  serverPreferences: NotificationPreferences | null;
  setBrowserNotificationsEnabled: (enabled: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setServerPreferences: (prefs: NotificationPreferences | null) => void;
  addNotification: (data: {
    text: string;
    type?: NotificationType;
    entityId?: string;
    workspaceId?: string;
    urgent?: boolean;
  }) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set, get) => ({
      notifications: [],
      browserNotificationsEnabled: false,
      soundEnabled: true,
      serverPreferences: null,

      setBrowserNotificationsEnabled: (enabled: boolean) => {
        set({ browserNotificationsEnabled: enabled });
      },

      setSoundEnabled: (enabled: boolean) => {
        set({ soundEnabled: enabled });
      },

      setServerPreferences: (prefs: NotificationPreferences | null) => {
        set({ serverPreferences: prefs });
      },

      addNotification: (data) => {
        const state = get();

        // Check server-side per-type preferences & DND
        if (!isNotificationAllowed(state.serverPreferences, data.type)) {
          return; // silently skip
        }

        const notification: AppNotification = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          text: data.text,
          time: new Date(),
          read: false,
          type: data.type,
          entityId: data.entityId,
          workspaceId: data.workspaceId,
          urgent: data.urgent,
        };

        const isUnfocused = typeof document !== 'undefined' && !document.hasFocus();

        // Push-уведомление браузера (показывается только если вкладка не в фокусе)
        if (state.browserNotificationsEnabled) {
          const title = data.type ? NOTIFICATION_TITLES[data.type] : 'Stankoff';
          browserNotifications.show(title, {
            body: data.text,
            tag: data.entityId || notification.id,
          });
        }

        // Звук при неактивной вкладке
        if (state.soundEnabled && isUnfocused) {
          playNotificationSound();
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
        soundEnabled: state.soundEnabled,
      }),
    }
  )
);
