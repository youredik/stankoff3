import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useEntityStore } from '@/store/useEntityStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useSlaStore, SlaUpdate } from '@/store/useSlaStore';
import { usePresenceStore } from '@/store/usePresenceStore';
import { useTaskStore } from '@/store/useTaskStore';

// Стандартные статусы для fallback
const DEFAULT_STATUS_LABELS: Record<string, string> = {
  new: 'Новая',
  'in-progress': 'В работе',
  testing: 'Тестирование',
  done: 'Готово',
};

// Хелпер для получения label статуса по его ID
function getStatusLabel(statusId: string): string {
  const workspace = useWorkspaceStore.getState().currentWorkspace;

  // Сначала ищем в workspace
  if (workspace?.sections) {
    for (const section of workspace.sections) {
      const statusField = section.fields.find((f) => f.type === 'status');
      if (statusField?.options) {
        const status = statusField.options.find((opt) => opt.id === statusId);
        if (status) return status.label;
      }
    }
  }

  // Fallback на стандартные статусы
  if (DEFAULT_STATUS_LABELS[statusId]) {
    return DEFAULT_STATUS_LABELS[statusId];
  }

  return statusId;
}

// Определяем URL для WebSocket подключения
const getWsUrl = () => {
  if (typeof window === 'undefined') {
    // SSR fallback
    return process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
  }

  // В production (nginx проксирует WebSocket) — используем текущий origin
  // В development — подключаемся напрямую к backend (Next.js rewrites не поддерживает WebSocket)
  const isDev = window.location.hostname === 'localhost' && window.location.port === '3000';
  if (isDev) {
    return 'http://localhost:3001';
  }

  return window.location.origin;
};

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const accessToken = useAuthStore((state) => state.accessToken);

  // Создаём socket один раз при монтировании
  useEffect(() => {
    const socket = io(getWsUrl(), {
      transports: ['websocket', 'polling'],
      auth: { token: useAuthStore.getState().accessToken },
    });

    socketRef.current = socket;

    socket.on('entity:created', (entity) => {
      const state = useEntityStore.getState();

      // Update kanban columns if entity belongs to current workspace
      if (state.kanbanWorkspaceId && entity.workspaceId === state.kanbanWorkspaceId) {
        const statusId = entity.status;
        const columns = { ...state.kanbanColumns };
        const col = columns[statusId];
        if (col) {
          const exists = col.items.find((e: any) => e.id === entity.id);
          if (!exists) {
            columns[statusId] = {
              ...col,
              items: [entity, ...col.items],
              total: col.total + 1,
            };
          }
        } else {
          columns[statusId] = { items: [entity], total: 1, hasMore: false, loading: false };
        }
        const entities = Object.values(columns).flatMap((c) => c.items);
        useEntityStore.setState({
          kanbanColumns: columns,
          entities,
          totalAll: state.totalAll + 1,
        });
      }

      useNotificationStore.getState().addNotification({
        text: `Новая заявка ${entity.customId}: ${entity.title}`,
        type: 'entity',
        entityId: entity.id,
        workspaceId: entity.workspaceId,
      });
    });

    socket.on('entity:updated', (entity) => {
      const state = useEntityStore.getState();

      // Update in kanban columns
      const columns = { ...state.kanbanColumns };
      for (const statusId of Object.keys(columns)) {
        const col = columns[statusId];
        const idx = col.items.findIndex((e) => e.id === entity.id);
        if (idx !== -1) {
          columns[statusId] = {
            ...col,
            items: col.items.map((e) => (e.id === entity.id ? { ...e, ...entity } : e)),
          };
          break;
        }
      }
      useEntityStore.setState({
        kanbanColumns: columns,
        entities: Object.values(columns).flatMap((c) => c.items),
      });

      if (state.selectedEntity?.id === entity.id) {
        useEntityStore.setState({
          selectedEntity: { ...state.selectedEntity, ...entity },
        });
      }
    });

    socket.on('status:changed', (data: { id: string; status: string; entity?: any }) => {
      const state = useEntityStore.getState();
      const columns = { ...state.kanbanColumns };

      // Find entity in old column and move to new column
      let movedEntity: any = null;
      for (const statusId of Object.keys(columns)) {
        const col = columns[statusId];
        const found = col.items.find((e) => e.id === data.id);
        if (found) {
          movedEntity = { ...found, status: data.status };
          columns[statusId] = {
            ...col,
            items: col.items.filter((e) => e.id !== data.id),
            total: col.total - 1,
          };
          break;
        }
      }

      if (movedEntity) {
        const newCol = columns[data.status];
        if (newCol) {
          columns[data.status] = {
            ...newCol,
            items: [movedEntity, ...newCol.items],
            total: newCol.total + 1,
          };
        } else {
          columns[data.status] = { items: [movedEntity], total: 1, hasMore: false, loading: false };
        }
      }

      useEntityStore.setState({
        kanbanColumns: columns,
        entities: Object.values(columns).flatMap((c) => c.items),
      });

      if (state.selectedEntity?.id === data.id) {
        useEntityStore.setState({
          selectedEntity: { ...state.selectedEntity, status: data.status },
        });
      }
      const statusLabel = getStatusLabel(data.status);
      useNotificationStore.getState().addNotification({
        text: `Статус заявки ${data.entity?.customId || ''} изменён на «${statusLabel}»`,
        type: 'status',
        entityId: data.id,
        workspaceId: data.entity?.workspaceId,
      });
    });

    socket.on('comment:created', (comment) => {
      const state = useEntityStore.getState();
      if (state.selectedEntity?.id === comment.entityId) {
        const exists = state.comments.find((c: any) => c.id === comment.id);
        if (!exists) {
          useEntityStore.setState({
            comments: [...state.comments, comment],
          });
        }
      }
      useNotificationStore.getState().addNotification({
        text: `Новый комментарий от ${comment.author?.firstName || 'пользователя'} ${comment.author?.lastName || ''}`,
        type: 'comment',
        entityId: comment.entityId,
      });
    });

    socket.on('user:assigned', (data: {
      entityId: string;
      entity: any;
      assigneeId: string | null;
      previousAssigneeId: string | null;
    }) => {
      const state = useEntityStore.getState();
      const entity = data.entity;

      // Update in kanban columns
      const columns = { ...state.kanbanColumns };
      for (const statusId of Object.keys(columns)) {
        const col = columns[statusId];
        const idx = col.items.findIndex((e) => e.id === data.entityId);
        if (idx !== -1) {
          columns[statusId] = {
            ...col,
            items: col.items.map((e) =>
              e.id === data.entityId
                ? { ...e, assigneeId: data.assigneeId ?? undefined, assignee: entity?.assignee }
                : e,
            ),
          };
          break;
        }
      }
      useEntityStore.setState({
        kanbanColumns: columns,
        entities: Object.values(columns).flatMap((c) => c.items),
      });

      if (state.selectedEntity?.id === data.entityId) {
        useEntityStore.setState({
          selectedEntity: { ...state.selectedEntity, assigneeId: data.assigneeId ?? undefined, assignee: entity?.assignee },
        });
      }

      if (data.assigneeId && entity?.assignee) {
        useNotificationStore.getState().addNotification({
          text: `${entity.assignee.firstName} ${entity.assignee.lastName} назначен(а) ответственным за заявку ${entity.customId}`,
          type: 'assignment',
          entityId: data.entityId,
          workspaceId: entity.workspaceId,
        });
      } else if (!data.assigneeId) {
        useNotificationStore.getState().addNotification({
          text: `Исполнитель убран с заявки ${entity?.customId || ''}`,
          type: 'assignment',
          entityId: data.entityId,
          workspaceId: entity?.workspaceId,
        });
      }
    });

    // SLA события
    socket.on('sla:warning', (data: {
      instanceId: string;
      targetId: string;
      targetType: string;
      definitionName: string;
      type: 'response' | 'resolution';
      usedPercent: number;
      remainingMinutes: number;
      workspaceId: string;
    }) => {
      const typeLabel = data.type === 'response' ? 'ответа' : 'решения';
      useNotificationStore.getState().addNotification({
        text: `⚠️ Предупреждение SLA «${data.definitionName}»: осталось ${data.remainingMinutes} мин до дедлайна ${typeLabel}`,
        type: 'sla_warning',
        entityId: data.targetId,
        workspaceId: data.workspaceId,
      });
    });

    socket.on('sla:breached', (data: {
      instanceId: string;
      targetId: string;
      targetType: string;
      definitionName: string;
      type: 'response' | 'resolution';
      workspaceId: string;
    }) => {
      const typeLabel = data.type === 'response' ? 'время ответа' : 'время решения';
      useNotificationStore.getState().addNotification({
        text: `🚨 Нарушение SLA «${data.definitionName}»: превышено ${typeLabel}`,
        type: 'sla_breach',
        entityId: data.targetId,
        workspaceId: data.workspaceId,
        urgent: true,
      });
    });

    // Presence tracking
    socket.on('presence:update', (data: { onlineUserIds: string[] }) => {
      usePresenceStore.getState().setOnlineUsers(data.onlineUserIds);
    });

    // SLA batch updates (real-time timer countdown)
    socket.on('sla:batch-update', (data: {
      workspaceId: string;
      updates: SlaUpdate[];
    }) => {
      useSlaStore.getState().setUpdates(data.workspaceId, data.updates);
    });

    // User task events — обновляем inbox count
    socket.on('task:created', () => {
      useTaskStore.getState().fetchInboxCount();
    });

    socket.on('task:updated', () => {
      useTaskStore.getState().fetchInboxCount();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // Пустые зависимости — создаём socket только один раз

  // Обновляем auth при изменении токена (без пересоздания socket)
  useEffect(() => {
    if (socketRef.current && accessToken) {
      socketRef.current.auth = { token: accessToken };
      if (socketRef.current.connected) {
        // Отправляем новый токен серверу без разрыва соединения
        socketRef.current.emit('auth:refresh', { token: accessToken });
      } else {
        socketRef.current.connect();
      }
    }
  }, [accessToken]);
}
