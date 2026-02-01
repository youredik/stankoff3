import { create } from 'zustand';
import type { Entity, Comment, User, UploadedAttachment } from '@/types';
import { entitiesApi } from '@/lib/api/entities';
import { commentsApi } from '@/lib/api/comments';
import { usersApi } from '@/lib/api/users';
import { useWorkspaceStore } from './useWorkspaceStore';

interface EntityStore {
  entities: Entity[];
  loading: boolean;
  error: string | null;
  selectedEntity: Entity | null;
  comments: Comment[];
  users: User[];

  fetchEntities: (workspaceId: string) => Promise<void>;
  fetchUsers: () => Promise<void>;
  setEntities: (entities: Entity[]) => void;

  updateStatus: (id: string, status: string) => Promise<void>;
  updateAssignee: (id: string, assigneeId: string | null) => Promise<void>;
  updateLinkedEntities: (id: string, linkedEntityIds: string[]) => Promise<void>;

  selectEntity: (id: string) => Promise<void>;
  deselectEntity: () => void;
  addComment: (entityId: string, content: string, attachments?: UploadedAttachment[]) => Promise<void>;
  createEntity: (data: {
    workspaceId: string;
    title: string;
    priority: 'low' | 'medium' | 'high';
    assigneeId?: string;
  }) => Promise<void>;
}

export const useEntityStore = create<EntityStore>((set, get) => ({
  entities: [],
  loading: false,
  error: null,
  selectedEntity: null,
  comments: [],
  users: [],

  setEntities: (entities) => set({ entities }),

  fetchEntities: async (workspaceId: string) => {
    set({ loading: true, error: null });
    try {
      const entities = await entitiesApi.getByWorkspace(workspaceId);
      set({ entities, loading: false });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  fetchUsers: async () => {
    try {
      const users = await usersApi.getAll();
      set({ users });
    } catch {
      // silent
    }
  },

  updateStatus: async (id: string, status: string) => {
    const prev = get().entities;
    const prevSelected = get().selectedEntity;
    set({
      entities: prev.map((e) => (e.id === id ? { ...e, status } : e)),
    });
    if (prevSelected?.id === id) {
      set({ selectedEntity: { ...prevSelected, status } });
    }
    try {
      await entitiesApi.updateStatus(id, status);
    } catch {
      set({ entities: prev });
      if (prevSelected?.id === id) set({ selectedEntity: prevSelected });
    }
  },

  updateAssignee: async (id: string, assigneeId: string | null) => {
    const prev = get().entities;
    const prevSelected = get().selectedEntity;
    const users = get().users;
    const resolved = assigneeId ?? undefined;
    const assignee = resolved
      ? users.find((u) => u.id === resolved)
      : undefined;
    set({
      entities: prev.map((e) =>
        e.id === id ? { ...e, assigneeId: resolved, assignee } : e,
      ),
    });
    if (prevSelected?.id === id) {
      set({ selectedEntity: { ...prevSelected, assigneeId: resolved, assignee } });
    }
    try {
      await entitiesApi.updateAssignee(id, assigneeId);
    } catch {
      set({ entities: prev });
      if (prevSelected?.id === id) set({ selectedEntity: prevSelected });
    }
  },

  updateLinkedEntities: async (id: string, linkedEntityIds: string[]) => {
    const prev = get().entities;
    const prevSelected = get().selectedEntity;
    set({
      entities: prev.map((e) =>
        e.id === id ? { ...e, linkedEntityIds } : e
      ),
    });
    if (prevSelected?.id === id) {
      set({ selectedEntity: { ...prevSelected, linkedEntityIds } });
    }
    try {
      await entitiesApi.update(id, { linkedEntityIds } as any);
    } catch {
      set({ entities: prev });
      if (prevSelected?.id === id) set({ selectedEntity: prevSelected });
    }
  },

  selectEntity: async (id: string) => {
    const local = get().entities.find((e) => e.id === id);
    if (local) set({ selectedEntity: local, comments: [] });
    try {
      const entity = await entitiesApi.getById(id);
      set({ selectedEntity: entity, comments: entity.comments || [] });
    } catch {
      // keep local
    }
  },

  deselectEntity: () => set({ selectedEntity: null, comments: [] }),

  addComment: async (entityId: string, content: string, attachments?: UploadedAttachment[]) => {
    const users = get().users;
    const author = users.find((u) => u.role === 'admin') || users[0];
    if (!author) return;
    try {
      const comment = await commentsApi.create(entityId, {
        authorId: author.id,
        content,
        attachments,
      });
      // Проверяем, не был ли комментарий уже добавлен через WebSocket
      const currentComments = get().comments;
      const exists = currentComments.find((c) => c.id === comment.id);
      if (!exists) {
        set({ comments: [...currentComments, comment] });
      }
    } catch {
      // silent
    }
  },

  createEntity: async (data) => {
    try {
      // Получаем первый статус из текущего workspace
      const workspace = useWorkspaceStore.getState().currentWorkspace;
      let initialStatus = 'new';
      if (workspace?.sections) {
        for (const section of workspace.sections) {
          const statusField = section.fields.find((f) => f.type === 'status');
          if (statusField?.options && statusField.options.length > 0) {
            initialStatus = statusField.options[0].id;
            break;
          }
        }
      }

      // customId генерируется автоматически на сервере
      const entity = await entitiesApi.create({
        workspaceId: data.workspaceId,
        title: data.title,
        status: initialStatus,
        priority: data.priority,
        assigneeId: data.assigneeId,
        data: {},
      } as any);
      // Проверяем, не была ли сущность уже добавлена через WebSocket
      const currentEntities = get().entities;
      const exists = currentEntities.find((e) => e.id === entity.id);
      if (!exists) {
        // Новые сущности добавляем в начало (сортировка по createdAt DESC)
        set({ entities: [entity, ...currentEntities] });
      }
    } catch {
      // silent
    }
  },
}));
