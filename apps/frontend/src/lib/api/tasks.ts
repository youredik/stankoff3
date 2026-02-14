import { apiClient } from './client';
import type {
  UserTask,
  UserTaskFilter,
  UserTaskComment,
  PaginatedResult,
} from '@/types';

export interface InboxParams {
  workspaceId?: string;
  includeCompleted?: boolean;
  page?: number;
  perPage?: number;
  sortBy?: 'createdAt' | 'priority' | 'dueDate';
  sortOrder?: 'ASC' | 'DESC';
}

export const tasksApi = {
  // Inbox - получить задачи для текущего пользователя (с пагинацией)
  getInbox: (params?: InboxParams) =>
    apiClient
      .get<PaginatedResult<UserTask>>('/bpmn/tasks/inbox', {
        params: params ? {
          workspaceId: params.workspaceId,
          includeCompleted: params.includeCompleted ? 'true' : undefined,
          page: params.page,
          perPage: params.perPage,
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
        } : undefined,
      })
      .then((r) => r.data),

  // Получить задачи с фильтрами (с пагинацией)
  getTasks: (filters: UserTaskFilter) =>
    apiClient
      .get<PaginatedResult<UserTask>>('/bpmn/tasks', { params: filters })
      .then((r) => r.data),

  // Получить одну задачу
  getTask: (id: string) =>
    apiClient.get<UserTask>(`/bpmn/tasks/${id}`).then((r) => r.data),

  // Claim - взять задачу на себя
  claim: (taskId: string) =>
    apiClient
      .post<UserTask>(`/bpmn/tasks/${taskId}/claim`)
      .then((r) => r.data),

  // Unclaim - снять с себя задачу
  unclaim: (taskId: string) =>
    apiClient
      .post<UserTask>(`/bpmn/tasks/${taskId}/unclaim`)
      .then((r) => r.data),

  // Complete - завершить задачу с формой
  complete: (taskId: string, formData: Record<string, unknown>) =>
    apiClient
      .post<UserTask>(`/bpmn/tasks/${taskId}/complete`, { formData })
      .then((r) => r.data),

  // Delegate - делегировать задачу
  delegate: (taskId: string, targetUserId: string) =>
    apiClient
      .post<UserTask>(`/bpmn/tasks/${taskId}/delegate`, { targetUserId })
      .then((r) => r.data),

  // Reassign - переназначить задачу (для админов)
  reassign: (taskId: string, assigneeId: string) =>
    apiClient
      .post<UserTask>(`/bpmn/tasks/${taskId}/reassign`, { assigneeId })
      .then((r) => r.data),

  // Batch claim — взять несколько задач
  batchClaim: (taskIds: string[]) =>
    apiClient
      .post<{ succeeded: string[]; failed: { id: string; reason: string }[] }>(
        '/bpmn/tasks/batch/claim',
        { taskIds },
      )
      .then((r) => r.data),

  // Batch delegate — делегировать несколько задач
  batchDelegate: (taskIds: string[], targetUserId: string) =>
    apiClient
      .post<{ succeeded: string[]; failed: { id: string; reason: string }[] }>(
        '/bpmn/tasks/batch/delegate',
        { taskIds, targetUserId },
      )
      .then((r) => r.data),

  // Комментарии к задаче
  getComments: (taskId: string) =>
    apiClient
      .get<UserTaskComment[]>(`/bpmn/tasks/${taskId}/comments`)
      .then((r) => r.data),

  addComment: (taskId: string, content: string, mentionedUserIds?: string[]) =>
    apiClient
      .post<UserTaskComment>(`/bpmn/tasks/${taskId}/comments`, { content, mentionedUserIds })
      .then((r) => r.data),

  // Statistics - статистика задач по workspace
  getStatistics: (workspaceId: string) =>
    apiClient
      .get<{
        total: number;
        byStatus: Record<string, number>;
        overdue: number;
        avgCompletionTimeMs: number | null;
      }>('/bpmn/tasks/statistics', { params: { workspaceId } })
      .then((r) => r.data),
};
