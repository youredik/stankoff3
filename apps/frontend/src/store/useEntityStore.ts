import { create } from 'zustand';
import type { Entity, Comment, User, UploadedAttachment } from '@/types';
import { entitiesApi, type EntityFilters, type KanbanColumnData } from '@/lib/api/entities';
import { commentsApi } from '@/lib/api/comments';
import { usersApi } from '@/lib/api/users';
import { useWorkspaceStore } from './useWorkspaceStore';

export interface KanbanColumnState {
  items: Entity[];
  total: number;
  hasMore: boolean;
  loading: boolean;
}

interface EntityStore {
  // Kanban state
  kanbanColumns: Record<string, KanbanColumnState>;
  kanbanLoading: boolean;
  kanbanFilters: EntityFilters;
  kanbanWorkspaceId: string | null;
  totalAll: number;

  // Backward compat flat list (derived from kanbanColumns)
  entities: Entity[];
  loading: boolean;
  error: string | null;
  selectedEntity: Entity | null;
  comments: Comment[];
  users: User[];

  // Kanban actions
  fetchKanban: (workspaceId: string, filters?: EntityFilters) => Promise<void>;
  loadMoreColumn: (statusId: string) => Promise<void>;
  setKanbanFilters: (filters: EntityFilters) => void;

  // Legacy actions (still used by some components)
  fetchEntities: (workspaceId: string) => Promise<void>;
  fetchUsers: () => Promise<void>;
  setEntities: (entities: Entity[]) => void;

  // Mutations
  updateStatus: (id: string, status: string) => Promise<void>;
  updateAssignee: (id: string, assigneeId: string | null) => Promise<void>;
  updateLinkedEntities: (id: string, linkedEntityIds: string[]) => Promise<void>;
  updateEntityData: (id: string, fieldId: string, value: any) => Promise<void>;

  selectEntity: (id: string) => Promise<void>;
  deselectEntity: () => void;
  addComment: (entityId: string, content: string, attachments?: UploadedAttachment[]) => Promise<void>;
  createEntity: (data: {
    workspaceId: string;
    title: string;
    priority: 'low' | 'medium' | 'high';
    assigneeId?: string;
    data?: Record<string, any>;
  }) => Promise<void>;

  // Helper
  getAllEntities: () => Entity[];
}

function flattenColumns(columns: Record<string, KanbanColumnState>): Entity[] {
  return Object.values(columns).flatMap((col) => col.items);
}

