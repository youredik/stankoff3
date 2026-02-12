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

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (data) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({
      toasts: [...state.toasts, { ...data, id }],
    }));
    return id;
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

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
