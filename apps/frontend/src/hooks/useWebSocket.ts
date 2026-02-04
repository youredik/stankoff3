import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useEntityStore } from '@/store/useEntityStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useAuthStore } from '@/store/useAuthStore';

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
      const exists = state.entities.find((e) => e.id === entity.id);
      if (!exists) {
        useEntityStore.setState({
          entities: [entity, ...state.entities],
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
      useEntityStore.setState({
        entities: state.entities.map((e) =>
          e.id === entity.id ? { ...e, ...entity } : e,
        ),
      });
      if (state.selectedEntity?.id === entity.id) {
        useEntityStore.setState({
          selectedEntity: { ...state.selectedEntity, ...entity },
        });
      }
    });

    socket.on('status:changed', (data: { id: string; status: string; entity?: any }) => {
      const state = useEntityStore.getState();
      useEntityStore.setState({
        entities: state.entities.map((e) =>
          e.id === data.id ? { ...e, status: data.status } : e,
        ),
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

      useEntityStore.setState({
        entities: state.entities.map((e) =>
          e.id === data.entityId ? { ...e, assigneeId: data.assigneeId ?? undefined, assignee: entity?.assignee } : e,
        ),
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

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // Пустые зависимости — создаём socket только один раз

  // Обновляем auth при изменении токена (без пересоздания socket)
  useEffect(() => {
    if (socketRef.current && accessToken) {
      socketRef.current.auth = { token: accessToken };
      // Переподключаемся только если соединение было разорвано
      if (!socketRef.current.connected) {
        socketRef.current.connect();
      }
    }
  }, [accessToken]);
}
