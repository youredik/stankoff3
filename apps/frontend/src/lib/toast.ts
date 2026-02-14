import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  text: string;
  type: ToastType;
  duration: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
}

const MAX_TOASTS = 3;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (data) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((state) => {
      const next = [...state.toasts, { ...data, id }];
      // Keep only newest MAX_TOASTS — oldest non-rendered toasts never fire timers
      return { toasts: next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next };
    });
    return id;
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

// Expose for Playwright/dev testing
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).__toastStore = useToastStore;
}

/** Вызывается из stores/utils без хуков */
export const toast = {
  success: (text: string, action?: Toast['action']) => {
    useToastStore.getState().addToast({ text, type: 'success', duration: 3000, action });
  },
  error: (text: string, action?: Toast['action']) => {
    useToastStore.getState().addToast({ text, type: 'error', duration: 5000, action });
  },
  info: (text: string, action?: Toast['action']) => {
    useToastStore.getState().addToast({ text, type: 'info', duration: 3000, action });
  },
  warning: (text: string, action?: Toast['action']) => {
    useToastStore.getState().addToast({ text, type: 'warning', duration: 5000, action });
  },
  /** Toast с кнопкой "Отменить" — для undo паттерна */
  withUndo: (text: string, onUndo: () => void) => {
    useToastStore.getState().addToast({
      text,
      type: 'info',
      duration: 5000,
      action: { label: 'Отменить', onClick: onUndo },
    });
  },
};
