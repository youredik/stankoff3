'use client';

import { useState, useMemo, useEffect } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { useEntityStore } from '@/store/useEntityStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import SearchableUserSelect from '@/components/ui/SearchableUserSelect';
import { fieldRegistry } from '@/components/fields';
import { evaluateVisibility, evaluateRequired, evaluateComputed } from '@/lib/field-rules';
import { useBeforeUnload } from '@/hooks/useBeforeUnload';
import type { Field, Section } from '@/types';

const PRIORITIES = [
  { value: 'high' as const, label: 'Высокий', cls: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800' },
  { value: 'medium' as const, label: 'Средний', cls: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800' },
  { value: 'low' as const, label: 'Низкий', cls: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800' },
];

// Системные поля, которые обрабатываются отдельно
const SYSTEM_FIELD_TYPES = ['status'];
const SYSTEM_FIELD_IDS = ['title', 'assignee', 'priority'];

// Компонент для отображения поля ввода — dispatch через field registry
function FormField({
  field,
  value,
  users,
  onChange,
  allData,
}: {
  field: Field;
  value: any;
  users: any[];
  onChange: (value: any) => void;
  allData?: Record<string, any>;
}) {
  const renderer = fieldRegistry[field.type];
  if (!renderer) return null;
  const Comp = renderer.Form;
  return <Comp field={field} value={value} users={users} onChange={onChange} allData={allData} />;
}

// Секция с полями
function FormSection({
  section,
  formData,
  users,
  onChange,
}: {
  section: Section;
  formData: Record<string, any>;
  users: any[];
  onChange: (fieldId: string, value: any) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const allSectionFields = section.fields;

  // Фильтруем системные поля и применяем правила видимости
  const customFields = allSectionFields.filter(
    (f) => !SYSTEM_FIELD_TYPES.includes(f.type) && !SYSTEM_FIELD_IDS.includes(f.id)
  );
  const visibleFields = customFields.filter((f) =>
    evaluateVisibility(f, allSectionFields, formData)
  );

  if (visibleFields.length === 0) return null;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        )}
        <span className="font-medium text-gray-700 dark:text-gray-200 text-sm">{section.name}</span>
      </button>
      {isExpanded && (
        <div className="p-4 space-y-3 bg-white dark:bg-gray-800">
          {visibleFields.map((field) => {
            const isRequired = evaluateRequired(field, allSectionFields, formData);
            const computed = evaluateComputed(field, allSectionFields, formData);
            return (
              <div key={field.id}>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                  {field.name}
                  {isRequired && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                {computed ? (
                  <div className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 rounded-lg font-medium">
                    {computed.value !== null ? String(computed.value) : '—'}
                  </div>
                ) : (
                  <FormField
                    field={field}
                    value={formData[field.id]}
                    users={users}
                    onChange={(value) => onChange(field.id, value)}
                    allData={formData}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface CreateEntityModalProps {
  workspaceId: string;
  onClose: () => void;
}

export function CreateEntityModal({ workspaceId, onClose }: CreateEntityModalProps) {
  const { users, createEntity } = useEntityStore();
  const { currentWorkspace } = useWorkspaceStore();

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const isDirty = !!title || !!assigneeId || Object.keys(formData).length > 0;
  useBeforeUnload(isDirty);

  // Close on Escape (a11y requirement for modal dialogs)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const titleError = (titleTouched || submitAttempted) && !title.trim() ? 'Название обязательно' : null;

  // Проверяем, есть ли кастомные поля
  const hasCustomFields = useMemo(() => {
    if (!currentWorkspace?.sections) return false;
    return currentWorkspace.sections.some((section) =>
      section.fields.some(
        (f) => !SYSTEM_FIELD_TYPES.includes(f.type) && !SYSTEM_FIELD_IDS.includes(f.id)
      )
    );
  }, [currentWorkspace]);

  // Проверяем обязательные поля (с учётом правил видимости и required_if)
  const requiredFieldsMissing = useMemo(() => {
    if (!currentWorkspace?.sections) return false;
    for (const section of currentWorkspace.sections) {
      const sectionFields = section.fields;
      for (const field of sectionFields) {
        if (SYSTEM_FIELD_TYPES.includes(field.type) || SYSTEM_FIELD_IDS.includes(field.id)) continue;
        // Невидимые поля не проверяем
        if (!evaluateVisibility(field, sectionFields, formData)) continue;
        // Проверяем динамическую обязательность
        const isRequired = evaluateRequired(field, sectionFields, formData);
        if (isRequired) {
          const value = formData[field.id];
          if (value === undefined || value === null || value === '') {
            return true;
          }
        }
      }
    }
    return false;
  }, [currentWorkspace, formData]);

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    if (!title.trim() || submitting || requiredFieldsMissing) return;
    setSubmitting(true);
    await createEntity({
      workspaceId,
      title: title.trim(),
      priority,
      assigneeId: assigneeId || undefined,
      data: formData,
    });
    setSubmitting(false);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-entity-title"
          data-testid="create-entity-modal"
          className={`bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-[90vw] max-h-[85vh] flex flex-col ${
            hasCustomFields ? 'w-[600px]' : 'w-[440px]'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b dark:border-gray-700 flex-shrink-0">
            <h3 id="create-entity-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Новая заявка
            </h3>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer">
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Form - scrollable */}
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {/* Title */}
            <div>
              <label htmlFor="entity-title" className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                Название <span className="text-red-500">*</span>
              </label>
              <input
                id="entity-title"
                name="title"
                type="text"
                data-testid="create-entity-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setTitleTouched(true)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
                placeholder="Описание проблемы или задачи"
                className={`w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  titleError
                    ? 'border-red-400 dark:border-red-600'
                    : 'border-gray-200 dark:border-gray-600'
                }`}
                autoFocus
              />
              {titleError && (
                <p className="mt-1 text-xs text-red-500">{titleError}</p>
              )}
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                Приоритет
              </label>
              <div className="flex gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                      priority === p.value
                        ? p.cls + ' ring-2 ring-offset-1 ring-primary-500 dark:ring-offset-gray-900'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Assignee */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                Исполнитель
              </label>
              <SearchableUserSelect
                value={assigneeId || null}
                onChange={(userId) => setAssigneeId(userId || '')}
                users={users}
                placeholder="Не назначить"
                emptyLabel="Не назначить"
              />
            </div>

            {/* Custom Fields by Sections */}
            {currentWorkspace?.sections && currentWorkspace.sections.length > 0 && (
              <div className="space-y-3 pt-2">
                {currentWorkspace.sections
                  .sort((a, b) => a.order - b.order)
                  .map((section) => (
                    <FormSection
                      key={section.id}
                      section={section}
                      formData={formData}
                      users={users}
                      onChange={handleFieldChange}
                    />
                  ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 p-5 border-t dark:border-gray-700 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              onClick={handleSubmit}
              disabled={!title.trim() || submitting || requiredFieldsMissing}
              data-testid="create-entity-submit"
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Создаём…' : 'Создать заявку'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
