'use client';

import { useMemo, useEffect, useState } from 'react';
import { X, MessageSquare, Clock, Image as ImageIcon, FileText, Paperclip } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEntityStore } from '@/store/useEntityStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useAuthStore } from '@/store/useAuthStore';
import { CommentEditor } from '@/components/entity/CommentEditor';
import { LinkedEntities } from '@/components/entity/LinkedEntities';
import { AttachmentPreview } from '@/components/ui/AttachmentPreview';
import { MediaLightbox } from '@/components/ui/MediaLightbox';
import type { FieldOption, UploadedAttachment } from '@/types';

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

  const { currentWorkspace, canEdit } = useWorkspaceStore();
  const { user } = useAuthStore();

  // Проверка прав workspace
  const canEditEntity = canEdit();
  // Назначение исполнителей: admin, manager или workspace admin/editor
  const canAssign = user?.role === 'admin' || user?.role === 'manager' || canEditEntity;

  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

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

  // Собираем все вложения из всех комментариев
  const allEntityAttachments = useMemo(() => {
    return comments.flatMap((c) => c.attachments || []);
  }, [comments]);

  const imageAttachments = useMemo(() => {
    return allEntityAttachments.filter((a) => a.mimeType.startsWith('image/'));
  }, [allEntityAttachments]);

  const otherAttachments = useMemo(() => {
    return allEntityAttachments.filter((a) => !a.mimeType.startsWith('image/'));
  }, [allEntityAttachments]);

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

  const handleSubmitComment = async (html: string, attachments?: UploadedAttachment[]) => {
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
        data-testid="detail-panel-overlay"
        className="fixed inset-0 bg-black/30 z-40"
        onClick={deselectEntity}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col pointer-events-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-5 border-b">
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
              className="p-1 hover:bg-gray-100 rounded cursor-pointer"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Body — two columns */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left: title + comments */}
            <div className="flex-1 flex flex-col overflow-y-auto">
              <div className="px-8 py-6">
                <h2 className="text-2xl font-semibold text-gray-900">
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
              <div className="px-8 pb-6 flex-1">
                <div className="flex items-center gap-2 mb-4">
                  <MessageSquare className="w-5 h-5 text-gray-500" />
                  <p className="text-base font-medium text-gray-700">
                    Комментарии
                  </p>
                  <span className="text-sm text-gray-400">
                    ({comments.length})
                  </span>
                </div>

                {comments.length === 0 && (
                  <p className="text-xs text-gray-400 italic">
                    Пока нет комментариев
                  </p>
                )}

                <div className="space-y-5">
                  {comments.map((comment) => (
                    <div key={comment.id} className="flex gap-4">
                      <div className="w-9 h-9 bg-primary-600 rounded-full flex-shrink-0 flex items-center justify-center">
                        <span className="text-white text-sm font-medium">
                          {comment.author.firstName[0]}
                          {comment.author.lastName[0]}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800">
                            {comment.author.firstName}{' '}
                            {comment.author.lastName}
                          </span>
                          <span className="text-sm text-gray-400">
                            {format(
                              new Date(comment.createdAt),
                              'dd.MM HH:mm',
                              { locale: ru }
                            )}
                          </span>
                        </div>
                        <div
                          className="text-gray-600 mt-1 [&_p]:mb-2 [&_strong]:font-semibold [&_em]:italic [&_a]:text-primary-600 [&_a]:underline [&_.mention]:text-primary-600 [&_.mention]:bg-primary-50 [&_.mention]:rounded [&_.mention]:px-0.5"
                          dangerouslySetInnerHTML={{ __html: comment.content }}
                        />
                        {/* Attachments */}
                        {comment.attachments && comment.attachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {comment.attachments.map((attachment) => (
                              <AttachmentPreview
                                key={attachment.id}
                                attachment={attachment}
                                allAttachments={allEntityAttachments}
                                showThumbnail={true}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Comment editor — pinned to bottom of left column (hidden for viewers) */}
              {canEditEntity && (
                <div className="border-t px-8 py-5">
                  <CommentEditor users={users} onSubmit={handleSubmitComment} />
                </div>
              )}
            </div>

            {/* Right sidebar: status, assignee, links, meta */}
            <div className="w-72 border-l bg-gray-50 p-6 space-y-6 overflow-y-auto">
              {/* Status */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-3">
                  Статус
                </p>
                <div className="flex flex-col gap-1.5">
                  {statuses.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => canEditEntity && updateStatus(selectedEntity.id, s.id)}
                      disabled={!canEditEntity}
                      className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                        selectedEntity.status === s.id
                          ? 'text-white'
                          : canEditEntity
                            ? 'text-gray-600 hover:bg-gray-200 cursor-pointer'
                            : 'text-gray-400 cursor-default'
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
                <p className="text-xs font-medium text-gray-500 uppercase mb-3">
                  Исполнитель
                </p>
                {canAssign ? (
                  <select
                    value={selectedEntity.assigneeId || ''}
                    onChange={(e) =>
                      updateAssignee(selectedEntity.id, e.target.value || null)
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer"
                  >
                    <option value="">Не назначен</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-gray-700">
                    {selectedEntity.assignee
                      ? `${selectedEntity.assignee.firstName} ${selectedEntity.assignee.lastName}`
                      : 'Не назначен'}
                  </p>
                )}
              </div>

              {/* Linked Entities */}
              <LinkedEntities
                entityId={selectedEntity.id}
                linkedEntityIds={selectedEntity.linkedEntityIds || []}
                onUpdate={handleUpdateLinkedEntities}
                readOnly={!canEditEntity}
              />

              {/* Файлы */}
              {allEntityAttachments.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Paperclip className="w-3.5 h-3.5 text-gray-500" />
                    <p className="text-xs font-medium text-gray-500 uppercase">
                      Файлы ({allEntityAttachments.length})
                    </p>
                  </div>

                  {/* Галерея изображений */}
                  {imageAttachments.length > 0 && (
                    <div className="grid grid-cols-3 gap-1 mb-2">
                      {imageAttachments.slice(0, 6).map((att, idx) => (
                        <button
                          key={att.id}
                          onClick={() => setGalleryIndex(idx)}
                          className="aspect-square rounded overflow-hidden bg-gray-200 hover:opacity-80 transition-opacity"
                        >
                          <img
                            src={att.thumbnailUrl || att.url}
                            alt={att.name}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                      {imageAttachments.length > 6 && (
                        <button
                          onClick={() => setGalleryIndex(6)}
                          className="aspect-square rounded bg-gray-200 flex items-center justify-center text-gray-600 text-sm font-medium hover:bg-gray-300 transition-colors"
                        >
                          +{imageAttachments.length - 6}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Другие файлы */}
                  {otherAttachments.length > 0 && (
                    <div className="space-y-1">
                      {otherAttachments.map((att) => (
                        <AttachmentPreview
                          key={att.id}
                          attachment={att}
                          allAttachments={allEntityAttachments}
                          showThumbnail={false}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

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

      {/* Галерея для просмотра изображений из сайдбара */}
      {galleryIndex !== null && imageAttachments.length > 0 && (
        <MediaLightbox
          attachments={imageAttachments}
          initialIndex={galleryIndex}
          onClose={() => setGalleryIndex(null)}
        />
      )}
    </>
  );
}
