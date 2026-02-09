'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus, Save, ArrowLeft, Loader2, Pencil, Users, Settings2, Zap, Clock, Table2, FileText } from 'lucide-react';
import { SectionCard } from './SectionCard';
import { FieldCard } from './FieldCard';
import { FieldPalette, FIELD_TYPES } from './FieldPalette';
import { FieldEditor } from './FieldEditor';
import { WorkspaceMembers } from './WorkspaceMembers';
import { AutomationRules } from './AutomationRules';
import { SlaSettings } from '@/components/sla/SlaSettings';
import { DmnSettings } from '@/components/dmn/DmnSettings';
import { FormDefinitionsSettings } from '@/components/forms/FormDefinitionsSettings';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useSectionStore } from '@/store/useSectionStore';
import { useAuthStore } from '@/store/useAuthStore';
import { workspacesApi } from '@/lib/api/workspaces';
import type { Field, FieldType, Workspace } from '@/types';

type TabType = 'structure' | 'members' | 'automation' | 'sla' | 'dmn' | 'forms';

// Популярные эмодзи для рабочих мест
const WORKSPACE_ICONS = ['📋', '📁', '🔧', '💼', '📊', '🎯', '📝', '⚙️', '🛠️', '📦', '🚀', '💡', '🔬', '📐', '🎨', '📈'];

interface WorkspaceBuilderProps {
  workspaceId: string;
  onBack: () => void;
}

