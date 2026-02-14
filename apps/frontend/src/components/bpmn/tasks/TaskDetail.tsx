'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { sanitizeHtml } from '@/lib/sanitize';
import { ru } from 'date-fns/locale';
import {
  X,
  Clock,
  User,
  Users,
  AlertTriangle,
  ExternalLink,
  MessageSquare,
  History,
  FileText,
  Loader2,
  Send,
} from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import type { UserTask, UserTaskComment, User as UserType } from '@/types';
import type { FormSubmitResult, FormSchema as BpmnFormSchema } from '@bpmn-io/form-js';
import { tasksApi } from '@/lib/api/tasks';
import { TaskActions } from './TaskActions';
import { MentionDropdown } from '@/components/ui/MentionDropdown';
import { createMentionSuggestion, type MentionSuggestionState } from '@/lib/tiptap/mention-suggestion';
import { useEntityStore } from '@/store/useEntityStore';

// Dynamic import to avoid SSR issues with form-js
const FormViewer = dynamic(
  () => import('@/components/forms/FormViewer').then((mod) => mod.FormViewer),
  { ssr: false, loading: () => <div className="p-4 text-center text-gray-500">Загрузка формы...</div> }
);

interface TaskDetailProps {
  task: UserTask;
  currentUserId: string;
  users?: UserType[];
  onClose: () => void;
  onTaskUpdate: (task: UserTask) => void;
  onNavigateToEntity?: (entityId: string) => void;
}

const statusLabels: Record<string, string> = {
  created: 'Ожидает исполнителя',
  claimed: 'В работе',
  completed: 'Завершено',
  delegated: 'Делегировано',
  cancelled: 'Отменено',
};

const taskTypeLabels: Record<string, string> = {
  approval: 'Согласование',
  review: 'Проверка',
  'data-entry': 'Ввод данных',
  custom: 'Задача',
};

