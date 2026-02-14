'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Bell,
  MessageSquare,
  UserCheck,
  RefreshCw,
  FileText,
  Briefcase,
  X,
  AlertTriangle,
  AlertOctagon,
  Sparkles,
  CheckCircle2,
  XCircle,
  Info,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useNotificationStore } from '@/store/useNotificationStore';
import type { AppNotification, NotificationType } from '@/store/useNotificationStore';
import { useToastStore, type ToastType } from '@/lib/toast';

/* ─── Icon & color maps ─── */

const NOTIFICATION_ICONS: Record<NotificationType, typeof Bell> = {
  entity: FileText,
  comment: MessageSquare,
  status: RefreshCw,
  assignment: UserCheck,
  mention: Bell,
  workspace: Briefcase,
  sla_warning: AlertTriangle,
  sla_breach: AlertOctagon,
  ai_suggestion: Sparkles,
};

const NOTIFICATION_ACCENT: Record<NotificationType, string> = {
  entity: 'bg-blue-500',
  comment: 'bg-green-500',
  status: 'bg-orange-500',
  assignment: 'bg-purple-500',
  mention: 'bg-pink-500',
  workspace: 'bg-indigo-500',
  sla_warning: 'bg-amber-500',
  sla_breach: 'bg-red-500',
  ai_suggestion: 'bg-teal-500',
};

const NOTIFICATION_ICON_COLOR: Record<NotificationType, string> = {
  entity: 'text-blue-500',
  comment: 'text-green-500',
  status: 'text-orange-500',
  assignment: 'text-purple-500',
  mention: 'text-pink-500',
  workspace: 'text-indigo-500',
  sla_warning: 'text-amber-500',
  sla_breach: 'text-red-500',
  ai_suggestion: 'text-teal-500',
};

const UI_TOAST_ICONS: Record<ToastType, typeof Bell> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const UI_TOAST_ACCENT: Record<ToastType, string> = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
  warning: 'bg-amber-500',
};

const UI_TOAST_ICON_COLOR: Record<ToastType, string> = {
  success: 'text-emerald-500',
  error: 'text-red-500',
  info: 'text-blue-500',
  warning: 'text-amber-500',
};

/* ─── Constants ─── */
const MAX_VISIBLE = 3;

// Module-level Set: survives component remounts during navigation
const shownNotifIds = new Set<string>();

/* ─── Hook: track notification toasts ─── */

function useNotifToasts(notifications: AppNotification[]) {
  const [toasts, setToasts] = useState<AppNotification[]>([]);

  useEffect(() => {
    const newNotifications = notifications.filter(
      (n) => !n.read && !shownNotifIds.has(n.id),
    );
    if (newNotifications.length === 0) return;

    for (const n of newNotifications) {
      shownNotifIds.add(n.id);
    }
    setToasts((prev) => [...prev, ...newNotifications]);
  }, [notifications]);

  return [toasts, setToasts] as const;
}

/* ─── Individual toast item (handles its own timer & progress) ─── */

interface ToastItemProps {
  children: React.ReactNode;
  duration: number;
  accentClass: string;
  progressClass: string;
  urgent?: boolean;
  onDismiss: () => void;
}

