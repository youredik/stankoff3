'use client';

import { create } from 'zustand';
import type { Workspace, Field, Section, FieldOption, WorkspaceRole } from '@/types';
import { workspacesApi } from '@/lib/api/workspaces';

interface WorkspaceStore {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  currentRole: WorkspaceRole | null; // Роль текущего пользователя в текущем workspace
  loading: boolean;
  error: string | null;

  fetchWorkspaces: () => Promise<void>;
  fetchWorkspace: (id: string) => Promise<void>;
  fetchMyRole: (workspaceId: string) => Promise<void>;
  setCurrentWorkspace: (workspace: Workspace | null) => void;

  // Helpers для проверки прав
  canEdit: () => boolean;
  canDelete: () => boolean;

  // Workspace mutations
  createWorkspace: (data: Partial<Workspace>) => Promise<Workspace>;
  updateWorkspace: (id: string, data: Partial<Workspace>) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;

  // Section mutations
  addSection: (name: string) => void;
  updateSection: (sectionId: string, name: string) => void;
  removeSection: (sectionId: string) => void;
  reorderSections: (fromIndex: number, toIndex: number) => void;

  // Field mutations
  addField: (sectionId: string, field: Field) => void;
  updateField: (sectionId: string, fieldId: string, data: Partial<Field>) => void;
  removeField: (sectionId: string, fieldId: string) => void;
  moveField: (
    fromSectionId: string,
    toSectionId: string,
    fromIndex: number,
    toIndex: number
  ) => void;

  // Save current workspace to backend
  saveWorkspace: () => Promise<void>;
}

