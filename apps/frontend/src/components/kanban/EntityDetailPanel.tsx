'use client';

import { useMemo, useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { X, MessageSquare, Clock, Paperclip, ChevronDown, ChevronRight, Upload, Link2, ExternalLink, GitBranch, Play, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEntityStore } from '@/store/useEntityStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useAuthStore } from '@/store/useAuthStore';
import { CommentEditor } from '@/components/entity/CommentEditor';
import { LinkedEntities } from '@/components/entity/LinkedEntities';
import { EntityTimeline } from '@/components/entity/timeline';
import { AiAssistantTab } from '@/components/entity/AiAssistantTab';
import { AiClassificationPanel } from '@/components/ai/AiClassificationPanel';
import { AiInsightsPanel } from '@/components/ai/AiInsightsPanel';
import { AiSummaryBanner } from '@/components/ai/AiSummaryBanner';
import { useAiStore } from '@/store/useAiStore';
import { AttachmentPreview } from '@/components/ui/AttachmentPreview';
import { MediaLightbox } from '@/components/ui/MediaLightbox';
import type { FieldOption, UploadedAttachment, Field, Section, Attachment } from '@/types';
import { fieldRegistry } from '@/components/fields';
import { evaluateVisibility, evaluateRequired, evaluateComputed } from '@/lib/field-rules';
import { filesApi } from '@/lib/api/files';
import { bpmnApi } from '@/lib/api/bpmn';
import { getAssigneeRecommendations, type AssigneeRecommendation } from '@/lib/api/recommendations';
import { StartProcessModal, ProcessInstanceList } from '@/components/bpmn';
import { SlaStatusBadge } from '@/components/sla/SlaStatusBadge';
import type { ProcessInstance } from '@/types';

// Default statuses for backwards compatibility
const DEFAULT_STATUSES: FieldOption[] = [
  { id: 'new', label: 'Новая', color: '#3B82F6' },
  { id: 'in-progress', label: 'В работе', color: '#F59E0B' },
  { id: 'testing', label: 'Тестирование', color: '#8B5CF6' },
  { id: 'done', label: 'Готово', color: '#10B981' },
];

const sentimentLabels: Record<string, string> = {
  satisfied: 'Доволен',
  neutral: 'Нейтрально',
  concerned: 'Обеспокоен',
  frustrated: 'Недоволен',
  urgent: 'Срочно',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 border-red-300 dark:border-red-800',
  medium: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400 border-yellow-300 dark:border-yellow-800',
  low: 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 border-green-300 dark:border-green-800',
};

const PRIORITY_LABELS: Record<string, string> = {
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий',
};

// Системные поля, которые не нужно отображать в кастомных полях
const SYSTEM_FIELD_TYPES = ['status'];
const SYSTEM_FIELD_IDS = ['title', 'assignee', 'priority'];

// Компонент для отображения значения поля — dispatch через field registry
function FieldValue({
  field,
  value,
  users,
  canEdit,
  onUpdate,
  allData,
}: {
  field: Field;
  value: any;
  users: any[];
  canEdit: boolean;
  onUpdate: (value: any) => void;
  allData?: Record<string, any>;
}) {
  const renderer = fieldRegistry[field.type];
  if (!renderer) return null;
  const Comp = renderer.Renderer;
  return <Comp field={field} value={value} users={users} canEdit={canEdit} onUpdate={onUpdate} allData={allData} />;
}

// Компонент секции с полями
function FieldSection({
  section,
  entity,
  users,
  canEdit,
  onUpdateField,
}: {
  section: Section;
  entity: any;
  users: any[];
  canEdit: boolean;
  onUpdateField: (fieldId: string, value: any) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  const entityData = entity.data || {};
  const allSectionFields = section.fields;

  // Фильтруем системные поля и применяем правила видимости
  const customFields = allSectionFields.filter(
    (f) => !SYSTEM_FIELD_TYPES.includes(f.type) && !SYSTEM_FIELD_IDS.includes(f.id)
  );
  const visibleFields = customFields.filter((f) =>
    evaluateVisibility(f, allSectionFields, entityData)
  );

  if (visibleFields.length === 0) return null;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden bg-white dark:bg-gray-800">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        )}
        <span className="font-medium text-gray-700 dark:text-gray-200">{section.name}</span>
        <span className="text-xs text-gray-400 dark:text-gray-500">({visibleFields.length} полей)</span>
      </button>
      {isExpanded && (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {visibleFields.map((field) => {
            const isRequired = evaluateRequired(field, allSectionFields, entityData);
            const computed = evaluateComputed(field, allSectionFields, entityData);
            return (
              <div key={field.id} className="px-4 py-3 flex items-start gap-4">
                <div className="w-1/3 flex-shrink-0">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                    {field.name}
                    {isRequired && <span className="text-red-500 ml-0.5">*</span>}
                  </span>
                  {field.description && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{field.description}</p>
                  )}
                </div>
                <div className="flex-1">
                  {computed ? (
                    <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                      {computed.value !== null ? String(computed.value) : '—'}
                    </span>
                  ) : (
                    <FieldValue
                      field={field}
                      value={entityData[field.id]}
                      users={users}
                      canEdit={canEdit}
                      onUpdate={(value) => onUpdateField(field.id, value)}
                      allData={entityData}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function EntityDetailPanel() {
  const {
    selectedEntity,
    comments,
    users,
    deselectEntity,
    updateStatus,
    updateAssignee,
    updateLinkedEntities,
    updateEntityData,
    addComment,
  } = useEntityStore();

  const { currentWorkspace, canEdit } = useWorkspaceStore();
  const { user } = useAuthStore();

  // Проверка прав workspace
  const canEditEntity = canEdit();
  // Назначение исполнителей: admin, manager или workspace admin/editor
  const canAssign = user?.role === 'admin' || user?.role === 'manager' || canEditEntity;

  // Sentiment из AI assistance cache
  const aiSentiment = useAiStore((s) =>
    selectedEntity ? s.assistanceCache.get(selectedEntity.id)?.data?.sentiment ?? null : null,
  );

  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'activity' | 'ai'>('activity');
  const [commentEditor, setCommentEditor] = useState<Editor | null>(null);
  const [showStartProcess, setShowStartProcess] = useState(false);
  const [processInstances, setProcessInstances] = useState<ProcessInstance[]>([]);
  const [loadingProcesses, setLoadingProcesses] = useState(false);
  const [assigneeRecommendations, setAssigneeRecommendations] = useState<AssigneeRecommendation[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

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

  const videoAttachments = useMemo(() => {
    return allEntityAttachments.filter((a) => a.mimeType.startsWith('video/'));
  }, [allEntityAttachments]);

  // Медиа для галереи (изображения + видео)
  const mediaAttachments = useMemo(() => {
    return [...imageAttachments, ...videoAttachments];
  }, [imageAttachments, videoAttachments]);

  const otherAttachments = useMemo(() => {
    return allEntityAttachments.filter((a) =>
      !a.mimeType.startsWith('image/') && !a.mimeType.startsWith('video/')
    );
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

  // Load process instances for this entity
  useEffect(() => {
    if (!selectedEntity?.id) {
      setProcessInstances([]);
      return;
    }

    const loadProcesses = async () => {
      setLoadingProcesses(true);
      try {
        const instances = await bpmnApi.getEntityInstances(selectedEntity.id);
        setProcessInstances(instances);
      } catch (err) {
        // Silently fail - BPMN might not be available
        console.debug('BPMN not available:', err);
        setProcessInstances([]);
      } finally {
        setLoadingProcesses(false);
      }
    };

    loadProcesses();
  }, [selectedEntity?.id]);

  // Load assignee recommendations when entity has no assignee
  useEffect(() => {
    if (!selectedEntity?.id || !currentWorkspace?.id || selectedEntity.assigneeId) {
      setAssigneeRecommendations([]);
      return;
    }

    const loadRecommendations = async () => {
      setLoadingRecommendations(true);
      try {
        const recommendations = await getAssigneeRecommendations(
          currentWorkspace.id,
          selectedEntity.title,
          selectedEntity.data?.description as string | undefined,
          3
        );
        setAssigneeRecommendations(recommendations);
      } catch (err) {
        console.debug('Failed to load recommendations:', err);
        setAssigneeRecommendations([]);
      } finally {
        setLoadingRecommendations(false);
      }
    };

    loadRecommendations();
  }, [selectedEntity?.id, selectedEntity?.assigneeId, selectedEntity?.title, currentWorkspace?.id]);

  const handleProcessStarted = async () => {
    if (!selectedEntity?.id) return;
    // Reload process instances after starting a new one
    const instances = await bpmnApi.getEntityInstances(selectedEntity.id);
    setProcessInstances(instances);
  };

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
        className="fixed inset-0 bg-black/60 z-40"
        onClick={deselectEntity}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="entity-detail-title"
          data-testid="entity-detail-panel"
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded shadow-xl w-[95vw] h-[95vh] flex flex-col pointer-events-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <span data-testid="entity-custom-id" className="text-xs font-mono bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-1 rounded">
                {selectedEntity.customId}
              </span>
              <span
                data-testid="entity-priority-section"
                className={`text-xs font-medium px-2 py-1 rounded border ${priorityColor}`}
              >
                {priorityLabel}
              </span>
              {currentStatus && (
                <span
                  className="text-xs font-medium px-2 py-1 rounded text-gray-900"
                  style={{ backgroundColor: currentStatus.color }}
                >
                  {currentStatus.label}
                </span>
              )}
            </div>
            <button
              onClick={deselectEntity}
              aria-label="Закрыть панель"
              data-testid="entity-close-button"
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Body — three columns */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left column: title, description, custom fields */}
            <div className="flex-1 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
              <div className="p-6">
                <h2 id="entity-detail-title" data-testid="entity-title" className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  {selectedEntity.title}
                  {aiSentiment && (
                    <span title={`Настроение: ${sentimentLabels[aiSentiment.label] || aiSentiment.label}`} className="text-lg cursor-default">
                      {aiSentiment.emoji}
                    </span>
                  )}
                </h2>

                {/* Description from data */}
                {selectedEntity.data?.description && (
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                    {selectedEntity.data.description}
                  </p>
                )}

                {/* Custom Fields by Sections */}
                {currentWorkspace?.sections && currentWorkspace.sections.length > 0 && (
                  <div className="mt-6 space-y-4">
                    {currentWorkspace.sections
                      .sort((a, b) => a.order - b.order)
                      .map((section) => (
                        <FieldSection
                          key={section.id}
                          section={section}
                          entity={selectedEntity}
                          users={users}
                          canEdit={canEditEntity}
                          onUpdateField={(fieldId, value) =>
                            updateEntityData(selectedEntity.id, fieldId, value)
                          }
                        />
                      ))}
                  </div>
                )}

                {/* Linked Entities */}
                <div className="mt-6">
                  <LinkedEntities
                    entityId={selectedEntity.id}
                    linkedEntityIds={selectedEntity.linkedEntityIds || []}
                    onUpdate={handleUpdateLinkedEntities}
                    readOnly={!canEditEntity}
                  />
                </div>
              </div>
            </div>

            {/* Center column: comments & history */}
            <div data-testid="entity-comments-section" className="flex-1 flex flex-col overflow-hidden min-w-0">
              {/* Tabs */}
              <div className="flex items-center gap-4 px-6 pt-4 border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setActiveTab('activity')}
                  className={`flex items-center gap-2 pb-3 border-b-2 transition-colors ${
                    activeTab === 'activity'
                      ? 'border-primary-500 text-primary-400'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-sm font-medium">Активность</span>
                  <span className="text-xs text-gray-500">({comments.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab('ai')}
                  className={`flex items-center gap-2 pb-3 border-b-2 transition-colors ${
                    activeTab === 'ai'
                      ? 'border-teal-500 text-teal-400'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="text-sm font-medium">AI помощник</span>
                </button>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* Activity Timeline */}
                {activeTab === 'activity' && (
                  <>
                    <AiSummaryBanner
                      entityId={selectedEntity.id}
                      commentCount={comments.length}
                    />
                    <EntityTimeline
                      entityId={selectedEntity.id}
                      comments={comments}
                      statusOptions={statuses}
                      allAttachments={allEntityAttachments}
                    />
                  </>
                )}

                {/* AI Assistant Tab */}
                {activeTab === 'ai' && (
                  <AiAssistantTab
                    entityId={selectedEntity.id}
                    onInsertDraft={(draft) => {
                      if (commentEditor) {
                        commentEditor.chain().focus().insertContent(draft).run();
                        setActiveTab('activity');
                      }
                    }}
                  />
                )}
              </div>

              {/* Comment editor — pinned to bottom */}
              {canEditEntity && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                  <CommentEditor
                    users={users}
                    onSubmit={handleSubmitComment}
                    entityId={selectedEntity.id}
                    onEditorReady={setCommentEditor}
                  />
                </div>
              )}
            </div>

            {/* Right sidebar: status, assignee, files, meta */}
            <div className="w-[280px] flex-shrink-0 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-y-auto">
              <div className="p-5 space-y-5">
                {/* Status */}
                <div data-testid="entity-status-section">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-2">
                    Статус
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {statuses.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => canEditEntity && updateStatus(selectedEntity.id, s.id)}
                        disabled={!canEditEntity}
                        title={!canEditEntity ? 'Недостаточно прав для изменения статуса' : undefined}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                          selectedEntity.status === s.id
                            ? 'text-white'
                            : canEditEntity
                              ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer bg-gray-100 dark:bg-gray-700'
                              : 'text-gray-500 cursor-default bg-gray-100 dark:bg-gray-700'
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
                <div data-testid="entity-assignee-section">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-2">
                    Исполнитель
                  </p>
                  {canAssign ? (
                    <select
                      value={selectedEntity.assigneeId || ''}
                      onChange={(e) =>
                        updateAssignee(selectedEntity.id, e.target.value || null)
                      }
                      className="w-full border border-gray-200 dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer"
                    >
                      <option value="">Не назначен</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.firstName} {u.lastName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p
                      className="text-sm text-gray-300"
                      title="Недостаточно прав для назначения исполнителя"
                    >
                      {selectedEntity.assignee
                        ? `${selectedEntity.assignee.firstName} ${selectedEntity.assignee.lastName}`
                        : 'Не назначен'}
                    </p>
                  )}

                  {/* ML Recommendations */}
                  {canAssign && !selectedEntity.assigneeId && (
                    <div className="mt-3">
                      {loadingRecommendations ? (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <div className="animate-spin w-3 h-3 border border-gray-400 border-t-transparent rounded-full" />
                          <span>Анализ рекомендаций...</span>
                        </div>
                      ) : assigneeRecommendations.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            <span className="inline-block w-3 h-3 bg-gradient-to-r from-teal-400 to-cyan-400 rounded-full" />
                            Рекомендации AI
                          </p>
                          {assigneeRecommendations.map((rec) => (
                            <button
                              key={rec.userId}
                              onClick={() => updateAssignee(selectedEntity.id, rec.userId)}
                              className="w-full text-left p-2 rounded bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 border border-teal-200 dark:border-teal-800 hover:border-teal-400 dark:hover:border-teal-600 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {rec.displayName}
                                </span>
                                <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300">
                                  {rec.score}%
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                {rec.reason}
                              </p>
                              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                                <span>Нагрузка: {rec.currentWorkload}</span>
                                {rec.avgResponseTimeMinutes !== null && (
                                  <span>Ответ: ~{rec.avgResponseTimeMinutes}мин</span>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Файлы */}
                {allEntityAttachments.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Paperclip className="w-3.5 h-3.5 text-gray-500" />
                      <p className="text-xs font-medium text-gray-500 uppercase">
                        Файлы ({allEntityAttachments.length})
                      </p>
                    </div>

                    {/* Галерея медиа (изображения + видео) */}
                    {mediaAttachments.length > 0 && (
                      <div className="grid grid-cols-4 gap-1 mb-2">
                        {mediaAttachments.slice(0, 8).map((att, idx) => {
                          const isVideo = att.mimeType.startsWith('video/');
                          return (
                            <button
                              key={att.id}
                              onClick={() => setGalleryIndex(idx)}
                              className="aspect-square rounded overflow-hidden bg-gray-200 dark:bg-gray-800 hover:opacity-80 transition-opacity relative"
                            >
                              {isVideo ? (
                                <>
                                  {att.thumbnailUrl ? (
                                    <img
                                      src={att.thumbnailUrl}
                                      alt={att.name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <video
                                      src={att.url}
                                      className="w-full h-full object-cover"
                                      preload="metadata"
                                      muted
                                      playsInline
                                    />
                                  )}
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                    <div className="w-6 h-6 rounded-full bg-white/90 flex items-center justify-center">
                                      <div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-[8px] border-l-gray-800 border-b-[5px] border-b-transparent ml-0.5" />
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <img
                                  src={att.thumbnailUrl || att.url}
                                  alt={att.name}
                                  className="w-full h-full object-cover"
                                />
                              )}
                            </button>
                          );
                        })}
                        {mediaAttachments.length > 8 && (
                          <button
                            onClick={() => setGalleryIndex(8)}
                            className="aspect-square rounded bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-400 text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
                          >
                            +{mediaAttachments.length - 8}
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
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
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

                {/* SLA */}
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-2">
                    SLA
                  </p>
                  <SlaStatusBadge
                    targetType="entity"
                    targetId={selectedEntity.id}
                    showDetails={true}
                  />
                </div>

                {/* AI Insights */}
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                  <AiInsightsPanel
                    entityId={selectedEntity.id}
                    onShowDetails={() => setActiveTab('ai')}
                    onAssignExpert={(expertName) => {
                      const matchedUser = users.find(
                        (u) => `${u.firstName} ${u.lastName}` === expertName,
                      );
                      if (matchedUser) {
                        updateAssignee(selectedEntity.id, matchedUser.id);
                      }
                    }}
                  />
                </div>

                {/* AI Classification */}
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                  <AiClassificationPanel
                    entityId={selectedEntity.id}
                    title={selectedEntity.title}
                    description={selectedEntity.data?.description as string | undefined}
                    workspaceId={currentWorkspace?.id}
                    readOnly={!canEditEntity}
                  />
                </div>

                {/* Processes */}
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <GitBranch className="w-3.5 h-3.5 text-gray-500" />
                      <p className="text-xs font-medium text-gray-500 uppercase">
                        Процессы
                      </p>
                    </div>
                    {canEditEntity && (
                      <button
                        onClick={() => setShowStartProcess(true)}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded transition-colors"
                      >
                        <Play className="w-3 h-3" />
                        Запустить
                      </button>
                    )}
                  </div>
                  {loadingProcesses ? (
                    <div className="flex justify-center py-2">
                      <div className="animate-spin w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full" />
                    </div>
                  ) : processInstances.length > 0 ? (
                    <ProcessInstanceList
                      instances={processInstances}
                      showEntityLink={false}
                      emptyMessage="Нет процессов"
                    />
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Нет запущенных процессов
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Start Process Modal */}
      {showStartProcess && currentWorkspace && (
        <StartProcessModal
          workspaceId={currentWorkspace.id}
          entityId={selectedEntity.id}
          entityTitle={selectedEntity.title}
          onClose={() => setShowStartProcess(false)}
          onStarted={handleProcessStarted}
        />
      )}

      {/* Галерея для просмотра медиа из сайдбара */}
      {galleryIndex !== null && mediaAttachments.length > 0 && (
        <MediaLightbox
          attachments={mediaAttachments}
          initialIndex={galleryIndex}
          onClose={() => setGalleryIndex(null)}
        />
      )}
    </>
  );
}