function ToastItem({ children, duration, accentClass, progressClass, urgent, onDismiss }: ToastItemProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef(Date.now());
  const remainRef = useRef(duration);
  const progressRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  const startTimer = useCallback(() => {
    startRef.current = Date.now();
    timerRef.current = setTimeout(onDismiss, remainRef.current);

    const animate = () => {
      const elapsed = Date.now() - startRef.current;
      const remaining = Math.max(0, remainRef.current - elapsed);
      const pct = (remaining / duration) * 100;
      if (progressRef.current) {
        progressRef.current.style.width = `${pct}%`;
      }
      if (pct > 0) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };
    animFrameRef.current = requestAnimationFrame(animate);
  }, [duration, onDismiss]);

  const pauseTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    cancelAnimationFrame(animFrameRef.current);
    const elapsed = Date.now() - startRef.current;
    remainRef.current = Math.max(0, remainRef.current - elapsed);
  }, []);

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [startTimer]);

  return (
    <div
      className={`
        group relative overflow-hidden
        bg-white dark:bg-gray-900
        border border-gray-200/60 dark:border-gray-800
        rounded-lg shadow-md dark:shadow-gray-950/40
        pointer-events-auto
        w-[360px] max-w-[calc(100vw-2rem)]
        toast-enter
        ${urgent ? 'ring-1 ring-red-500/30' : ''}
      `}
      onMouseEnter={pauseTimer}
      onMouseLeave={startTimer}
      role="alert"
      aria-live="polite"
      data-toast
    >
      {/* Left accent stripe */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${accentClass} rounded-l-lg`} />

      {/* Content */}
      <div className="flex items-center gap-2.5 pl-3.5 pr-2 py-2.5">
        {children}
        <button
          onClick={onDismiss}
          aria-label="Закрыть"
          className="p-1 rounded-md text-gray-400 opacity-0 group-hover:opacity-100 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-[2px] w-full bg-gray-100 dark:bg-gray-800">
        <div
          ref={progressRef}
          className={`h-full ${progressClass} transition-none`}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
}

/* ─── Main container ─── */

export function ToastContainer() {
  const router = useRouter();
  const { notifications } = useNotificationStore();
  const { toasts: uiToasts, removeToast: removeUiToast } = useToastStore();
  const [notifToasts, setNotifToasts] = useNotifToasts(notifications);

  const handleDismissNotif = useCallback((id: string) => {
    setNotifToasts((prev) => prev.filter((t) => t.id !== id));
  }, [setNotifToasts]);

  const handleDismissUi = useCallback((id: string) => {
    removeUiToast(id);
  }, [removeUiToast]);

  const handleClickNotif = useCallback((t: AppNotification) => {
    if (t.entityId && t.workspaceId) {
      router.push(`/workspace/${t.workspaceId}?entity=${t.entityId}`);
    }
    handleDismissNotif(t.id);
  }, [router, handleDismissNotif]);

  // Total visible = MAX_VISIBLE. UI toasts take priority, notifications fill the rest.
  const visibleUiCount = Math.min(uiToasts.length, MAX_VISIBLE);
  const remainingSlots = MAX_VISIBLE - visibleUiCount;
  const visibleNotif = remainingSlots > 0 ? notifToasts.slice(-remainingSlots) : [];

  if (uiToasts.length === 0 && visibleNotif.length === 0) return null;

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col-reverse gap-2 pointer-events-none items-center">
        {/* UI toasts */}
        {uiToasts.map((t) => {
          const Icon = UI_TOAST_ICONS[t.type];
          const iconColor = UI_TOAST_ICON_COLOR[t.type];
          const accent = UI_TOAST_ACCENT[t.type];

          return (
            <ToastItem
              key={t.id}
              duration={t.duration}
              accentClass={accent}
              progressClass={accent}
              onDismiss={() => handleDismissUi(t.id)}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-snug text-gray-800 dark:text-gray-200">{t.text}</p>
                {t.action && (
                  <button
                    onClick={() => {
                      t.action!.onClick();
                      handleDismissUi(t.id);
                    }}
                    className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 mt-0.5"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
            </ToastItem>
          );
        })}

        {/* Notification toasts */}
        {visibleNotif.map((t) => {
          const Icon = t.type ? NOTIFICATION_ICONS[t.type] : Bell;
          const iconColor = t.type ? NOTIFICATION_ICON_COLOR[t.type] : 'text-gray-500';
          const accent = t.type ? NOTIFICATION_ACCENT[t.type] : 'bg-gray-400';

          return (
            <ToastItem
              key={t.id}
              duration={t.urgent ? 10000 : 4000}
              accentClass={accent}
              progressClass={accent}
              urgent={t.urgent}
              onDismiss={() => handleDismissNotif(t.id)}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => handleClickNotif(t)}
              >
                <p className="text-[13px] leading-snug text-gray-800 dark:text-gray-200">{t.text}</p>
                {t.entityId && (
                  <p className="text-[11px] text-primary-600 dark:text-primary-400 mt-0.5">Открыть</p>
                )}
              </div>
            </ToastItem>
          );
        })}
      </div>

      <style jsx global>{`
        @keyframes toastEnter {
          from {
            transform: translateY(16px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .toast-enter {
          animation: toastEnter 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @media (prefers-reduced-motion: reduce) {
          .toast-enter {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}
