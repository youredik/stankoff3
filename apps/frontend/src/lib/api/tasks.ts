import { apiClient } from './client';
import type {
  UserTask,
  UserTaskFilter,
  UserTaskComment,
} from '@/types';

export const tasksApi = {
  // Inbox - получить задачи для текущего пользователя
  getInbox: (workspaceId?: string) =>
    apiClient
      .get<UserTask[]>('/bpmn/tasks/inbox', {
        params: workspaceId ? { workspaceId } : undefined,
      })
      .then((r) => r.data),

  // Получить задачи с фильтрами
  getTasks: (filters: UserTaskFilter) =>
    apiClient
      .get<UserTask[]>('/bpmn/tasks', { params: filters })
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

  // Комментарии к задаче
  getComments: (taskId: string) =>
    apiClient
      .get<UserTaskComment[]>(`/bpmn/tasks/${taskId}/comments`)
      .then((r) => r.data),

  addComment: (taskId: string, content: string) =>
    apiClient
      .post<UserTaskComment>(`/bpmn/tasks/${taskId}/comments`, { content })
      .then((r) => r.data),
};
