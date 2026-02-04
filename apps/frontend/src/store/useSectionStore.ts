'use client';

import { create } from 'zustand';
import type { MenuSection, MenuSectionRole } from '@/types';
import { sectionsApi } from '@/lib/api/sections';
import { useNotificationStore } from './useNotificationStore';

interface SectionStore {
  sections: MenuSection[];
  sectionRoles: Record<string, MenuSectionRole>; // Роли во всех разделах
  loading: boolean;
  error: string | null;
  // Состояние свёрнутости разделов (сохраняется в localStorage)
  collapsedSections: Record<string, boolean>;

  fetchSections: () => Promise<void>;
  fetchMyRoles: () => Promise<void>;

  // Получить роль для конкретного раздела
  getRoleForSection: (sectionId: string) => MenuSectionRole | null;

  // Section mutations
  createSection: (data: { name: string; description?: string; icon?: string }) => Promise<MenuSection>;
  updateSection: (id: string, data: { name?: string; description?: string; icon?: string }) => Promise<void>;
  deleteSection: (id: string) => Promise<void>;
  reorderSections: (sectionIds: string[]) => Promise<void>;

  // Свёрнутость разделов
  toggleSectionCollapsed: (sectionId: string) => void;
  setSectionCollapsed: (sectionId: string, collapsed: boolean) => void;
}

const COLLAPSED_SECTIONS_KEY = 'stankoff-collapsed-sections';

const loadCollapsedSections = (): Record<string, boolean> => {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

const saveCollapsedSections = (collapsed: Record<string, boolean>) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(collapsed));
  } catch {
    // Игнорируем ошибки localStorage
  }
};

export const useSectionStore = create<SectionStore>((set, get) => ({
  sections: [],
  sectionRoles: {},
  loading: false,
  error: null,
  collapsedSections: loadCollapsedSections(),

  fetchSections: async () => {
    set({ loading: true, error: null });
    try {
      const sections = await sectionsApi.getAll();
      set({ sections, loading: false });
      // Автоматически загружаем роли для всех разделов
      get().fetchMyRoles();
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  fetchMyRoles: async () => {
    try {
      const roles = await sectionsApi.getMyRoles();
      set({ sectionRoles: roles });
    } catch {
      set({ sectionRoles: {} });
    }
  },

  getRoleForSection: (sectionId: string) => {
    return get().sectionRoles[sectionId] || null;
  },

  createSection: async (data) => {
    try {
      const created = await sectionsApi.create(data);
      set((state) => ({
        sections: [...state.sections, created],
      }));
      useNotificationStore.getState().addNotification({
        text: `Раздел «${created.name}» создан`,
        type: 'workspace',
      });
      return created;
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  updateSection: async (id, data) => {
    try {
      const updated = await sectionsApi.update(id, data);
      set((state) => ({
        sections: state.sections.map((s) =>
          s.id === id ? { ...s, ...updated } : s
        ),
      }));
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  deleteSection: async (id) => {
    const section = get().sections.find((s) => s.id === id);
    try {
      await sectionsApi.delete(id);
      set((state) => ({
        sections: state.sections.filter((s) => s.id !== id),
      }));
      useNotificationStore.getState().addNotification({
        text: `Раздел «${section?.name || 'Без названия'}» удалён`,
        type: 'workspace',
      });
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  reorderSections: async (sectionIds) => {
    try {
      await sectionsApi.reorder(sectionIds);
      // Обновляем порядок локально
      set((state) => ({
        sections: sectionIds
          .map((id, index) => {
            const section = state.sections.find((s) => s.id === id);
            return section ? { ...section, order: index } : null;
          })
          .filter((s): s is MenuSection => s !== null),
      }));
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  toggleSectionCollapsed: (sectionId) => {
    set((state) => {
      const newCollapsed = {
        ...state.collapsedSections,
        [sectionId]: !state.collapsedSections[sectionId],
      };
      saveCollapsedSections(newCollapsed);
      return { collapsedSections: newCollapsed };
    });
  },

  setSectionCollapsed: (sectionId, collapsed) => {
    set((state) => {
      const newCollapsed = {
        ...state.collapsedSections,
        [sectionId]: collapsed,
      };
      saveCollapsedSections(newCollapsed);
      return { collapsedSections: newCollapsed };
    });
  },
}));
