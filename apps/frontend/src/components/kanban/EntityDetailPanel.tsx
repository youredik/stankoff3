'use client';

import { useMemo, useEffect } from 'react';
import { X, MessageSquare, Clock, FileText, Image, Download } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEntityStore } from '@/store/useEntityStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { CommentEditor } from '@/components/entity/CommentEditor';
import { LinkedEntities } from '@/components/entity/LinkedEntities';
import type { FieldOption, Attachment } from '@/types';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

// Default statuses for backwards compatibility
const DEFAULT_STATUSES: FieldOption[] = [
  { id: 'new', label: 'Новая', color: '#3B82F6' },
  { id: 'in-progress', label: 'В работе', color: '#F59E0B' },
  { id: 'testing', label: 'Тестирование', color: '#8B5CF6' },
  { id: 'done', label: 'Готово', color: '#10B981' },
];

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-green-100 text-green-800 border-green-200',
};

const PRIORITY_LABELS: Record<string, string> = {
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий',
};

export function EntityDetailPanel() {
  const {
    selectedEntity,
    comments,
    users,
    deselectEntity,
    updateStatus,
    updateAssignee,
    updateLinkedEntities,
    addComment,
  } = useEntityStore();

  const { currentWorkspace } = useWorkspaceStore();

  // Get status options from workspace
  const statuses = useMemo(() => {
    if (!currentWorkspace?.sections) return DEFAULT_STATUSES;

    for (const section of currentWorkspace.sections) {
      const statusField = section.fields.find((f) => f.type === 'status');
      if (statusField?.options && statusField.options.length > 0) {
        return statusField.options;
      }
    }

    return DEFAULT_STATUSES;
  }, [currentWorkspace]);

  // Handle Escape key to close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedEntity) {
        deselectEntity();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedEntity, deselectEntity]);

  if (!selectedEntity) return null;

  const handleSubmitComment = async (html: string, attachments?: Attachment[]) => {
    await addComment(selectedEntity.id, html, attachments);
  };

  const handleUpdateLinkedEntities = (linkedEntityIds: string[]) => {
    updateLinkedEntities(selectedEntity.id, linkedEntityIds);
  };

  const priorityColor =
    PRIORITY_COLORS[selectedEntity.priority ?? ''] ||
    'bg-gray-100 text-gray-800 border-gray-200';
  const priorityLabel =
    PRIORITY_LABELS[selectedEntity.priority ?? ''] || 'Обычный';

  const currentStatus = statuses.find((s) => s.id === selectedEntity.status);

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={deselectEntity}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col pointer-events-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-1 rounded">
                {selectedEntity.customId}
              </span>
              <span
                className={`text-xs font-medium px-2 py-1 rounded border ${priorityColor}`}
              >
                {priorityLabel}
              </span>
              {currentStatus && (
                <span
                  className="text-xs font-medium px-2 py-1 rounded text-white"
                  style={{ backgroundColor: currentStatus.color }}
                >
                  {currentStatus.label}
                </span>
              )}
            </div>
            <button
              onClick={deselectEntity}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Body — two columns */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left: title + comments */}
            <div className="flex-1 flex flex-col overflow-y-auto">
              <div className="p-6 pb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  {selectedEntity.title}
                </h2>

                {/* Description from data */}
                {selectedEntity.data?.description && (
                  <p className="mt-2 text-gray-600">
                    {selectedEntity.data.description}
                  </p>
                )}
              </div>

              {/* Comments */}
              <div className="px-6 pb-4 flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="w-4 h-4 text-gray-500" />
                  <p className="text-sm font-medium text-gray-700">
                    Комментарии
                  </p>
                  <span className="text-xs text-gray-400">
                    ({comments.length})
                  </span>
                </div>

                {comments.length === 0 && (
                  <p className="text-xs text-gray-400 italic">
                    Пока нет комментариев
                  </p>
                )}

                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                      <div className="w-7 h-7 bg-primary-500 rounded-full flex-shrink-0 flex items-center justify-center">
                        <span className="text-white text-xs font-medium">
                          {comment.author.firstName[0]}
                          {comment.author.lastName[0]}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-700">
                            {comment.author.firstName}{' '}
                            {comment.author.lastName}
                          </span>
                          <span className="text-xs text-gray-400">
                            {format(
                              new Date(comment.createdAt),
                              'dd.MM HH:mm',
                              { locale: ru }
                            )}
                          </span>
                        </div>
                        <div
                          className="text-sm text-gray-600 mt-0.5 [&_p]:mb-1 [&_strong]:font-semibold [&_em]:italic [&_a]:text-primary-600 [&_a]:underline [&_.mention]:text-primary-600 [&_.mention]:bg-primary-50 [&_.mention]:rounded [&_.mention]:px-0.5"
                          dangerouslySetInnerHTML={{ __html: comment.content }}
                        />
                        {/* Attachments */}
                        {comment.attachments && comment.attachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {comment.attachments.map((attachment) => (
                              <a
                                key={attachment.id}
                                href={attachment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 rounded px-2 py-1 transition-colors group"
                              >
                                {isImageMimeType(attachment.mimeType) ? (
                                  <Image className="w-3.5 h-3.5 text-gray-500" />
                                ) : (
                                  <FileText className="w-3.5 h-3.5 text-gray-500" />
                                )}
                                <span className="text-xs text-gray-700 max-w-[120px] truncate">
                                  {attachment.name}
                                </span>
                                <span className="text-xs text-gray-400">
                                  {formatFileSize(attachment.size)}
                                </span>
                                <Download className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Comment editor — pinned to bottom of left column */}
              <div className="border-t p-4">
                <CommentEditor users={users} onSubmit={handleSubmitComment} />
              </div>
            </div>

            {/* Right sidebar: status, assignee, links, meta */}
            <div className="w-56 border-l bg-gray-50 p-4 space-y-5 overflow-y-auto">
              {/* Status */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">
                  Статус
                </p>
                <div className="flex flex-col gap-1">
                  {statuses.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => updateStatus(selectedEntity.id, s.id)}
                      className={`text-left px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-2 ${
                        selectedEntity.status === s.id
                          ? 'text-white'
                          : 'text-gray-600 hover:bg-gray-200'
                      }`}
                      style={
                        selectedEntity.status === s.id
                          ? { backgroundColor: s.color }
                          : undefined
                      }
                    >
                      {selectedEntity.status !== s.id && s.color && (
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                      )}
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assignee */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">
                  Исполнитель
                </p>
                <select
                  value={selectedEntity.assigneeId || ''}
                  onChange={(e) =>
                    updateAssignee(selectedEntity.id, e.target.value || null)
                  }
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Не назначен</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Linked Entities */}
              <LinkedEntities
                entityId={selectedEntity.id}
                linkedEntityIds={selectedEntity.linkedEntityIds || []}
                onUpdate={handleUpdateLinkedEntities}
              />

              {/* Meta */}
              <div className="pt-3 border-t border-gray-200">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    Создано{' '}
                    {format(new Date(selectedEntity.createdAt), 'dd.MM.yyyy', {
                      locale: ru,
                    })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
