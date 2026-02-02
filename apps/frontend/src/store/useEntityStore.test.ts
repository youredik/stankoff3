import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEntityStore } from './useEntityStore';

// Mock APIs
vi.mock('@/lib/api/entities', () => ({
  entitiesApi: {
    getByWorkspace: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    updateAssignee: vi.fn(),
  },
}));

vi.mock('@/lib/api/comments', () => ({
  commentsApi: {
    create: vi.fn(),
  },
}));

vi.mock('@/lib/api/users', () => ({
  usersApi: {
    getAll: vi.fn(),
  },
}));

vi.mock('./useWorkspaceStore', () => ({
  useWorkspaceStore: {
    getState: () => ({
      currentWorkspace: null,
    }),
  },
}));

import { entitiesApi } from '@/lib/api/entities';
import { usersApi } from '@/lib/api/users';

describe('useEntityStore', () => {
  beforeEach(() => {
    useEntityStore.setState({
      entities: [],
      loading: false,
      error: null,
      selectedEntity: null,
      comments: [],
      users: [],
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('должен иметь правильное начальное состояние', () => {
      const state = useEntityStore.getState();

      expect(state.entities).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.selectedEntity).toBeNull();
      expect(state.comments).toEqual([]);
      expect(state.users).toEqual([]);
    });
  });

  describe('fetchEntities', () => {
    it('должен загрузить сущности', async () => {
      const mockEntities = [
        { id: '1', title: 'Task 1', status: 'new' },
        { id: '2', title: 'Task 2', status: 'in_progress' },
      ];

      vi.mocked(entitiesApi.getByWorkspace).mockResolvedValue(mockEntities as any);

      await useEntityStore.getState().fetchEntities('ws-1');

      const state = useEntityStore.getState();
      expect(state.entities).toEqual(mockEntities);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('должен установить ошибку при неудачной загрузке', async () => {
      vi.mocked(entitiesApi.getByWorkspace).mockRejectedValue(new Error('Network error'));

      await useEntityStore.getState().fetchEntities('ws-1');

      const state = useEntityStore.getState();
      expect(state.entities).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.error).toBe('Network error');
    });
  });

  describe('fetchUsers', () => {
    it('должен загрузить пользователей', async () => {
      const mockUsers = [
        { id: '1', email: 'user1@test.com', firstName: 'User', lastName: 'One' },
        { id: '2', email: 'user2@test.com', firstName: 'User', lastName: 'Two' },
      ];

      vi.mocked(usersApi.getAll).mockResolvedValue(mockUsers as any);

      await useEntityStore.getState().fetchUsers();

      expect(useEntityStore.getState().users).toEqual(mockUsers);
    });
  });

  describe('setEntities', () => {
    it('должен установить сущности', () => {
      const entities = [{ id: '1', title: 'Test' }] as any;

      useEntityStore.getState().setEntities(entities);

      expect(useEntityStore.getState().entities).toEqual(entities);
    });
  });

  describe('updateStatus', () => {
    it('должен оптимистично обновить статус', async () => {
      const entity = { id: '1', title: 'Task', status: 'new' };
      useEntityStore.setState({ entities: [entity] as any });

      vi.mocked(entitiesApi.updateStatus).mockResolvedValue({} as any);

      await useEntityStore.getState().updateStatus('1', 'in_progress');

      const updated = useEntityStore.getState().entities.find((e) => e.id === '1');
      expect(updated?.status).toBe('in_progress');
    });

    it('должен откатить при ошибке', async () => {
      const entity = { id: '1', title: 'Task', status: 'new' };
      useEntityStore.setState({ entities: [entity] as any });

      vi.mocked(entitiesApi.updateStatus).mockRejectedValue(new Error('Failed'));

      await useEntityStore.getState().updateStatus('1', 'in_progress');

      const updated = useEntityStore.getState().entities.find((e) => e.id === '1');
      expect(updated?.status).toBe('new');
    });
  });

  describe('selectEntity / deselectEntity', () => {
    it('должен выбрать сущность', async () => {
      const entity = { id: '1', title: 'Task', status: 'new', comments: [] };
      useEntityStore.setState({ entities: [entity] as any });

      vi.mocked(entitiesApi.getById).mockResolvedValue(entity as any);

      await useEntityStore.getState().selectEntity('1');

      expect(useEntityStore.getState().selectedEntity).toEqual(entity);
    });

    it('должен сбросить выбранную сущность', () => {
      useEntityStore.setState({
        selectedEntity: { id: '1' } as any,
        comments: [{ id: 'c1' }] as any,
      });

      useEntityStore.getState().deselectEntity();

      expect(useEntityStore.getState().selectedEntity).toBeNull();
      expect(useEntityStore.getState().comments).toEqual([]);
    });
  });
});