export const useEntityStore = create<EntityStore>((set, get) => ({
  kanbanColumns: {},
  kanbanLoading: false,
  kanbanFilters: {},
  kanbanWorkspaceId: null,
  totalAll: 0,

  entities: [],
  loading: false,
  error: null,
  selectedEntity: null,
  comments: [],
  users: [],

  setEntities: (entities) => set({ entities }),

  getAllEntities: () => {
    const { kanbanColumns, entities } = get();
    const fromKanban = flattenColumns(kanbanColumns);
    return fromKanban.length > 0 ? fromKanban : entities;
  },

  fetchKanban: async (workspaceId: string, filters?: EntityFilters) => {
    const activeFilters = filters ?? get().kanbanFilters;
    set({ kanbanLoading: true, kanbanWorkspaceId: workspaceId, error: null });
    try {
      const data = await entitiesApi.getKanban(workspaceId, activeFilters);
      const columns: Record<string, KanbanColumnState> = {};
      for (const col of data.columns) {
        columns[col.status] = {
          items: col.items,
          total: col.total,
          hasMore: col.hasMore,
          loading: false,
        };
      }
      const entities = flattenColumns(columns);
      set({ kanbanColumns: columns, totalAll: data.totalAll, entities, kanbanLoading: false, loading: false });
    } catch (err) {
      set({ kanbanLoading: false, loading: false, error: (err as Error).message });
    }
  },

  loadMoreColumn: async (statusId: string) => {
    const { kanbanColumns, kanbanWorkspaceId, kanbanFilters } = get();
    if (!kanbanWorkspaceId) return;
    const column = kanbanColumns[statusId];
    if (!column || !column.hasMore || column.loading) return;

    // Mark column as loading
    set({
      kanbanColumns: {
        ...kanbanColumns,
        [statusId]: { ...column, loading: true },
      },
    });

    try {
      const data = await entitiesApi.loadMoreColumn(
        kanbanWorkspaceId,
        statusId,
        column.items.length,
        kanbanFilters,
      );
      const state = get();
      const currentCol = state.kanbanColumns[statusId];
      if (!currentCol) return;

      const updatedCol: KanbanColumnState = {
        items: [...currentCol.items, ...data.items],
        total: data.total,
        hasMore: data.hasMore,
        loading: false,
      };
      const updatedColumns = { ...state.kanbanColumns, [statusId]: updatedCol };
      set({
        kanbanColumns: updatedColumns,
        entities: flattenColumns(updatedColumns),
      });
    } catch {
      const state = get();
      const currentCol = state.kanbanColumns[statusId];
      if (currentCol) {
        set({
          kanbanColumns: {
            ...state.kanbanColumns,
            [statusId]: { ...currentCol, loading: false },
          },
        });
      }
    }
  },

  setKanbanFilters: (filters: EntityFilters) => {
    const { kanbanWorkspaceId, fetchKanban } = get();
    set({ kanbanFilters: filters });
    if (kanbanWorkspaceId) {
      fetchKanban(kanbanWorkspaceId, filters);
    }
  },

  // Legacy — redirect to fetchKanban
  fetchEntities: async (workspaceId: string) => {
    set({ loading: true, error: null });
    await get().fetchKanban(workspaceId);
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
    const { kanbanColumns, selectedEntity } = get();
    const allEntities = get().getAllEntities();
    const entity = allEntities.find((e) => e.id === id);
    if (!entity) return;

    const oldStatus = entity.status;
    const prevColumns = kanbanColumns;

    // Optimistic: move between columns
    const updatedEntity = { ...entity, status };
    const newColumns = { ...kanbanColumns };

    // Remove from old column
    const oldCol = newColumns[oldStatus];
    if (oldCol) {
      newColumns[oldStatus] = {
        ...oldCol,
        items: oldCol.items.filter((e) => e.id !== id),
        total: oldCol.total - 1,
      };
    }

    // Add to new column
    const newCol = newColumns[status];
    if (newCol) {
      newColumns[status] = {
        ...newCol,
        items: [updatedEntity, ...newCol.items],
        total: newCol.total + 1,
      };
    } else {
      newColumns[status] = {
        items: [updatedEntity],
        total: 1,
        hasMore: false,
        loading: false,
      };
    }

    set({
      kanbanColumns: newColumns,
      entities: flattenColumns(newColumns),
    });
    if (selectedEntity?.id === id) {
      set({ selectedEntity: { ...selectedEntity, status } });
    }

    try {
      await entitiesApi.updateStatus(id, status);
    } catch {
      // Rollback
      set({
        kanbanColumns: prevColumns,
        entities: flattenColumns(prevColumns),
      });
      if (selectedEntity?.id === id) {
        set({ selectedEntity });
      }
    }
  },

  updateAssignee: async (id: string, assigneeId: string | null) => {
    const { kanbanColumns, selectedEntity, users } = get();
    const prevColumns = { ...kanbanColumns };
    const resolved = assigneeId ?? undefined;
    const assignee = resolved ? users.find((u) => u.id === resolved) : undefined;

    // Optimistic update across all columns
    const newColumns: Record<string, KanbanColumnState> = {};
    for (const [status, col] of Object.entries(kanbanColumns)) {
      newColumns[status] = {
        ...col,
        items: col.items.map((e) =>
          e.id === id ? { ...e, assigneeId: resolved, assignee } : e,
        ),
      };
    }
    set({
      kanbanColumns: newColumns,
      entities: flattenColumns(newColumns),
    });
    if (selectedEntity?.id === id) {
      set({ selectedEntity: { ...selectedEntity, assigneeId: resolved, assignee } });
    }

    try {
      await entitiesApi.updateAssignee(id, assigneeId);
    } catch {
      set({
        kanbanColumns: prevColumns,
        entities: flattenColumns(prevColumns),
      });
      if (selectedEntity?.id === id) set({ selectedEntity });
    }
  },

  updateLinkedEntities: async (id: string, linkedEntityIds: string[]) => {
    const { kanbanColumns, selectedEntity } = get();
    const prevColumns = { ...kanbanColumns };

    const newColumns: Record<string, KanbanColumnState> = {};
    for (const [status, col] of Object.entries(kanbanColumns)) {
      newColumns[status] = {
        ...col,
        items: col.items.map((e) =>
          e.id === id ? { ...e, linkedEntityIds } : e,
        ),
      };
    }
    set({
      kanbanColumns: newColumns,
      entities: flattenColumns(newColumns),
    });
    if (selectedEntity?.id === id) {
      set({ selectedEntity: { ...selectedEntity, linkedEntityIds } });
    }

    try {
      await entitiesApi.update(id, { linkedEntityIds } as any);
    } catch {
      set({
        kanbanColumns: prevColumns,
        entities: flattenColumns(prevColumns),
      });
      if (selectedEntity?.id === id) set({ selectedEntity });
    }
  },

  updateEntityData: async (id: string, fieldId: string, value: any) => {
    const { kanbanColumns, selectedEntity } = get();
    const allEntities = get().getAllEntities();
    const entity = allEntities.find((e) => e.id === id);
    if (!entity) return;

    const prevColumns = { ...kanbanColumns };
    const newData = { ...entity.data, [fieldId]: value };

    const newColumns: Record<string, KanbanColumnState> = {};
    for (const [status, col] of Object.entries(kanbanColumns)) {
      newColumns[status] = {
        ...col,
        items: col.items.map((e) =>
          e.id === id ? { ...e, data: newData } : e,
        ),
      };
    }
    set({
      kanbanColumns: newColumns,
      entities: flattenColumns(newColumns),
    });
    if (selectedEntity?.id === id) {
      set({ selectedEntity: { ...selectedEntity, data: newData } });
    }

    try {
      await entitiesApi.update(id, { data: newData } as any);
    } catch {
      set({
        kanbanColumns: prevColumns,
        entities: flattenColumns(prevColumns),
      });
      if (selectedEntity?.id === id) set({ selectedEntity });
    }
  },

  selectEntity: async (id: string) => {
    const allEntities = get().getAllEntities();
    const local = allEntities.find((e) => e.id === id);
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

      const entity = await entitiesApi.create({
        workspaceId: data.workspaceId,
        title: data.title,
        status: initialStatus,
        priority: data.priority,
        assigneeId: data.assigneeId,
        data: data.data || {},
      } as any);

      // Add to kanban column
      const { kanbanColumns } = get();
      const col = kanbanColumns[initialStatus];
      if (col) {
        const exists = col.items.find((e) => e.id === entity.id);
        if (!exists) {
          const updatedColumns = {
            ...kanbanColumns,
            [initialStatus]: {
              ...col,
              items: [entity, ...col.items],
              total: col.total + 1,
            },
          };
          set({
            kanbanColumns: updatedColumns,
            entities: flattenColumns(updatedColumns),
            totalAll: get().totalAll + 1,
          });
        }
      } else {
        // Column didn't exist yet (e.g., workspace just configured)
        const updatedColumns = {
          ...kanbanColumns,
          [initialStatus]: {
            items: [entity],
            total: 1,
            hasMore: false,
            loading: false,
          },
        };
        set({
          kanbanColumns: updatedColumns,
          entities: flattenColumns(updatedColumns),
          totalAll: get().totalAll + 1,
        });
      }
    } catch {
      // silent
    }
  },
}));
