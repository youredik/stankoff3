'use client';

import { useEffect, useState, useCallback } from 'react';

export type NotificationPermission = 'default' | 'granted' | 'denied';

interface BrowserNotificationOptions {
  body?: string;
  icon?: string;
  tag?: string;
  onClick?: () => void;
}

// Simple SVG icon as data URL
const DEFAULT_ICON = 'data:image/svg+xml,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#4f46e5"/>
  <path d="M50 25 L75 50 L50 75 L25 50 Z" fill="white" opacity="0.9"/>
  <circle cx="50" cy="50" r="12" fill="#4f46e5"/>
</svg>
`);

interface UseBrowserNotificationsReturn {
  permission: NotificationPermission;
  isSupported: boolean;
  requestPermission: () => Promise<boolean>;
  showNotification: (title: string, options?: BrowserNotificationOptions) => void;
}

export function useBrowserNotifications(): UseBrowserNotificationsReturn {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check if browser supports notifications
    const supported = typeof window !== 'undefined' && 'Notification' in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch {
      return false;
    }
  }, [isSupported]);

  const showNotification = useCallback(
    (title: string, options?: BrowserNotificationOptions) => {
      if (!isSupported || permission !== 'granted') {
        return;
      }

      // Don't show if document is focused (user is active on the page)
      if (document.hasFocus()) {
        return;
      }

      try {
        const notification = new Notification(title, {
          body: options?.body,
          icon: options?.icon || DEFAULT_ICON,
          tag: options?.tag,
          requireInteraction: false,
        });

        if (options?.onClick) {
          notification.onclick = () => {
            window.focus();
            options.onClick?.();
            notification.close();
          };
        } else {
          notification.onclick = () => {
            window.focus();
            notification.close();
          };
        }

        // Auto-close after 5 seconds
        setTimeout(() => {
          notification.close();
        }, 5000);
      } catch {
        // Notification failed, ignore
      }
    },
    [isSupported, permission]
  );

  return {
    permission,
    isSupported,
    requestPermission,
    showNotification,
  };
}

// Singleton for use outside React components
let globalPermission: NotificationPermission = 'default';
let globalIsSupported = false;

if (typeof window !== 'undefined' && 'Notification' in window) {
  globalIsSupported = true;
  globalPermission = Notification.permission;
}

export const browserNotifications = {
  get isSupported() {
    return globalIsSupported;
  },

  get permission() {
    if (globalIsSupported) {
      globalPermission = Notification.permission;
    }
    return globalPermission;
  },

  async requestPermission(): Promise<boolean> {
    if (!globalIsSupported) return false;
    try {
      const result = await Notification.requestPermission();
      globalPermission = result;
      return result === 'granted';
    } catch {
      return false;
    }
  },

  show(title: string, options?: BrowserNotificationOptions): void {
    if (!globalIsSupported || Notification.permission !== 'granted') {
      return;
    }

    // Don't show if document is focused
    if (typeof document !== 'undefined' && document.hasFocus()) {
      return;
    }

    try {
      const notification = new Notification(title, {
        body: options?.body,
        icon: options?.icon || DEFAULT_ICON,
        tag: options?.tag,
        requireInteraction: false,
      });

      notification.onclick = () => {
        window.focus();
        options?.onClick?.();
        notification.close();
      };

      setTimeout(() => notification.close(), 5000);
    } catch {
      // Ignore
    }
  },
};