export function WorkspaceBuilder({ workspaceId, onBack }: WorkspaceBuilderProps) {
  const {
    currentWorkspace,
    workspaces,
    loading,
    fetchWorkspace,
    fetchWorkspaces,
    setCurrentWorkspace,
    addSection,
    addField,
    updateField,
    moveField,
    saveWorkspace,
  } = useWorkspaceStore();

  const { sections, fetchSections } = useSectionStore();

  const [editingField, setEditingField] = useState<{
    field: Field;
    sectionId: string;
  } | null>(null);
  const [activeItem, setActiveItem] = useState<{
    type: 'field' | 'new-field';
    field?: Field;
    sectionId?: string;
    fieldType?: FieldType;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('structure');
  const [isInitialized, setIsInitialized] = useState(false);

  const { user } = useAuthStore();
  const isGlobalAdmin = user?.role === 'admin';

  // Редактирование названия и иконки
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsInitialized(false);
    fetchWorkspace(workspaceId).finally(() => setIsInitialized(true));
    fetchWorkspaces();
    fetchSections();
  }, [workspaceId, fetchWorkspace, fetchWorkspaces, fetchSections]);

  useEffect(() => {
    setHasChanges(true);
  }, [currentWorkspace?.sections]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current;

    if (data?.type === 'new-field') {
      setActiveItem({
        type: 'new-field',
        fieldType: data.fieldType,
      });
    } else if (data?.type === 'field') {
      setActiveItem({
        type: 'field',
        field: data.field,
        sectionId: data.sectionId,
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);

    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Handle dropping a new field from palette
    if (activeData?.type === 'new-field') {
      let targetSectionId: string | null = null;

      if (overData?.type === 'section') {
        targetSectionId = overData.sectionId;
      } else if (overData?.type === 'field') {
        targetSectionId = overData.sectionId;
      }

      if (targetSectionId) {
        const fieldType = activeData.fieldType as FieldType;
        const typeConfig = FIELD_TYPES.find((t) => t.type === fieldType);

        const newField: Field = {
          id: `field-${Date.now()}`,
          name: typeConfig?.label || 'Новое поле',
          type: fieldType,
          required: false,
        };

        // Initialize defaults per field type
        if (fieldType === 'status') {
          newField.options = [
            { id: 'new', label: 'Новая', color: '#3B82F6' },
            { id: 'in-progress', label: 'В работе', color: '#F59E0B' },
            { id: 'done', label: 'Готово', color: '#10B981' },
          ];
        } else if (fieldType === 'select') {
          newField.options = [
            { id: 'opt-1', label: 'Вариант 1', color: '#3B82F6' },
            { id: 'opt-2', label: 'Вариант 2', color: '#10B981' },
          ];
        } else if (fieldType === 'checkbox') {
          newField.defaultValue = false;
        }

        addField(targetSectionId, newField);
        setEditingField({ field: newField, sectionId: targetSectionId });
      }
      return;
    }

    // Handle reordering existing fields
    if (activeData?.type === 'field' && overData) {
      const fromSectionId = activeData.sectionId;
      const fromFieldId = activeData.field.id;

      let toSectionId: string;
      let toIndex: number;

      if (overData.type === 'section') {
        toSectionId = overData.sectionId;
        const section = currentWorkspace?.sections.find(
          (s) => s.id === toSectionId
        );
        toIndex = section?.fields.length || 0;
      } else if (overData.type === 'field') {
        toSectionId = overData.sectionId;
        const section = currentWorkspace?.sections.find(
          (s) => s.id === toSectionId
        );
        toIndex = section?.fields.findIndex((f) => f.id === overData.field.id) || 0;
      } else {
        return;
      }

      const fromSection = currentWorkspace?.sections.find(
        (s) => s.id === fromSectionId
      );
      const fromIndex = fromSection?.fields.findIndex((f) => f.id === fromFieldId) || 0;

      if (fromSectionId !== toSectionId || fromIndex !== toIndex) {
        moveField(fromSectionId, toSectionId, fromIndex, toIndex);
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    await saveWorkspace();
    setSaving(false);
    setHasChanges(false);
  };

  const handleAddSection = () => {
    addSection(`Секция ${(currentWorkspace?.sections.length || 0) + 1}`);
  };

  // Начало редактирования названия
  const startEditingName = () => {
    if (currentWorkspace) {
      setEditedName(currentWorkspace.name);
      setIsEditingName(true);
      setTimeout(() => nameInputRef.current?.focus(), 0);
    }
  };

  // Сохранение названия
  const saveName = () => {
    if (currentWorkspace && editedName.trim()) {
      setCurrentWorkspace({ ...currentWorkspace, name: editedName.trim() });
      setHasChanges(true);
    }
    setIsEditingName(false);
  };

  // Обработка клавиш при редактировании названия
  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveName();
    } else if (e.key === 'Escape') {
      setIsEditingName(false);
    }
  };

  // Выбор иконки
  const selectIcon = (icon: string) => {
    if (currentWorkspace) {
      setCurrentWorkspace({ ...currentWorkspace, icon });
      setHasChanges(true);
    }
    setShowIconPicker(false);
  };

  // Изменение раздела
  const handleSectionChange = async (sectionId: string | null) => {
    if (currentWorkspace) {
      try {
        await workspacesApi.setSection(currentWorkspace.id, sectionId);
        setCurrentWorkspace({ ...currentWorkspace, sectionId });
      } catch (err) {
        console.error('Failed to update section:', err);
      }
    }
  };

  // Изменение showInMenu
  const handleShowInMenuChange = async (showInMenu: boolean) => {
    if (currentWorkspace) {
      try {
        await workspacesApi.setShowInMenu(currentWorkspace.id, showInMenu);
        setCurrentWorkspace({ ...currentWorkspace, showInMenu });
      } catch (err) {
        console.error('Failed to update showInMenu:', err);
      }
    }
  };

  if (!isInitialized || (loading && !currentWorkspace)) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  if (!currentWorkspace) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Рабочее место не найдено</p>
        <button
          onClick={onBack}
          className="mt-4 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
        >
          Вернуться назад
        </button>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full">
        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  {/* Иконка с возможностью выбора */}
                  <div className="relative">
                    <button
                      onClick={() => setShowIconPicker(!showIconPicker)}
                      className="text-2xl hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg p-1 transition-colors"
                      title="Изменить иконку"
                    >
                      {currentWorkspace.icon}
                    </button>
                    {showIconPicker && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setShowIconPicker(false)}
                        />
                        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 z-20 grid grid-cols-4 gap-1 w-48">
                          {WORKSPACE_ICONS.map((icon) => (
                            <button
                              key={icon}
                              onClick={() => selectIcon(icon)}
                              className={`text-xl p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors ${
                                currentWorkspace.icon === icon ? 'bg-primary-50 dark:bg-primary-900/40' : ''
                              }`}
                            >
                              {icon}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Название с редактированием */}
                  {isEditingName ? (
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onBlur={saveName}
                      onKeyDown={handleNameKeyDown}
                      className="text-xl font-bold text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-primary-300 dark:border-primary-600 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  ) : (
                    <button
                      onClick={startEditingName}
                      className="flex items-center gap-2 group"
                      title="Редактировать название"
                    >
                      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                        {currentWorkspace.name}
                      </h1>
                      <Pencil className="w-4 h-4 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 ml-10">
                  Настройка полей и структуры
                </p>
              </div>
            </div>

            {activeTab === 'structure' && (
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>Сохранить</span>
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-6">
            <button
              onClick={() => setActiveTab('structure')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'structure'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <Settings2 className="w-4 h-4" />
              <span>Структура</span>
            </button>
            {isGlobalAdmin && (
              <button
                onClick={() => setActiveTab('members')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'members'
                    ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Участники</span>
              </button>
            )}
            {isGlobalAdmin && (
              <button
                onClick={() => setActiveTab('automation')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'automation'
                    ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <Zap className="w-4 h-4" />
                <span>Автоматизация</span>
              </button>
            )}
            {isGlobalAdmin && (
              <button
                onClick={() => setActiveTab('sla')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'sla'
                    ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>SLA</span>
              </button>
            )}
            {isGlobalAdmin && (
              <button
                onClick={() => setActiveTab('dmn')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'dmn'
                    ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <Table2 className="w-4 h-4" />
                <span>Таблицы решений</span>
              </button>
            )}
            {isGlobalAdmin && (
              <button
                onClick={() => setActiveTab('forms')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'forms'
                    ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Формы</span>
              </button>
            )}
          </div>

          {/* Settings Bar - Section & Menu Visibility */}
          {isGlobalAdmin && activeTab === 'structure' && (
            <div className="px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center gap-6">
              {/* Выбор раздела */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">Раздел:</label>
                <select
                  value={currentWorkspace.sectionId || ''}
                  onChange={(e) => handleSectionChange(e.target.value || null)}
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Без раздела</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.icon} {section.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Показывать в меню */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentWorkspace.showInMenu !== false}
                  onChange={(e) => handleShowInMenuChange(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Показывать в боковом меню
                </span>
              </label>
            </div>
          )}

          {/* Content */}
          {activeTab === 'structure' ? (
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950">
              <div className="max-w-3xl mx-auto space-y-4">
                {currentWorkspace.sections.map((section) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    onEditField={(field) =>
                      setEditingField({ field, sectionId: section.id })
                    }
                  />
                ))}

                <button
                  onClick={handleAddSection}
                  className="flex items-center justify-center gap-2 w-full p-4 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 rounded-xl transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  <span className="font-medium">Добавить секцию</span>
                </button>
              </div>
            </div>
          ) : activeTab === 'members' ? (
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950">
              <WorkspaceMembers workspaceId={workspaceId} />
            </div>
          ) : activeTab === 'automation' ? (
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950">
              <AutomationRules workspaceId={workspaceId} />
            </div>
          ) : activeTab === 'sla' ? (
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950">
              <SlaSettings workspaceId={workspaceId} />
            </div>
          ) : activeTab === 'dmn' ? (
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950">
              <DmnSettings workspaceId={workspaceId} />
            </div>
          ) : activeTab === 'forms' ? (
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950">
              <FormDefinitionsSettings workspaceId={workspaceId} />
            </div>
          ) : null}
        </div>

        {/* Field Palette - only show on structure tab */}
        {activeTab === 'structure' && <FieldPalette />}

        {/* Drag Overlay */}
        <DragOverlay>
          {activeItem?.type === 'new-field' && activeItem.fieldType && (
            <div className="p-3 bg-white dark:bg-gray-800 border border-primary-300 dark:border-primary-600 rounded-lg shadow-lg opacity-90">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {FIELD_TYPES.find((t) => t.type === activeItem.fieldType)?.label}
              </span>
            </div>
          )}
          {activeItem?.type === 'field' && activeItem.field && activeItem.sectionId && (
            <div className="opacity-90">
              <FieldCard
                field={activeItem.field}
                sectionId={activeItem.sectionId}
                onEdit={() => {}}
                onRemove={() => {}}
              />
            </div>
          )}
        </DragOverlay>
      </div>

      {/* Field Editor Modal */}
      {editingField && (
        <FieldEditor
          field={editingField.field}
          sectionId={editingField.sectionId}
          workspaces={workspaces.filter((w) => w.id !== currentWorkspace.id)}
          allFields={currentWorkspace.sections.flatMap((s) => s.fields)}
          onSave={updateField}
          onClose={() => setEditingField(null)}
        />
      )}
    </DndContext>
  );
}