export function TaskDetail({
  task,
  currentUserId,
  users = [],
  onClose,
  onTaskUpdate,
  onNavigateToEntity,
}: TaskDetailProps) {
  const [activeTab, setActiveTab] = useState<'form' | 'comments' | 'history'>('form');
  const [comments, setComments] = useState<UserTaskComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [mentionState, setMentionState] = useState<MentionSuggestionState | null>(null);
  const selectedIndexRef = useRef(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { users: storeUsers } = useEntityStore();
  const mentionUsers = users.length > 0 ? users : storeUsers;

  const commentEditor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, horizontalRule: false }),
      Placeholder.configure({ placeholder: 'Написать комментарий… (@ — упоминание)' }),
      Mention.configure({
        HTMLAttributes: {
          class: 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/40 rounded px-0.5',
        },
        suggestion: createMentionSuggestion(mentionUsers, {
          onStateChange: setMentionState,
          onSelectedIndexChange: (idx) => { selectedIndexRef.current = idx; setSelectedIndex(idx); },
          getSelectedIndex: () => selectedIndexRef.current,
        }),
      }),
    ],
    editorProps: {
      attributes: {
        class: 'min-h-[40px] max-h-[120px] overflow-y-auto px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none',
      },
    },
  });

  const isOverdue = task.dueDate && isPast(new Date(task.dueDate)) && task.status !== 'completed';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (activeTab === 'comments') {
      loadComments();
    }
  }, [activeTab, task.id]);

  const loadComments = async () => {
    setIsLoadingComments(true);
    try {
      const data = await tasksApi.getComments(task.id);
      setComments(data);
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setIsLoadingComments(false);
    }
  };

  const handleSendComment = async () => {
    if (!commentEditor || commentEditor.isEmpty) return;
    const html = commentEditor.getHTML();
    const mentionRegex = /data-type="mention"[^>]*data-id="([^"]+)"/g;
    const mentionIds: string[] = [];
    let m;
    while ((m = mentionRegex.exec(html)) !== null) {
      if (!mentionIds.includes(m[1])) mentionIds.push(m[1]);
    }
    setIsSendingComment(true);
    try {
      const comment = await tasksApi.addComment(task.id, html, mentionIds.length > 0 ? mentionIds : undefined);
      setComments((prev) => [...prev, comment]);
      commentEditor.commands.clearContent();
    } catch (err) {
      console.error('Failed to send comment:', err);
    } finally {
      setIsSendingComment(false);
    }
  };

  const handleClaim = async () => {
    const updated = await tasksApi.claim(task.id);
    onTaskUpdate(updated);
  };

  const handleUnclaim = async () => {
    const updated = await tasksApi.unclaim(task.id);
    onTaskUpdate(updated);
  };

  const handleComplete = async (formData: Record<string, unknown>) => {
    const updated = await tasksApi.complete(task.id, formData);
    onTaskUpdate(updated);
  };

  const handleDelegate = async (targetUserId: string) => {
    const updated = await tasksApi.delegate(task.id, targetUserId);
    onTaskUpdate(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] bg-white dark:bg-gray-800 rounded-lg shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {task.elementName || task.elementId}
            </h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              <span>{taskTypeLabels[task.taskType] || task.taskType}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                task.status === 'completed'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : task.status === 'claimed'
                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              }`}>
                {statusLabels[task.status] || task.status}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Meta info */}
        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
          {/* Assignee */}
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-gray-400" />
            <span className="text-gray-500 dark:text-gray-400">Исполнитель:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {task.assignee
                ? `${task.assignee.firstName} ${task.assignee.lastName}`
                : 'Не назначен'}
            </span>
          </div>

          {/* Due date */}
          <div className="flex items-center gap-2 text-sm">
            <Clock className={`w-4 h-4 ${isOverdue ? 'text-red-500' : 'text-gray-400'}`} />
            <span className="text-gray-500 dark:text-gray-400">Срок:</span>
            <span className={`font-medium ${isOverdue ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
              {task.dueDate
                ? format(new Date(task.dueDate), 'd MMMM yyyy, HH:mm', { locale: ru })
                : '—'}
              {isOverdue && (
                <span className="ml-2 text-xs">
                  (просрочено {formatDistanceToNow(new Date(task.dueDate!), { locale: ru })})
                </span>
              )}
            </span>
          </div>

          {/* Candidate groups */}
          {task.candidateGroups.length > 0 && (
            <div className="flex items-center gap-2 text-sm col-span-2">
              <Users className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500 dark:text-gray-400">Группы:</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {task.candidateGroups.join(', ')}
              </span>
            </div>
          )}

          {/* Entity link */}
          {task.entity && onNavigateToEntity && (
            <div className="flex items-center gap-2 text-sm col-span-2">
              <FileText className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500 dark:text-gray-400">Заявка:</span>
              <button
                onClick={() => onNavigateToEntity(task.entityId!)}
                className="flex items-center gap-1 font-medium text-teal-600 hover:text-teal-700"
              >
                {task.entity.customId}: {task.entity.title}
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('form')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'form'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            Форма
          </button>
          <button
            onClick={() => setActiveTab('comments')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'comments'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Комментарии
            {comments.length > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 rounded">
                {comments.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <History className="w-4 h-4" />
            История
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'form' && (
            <div className="space-y-4">
              {task.formSchema ? (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <FormViewer
                    schema={task.formSchema as unknown as BpmnFormSchema}
                    data={task.processVariables}
                    onSubmit={(result: FormSubmitResult) => {
                      handleComplete(result.data as Record<string, unknown>);
                    }}
                    readOnly={task.status === 'completed' || task.assigneeId !== currentUserId}
                    disabled={task.status === 'completed'}
                    submitLabel="Завершить задачу"
                    showSubmitButton={task.status === 'claimed' && task.assigneeId === currentUserId}
                  />
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Для этой задачи форма не определена
                </div>
              )}

              {/* Process variables (for debugging) */}
              {Object.keys(task.processVariables).length > 0 && (
                <details className="group">
                  <summary className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                    Переменные процесса
                  </summary>
                  <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-x-auto">
                    {JSON.stringify(task.processVariables, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}

          {activeTab === 'comments' && (
            <div className="space-y-4">
              {isLoadingComments ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Нет комментариев
                </div>
              ) : (
                <div className="space-y-3">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm text-gray-900 dark:text-white">
                          {comment.user
                            ? `${comment.user.firstName} ${comment.user.lastName}`
                            : 'Пользователь'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(comment.createdAt), {
                            addSuffix: true,
                            locale: ru,
                          })}
                        </span>
                      </div>
                      <div
                        className="text-sm text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none [&_[data-type=mention]]:text-primary-600 [&_[data-type=mention]]:dark:text-primary-400 [&_[data-type=mention]]:bg-primary-50 [&_[data-type=mention]]:dark:bg-primary-900/40 [&_[data-type=mention]]:rounded [&_[data-type=mention]]:px-0.5 [&_[data-type=mention]]:font-medium"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(comment.content) }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* New comment input */}
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="flex gap-2 items-end">
                  <div className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500 overflow-hidden">
                    <EditorContent editor={commentEditor} />
                  </div>
                  <button
                    onClick={handleSendComment}
                    disabled={!commentEditor || commentEditor.isEmpty || isSendingComment}
                    className="px-3 py-2 text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                    aria-label="Отправить комментарий"
                  >
                    {isSendingComment ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {mentionState && (
                  <MentionDropdown
                    items={mentionState.items}
                    selectedIndex={selectedIndex}
                    clientRect={mentionState.clientRect}
                    onSelect={(u) => {
                      mentionState.command({
                        id: u.id,
                        label: `${u.firstName} ${u.lastName}`,
                      });
                    }}
                  />
                )}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              {task.history.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  История пуста
                </div>
              ) : (
                task.history.map((entry, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                  >
                    <History className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
                    <div>
                      <p className="text-sm text-gray-900 dark:text-white">
                        {entry.action}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {format(new Date(entry.timestamp), 'd MMMM yyyy, HH:mm', { locale: ru })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <TaskActions
            task={task}
            currentUserId={currentUserId}
            users={users}
            onClaim={handleClaim}
            onUnclaim={handleUnclaim}
            onComplete={handleComplete}
            onDelegate={handleDelegate}
          />
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

export default TaskDetail;