const generateId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  currentWorkspace: null,
  currentRole: null,
  loading: false,
  error: null,

  fetchWorkspaces: async () => {
    set({ loading: true, error: null });
    try {
      const workspaces = await workspacesApi.getAll();
      set({ workspaces, loading: false });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  fetchWorkspace: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const workspace = await workspacesApi.getById(id);
      set({ currentWorkspace: workspace, loading: false });
      // Автоматически получаем роль пользователя
      get().fetchMyRole(id);
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  fetchMyRole: async (workspaceId: string) => {
    try {
      const { role } = await workspacesApi.getMyRole(workspaceId);
      set({ currentRole: role });
    } catch {
      set({ currentRole: null });
    }
  },

  setCurrentWorkspace: (workspace) => set({ currentWorkspace: workspace }),

  // Проверка: может ли пользователь редактировать (editor или admin)
  canEdit: () => {
    const role = get().currentRole;
    return role === 'editor' || role === 'admin';
  },

  // Проверка: может ли пользователь удалять (только admin)
  canDelete: () => {
    const role = get().currentRole;
    return role === 'admin';
  },

  createWorkspace: async (data) => {
    // Данные для отправки на сервер (без id, createdAt, updatedAt — их генерирует бэкенд)
    const workspaceData = {
      name: data.name || 'Новое рабочее место',
      icon: data.icon || '📋',
      sections: data.sections || [
        {
          id: generateId(),
          name: 'Основная информация',
          order: 0,
          fields: [
            {
              id: 'title',
              name: 'Название',
              type: 'text' as const,
              required: true,
            },
            {
              id: 'status',
              name: 'Статус',
              type: 'status' as const,
              required: true,
              options: [
                { id: 'new', label: 'Новая', color: '#3B82F6' },
                { id: 'in-progress', label: 'В работе', color: '#F59E0B' },
                { id: 'done', label: 'Готово', color: '#10B981' },
              ],
            },
            {
              id: 'priority',
              name: 'Приоритет',
              type: 'select' as const,
              options: [
                { id: 'low', label: 'Низкий', color: '#10B981' },
                { id: 'medium', label: 'Средний', color: '#F59E0B' },
                { id: 'high', label: 'Высокий', color: '#EF4444' },
              ],
            },
            {
              id: 'assignee',
              name: 'Исполнитель',
              type: 'user' as const,
            },
          ],
        },
      ],
    };

    try {
      const created = await workspacesApi.create(workspaceData);
      set((state) => ({
        workspaces: [...state.workspaces, created],
        currentWorkspace: created,
      }));
      return created;
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  updateWorkspace: async (id, data) => {
    try {
      await workspacesApi.update(id, data);
      set((state) => ({
        workspaces: state.workspaces.map((w) =>
          w.id === id ? { ...w, ...data } : w
        ),
        currentWorkspace:
          state.currentWorkspace?.id === id
            ? { ...state.currentWorkspace, ...data }
            : state.currentWorkspace,
      }));
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  deleteWorkspace: async (id) => {
    try {
      await workspacesApi.delete(id);
      set((state) => ({
        workspaces: state.workspaces.filter((w) => w.id !== id),
        currentWorkspace:
          state.currentWorkspace?.id === id ? null : state.currentWorkspace,
      }));
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  addSection: (name) => {
    const { currentWorkspace } = get();
    if (!currentWorkspace) return;

    const newSection: Section = {
      id: generateId(),
      name,
      fields: [],
      order: currentWorkspace.sections.length,
    };

    set({
      currentWorkspace: {
        ...currentWorkspace,
        sections: [...currentWorkspace.sections, newSection],
      },
    });
  },

  updateSection: (sectionId, name) => {
    const { currentWorkspace } = get();
    if (!currentWorkspace) return;

    set({
      currentWorkspace: {
        ...currentWorkspace,
        sections: currentWorkspace.sections.map((s) =>
          s.id === sectionId ? { ...s, name } : s
        ),
      },
    });
  },

  removeSection: (sectionId) => {
    const { currentWorkspace } = get();
    if (!currentWorkspace) return;

    set({
      currentWorkspace: {
        ...currentWorkspace,
        sections: currentWorkspace.sections
          .filter((s) => s.id !== sectionId)
          .map((s, i) => ({ ...s, order: i })),
      },
    });
  },

  reorderSections: (fromIndex, toIndex) => {
    const { currentWorkspace } = get();
    if (!currentWorkspace) return;

    const sections = [...currentWorkspace.sections];
    const [removed] = sections.splice(fromIndex, 1);
    sections.splice(toIndex, 0, removed);

    set({
      currentWorkspace: {
        ...currentWorkspace,
        sections: sections.map((s, i) => ({ ...s, order: i })),
      },
    });
  },

  addField: (sectionId, field) => {
    const { currentWorkspace } = get();
    if (!currentWorkspace) return;

    set({
      currentWorkspace: {
        ...currentWorkspace,
        sections: currentWorkspace.sections.map((s) =>
          s.id === sectionId ? { ...s, fields: [...s.fields, field] } : s
        ),
      },
    });
  },

  updateField: (sectionId, fieldId, data) => {
    const { currentWorkspace } = get();
    if (!currentWorkspace) return;

    set({
      currentWorkspace: {
        ...currentWorkspace,
        sections: currentWorkspace.sections.map((s) =>
          s.id === sectionId
            ? {
                ...s,
                fields: s.fields.map((f) =>
                  f.id === fieldId ? { ...f, ...data } : f
                ),
              }
            : s
        ),
      },
    });
  },

  removeField: (sectionId, fieldId) => {
    const { currentWorkspace } = get();
    if (!currentWorkspace) return;

    set({
      currentWorkspace: {
        ...currentWorkspace,
        sections: currentWorkspace.sections.map((s) =>
          s.id === sectionId
            ? { ...s, fields: s.fields.filter((f) => f.id !== fieldId) }
            : s
        ),
      },
    });
  },

  moveField: (fromSectionId, toSectionId, fromIndex, toIndex) => {
    const { currentWorkspace } = get();
    if (!currentWorkspace) return;

    const sections = currentWorkspace.sections.map((s) => ({
      ...s,
      fields: [...s.fields],
    }));

    const fromSection = sections.find((s) => s.id === fromSectionId);
    const toSection = sections.find((s) => s.id === toSectionId);
    if (!fromSection || !toSection) return;

    const [movedField] = fromSection.fields.splice(fromIndex, 1);
    toSection.fields.splice(toIndex, 0, movedField);

    set({
      currentWorkspace: {
        ...currentWorkspace,
        sections,
      },
    });
  },

  saveWorkspace: async () => {
    const { currentWorkspace } = get();
    if (!currentWorkspace) return;

    set({ loading: true, error: null });
    try {
      await workspacesApi.update(currentWorkspace.id, {
        name: currentWorkspace.name,
        icon: currentWorkspace.icon,
        sections: currentWorkspace.sections,
      });
      set({ loading: false });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },
}));
