'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';
import type { Field, FieldOption, FieldType, Workspace } from '@/types';

interface FieldEditorProps {
  field: Field;
  sectionId: string;
  workspaces: Workspace[];
  onSave: (sectionId: string, fieldId: string, data: Partial<Field>) => void;
  onClose: () => void;
}

const PRESET_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // yellow
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#6B7280', // gray
  '#06B6D4', // cyan
];

export function FieldEditor({
  field,
  sectionId,
  workspaces,
  onSave,
  onClose,
}: FieldEditorProps) {
  const [name, setName] = useState(field.name);
  const [type, setType] = useState<FieldType>(field.type);
  const [required, setRequired] = useState(field.required || false);
  const [description, setDescription] = useState(field.description || '');
  const [options, setOptions] = useState<FieldOption[]>(field.options || []);
  const [relatedWorkspaceId, setRelatedWorkspaceId] = useState(
    field.relatedWorkspaceId || ''
  );

  const isSystemField = ['title', 'status'].includes(field.id);
  const hasOptions = type === 'select' || type === 'status';

  useEffect(() => {
    // Initialize options for status type if empty
    if (type === 'status' && options.length === 0) {
      setOptions([
        { id: 'new', label: 'Новая', color: '#3B82F6' },
        { id: 'in-progress', label: 'В работе', color: '#F59E0B' },
        { id: 'done', label: 'Готово', color: '#10B981' },
      ]);
    }
  }, [type, options.length]);

  const handleAddOption = () => {
    const newOption: FieldOption = {
      id: `opt-${Date.now()}`,
      label: 'Новый вариант',
      color: PRESET_COLORS[options.length % PRESET_COLORS.length],
    };
    setOptions([...options, newOption]);
  };

  const handleUpdateOption = (
    index: number,
    updates: Partial<FieldOption>
  ) => {
    setOptions(
      options.map((opt, i) => (i === index ? { ...opt, ...updates } : opt))
    );
  };

  const handleRemoveOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const updates: Partial<Field> = {
      name,
      required,
      description: description || undefined,
    };

    if (!isSystemField) {
      updates.type = type;
    }

    if (hasOptions) {
      updates.options = options;
    }

    if (type === 'relation') {
      updates.relatedWorkspaceId = relatedWorkspaceId || undefined;
    }

    onSave(sectionId, field.id, updates);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Настройка поля
            </h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                Название поля
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Введите название"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                Тип поля
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FieldType)}
                disabled={isSystemField}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-500"
              >
                <option value="text">Текст</option>
                <option value="textarea">Многострочный</option>
                <option value="number">Число</option>
                <option value="date">Дата</option>
                <option value="select">Выбор из списка</option>
                <option value="status">Статус</option>
                <option value="user">Пользователь</option>
                <option value="file">Файл</option>
                <option value="relation">Связь</option>
              </select>
              {isSystemField && (
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  Тип системного поля изменить нельзя
                </p>
              )}
            </div>

            {/* Required */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="required"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
              />
              <label htmlFor="required" className="text-sm text-gray-700 dark:text-gray-300">
                Обязательное поле
              </label>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                Описание (необязательно)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Подсказка для пользователей"
              />
            </div>

            {/* Options for select/status */}
            {hasOptions && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                  Варианты
                  {type === 'status' && (
                    <span className="ml-2 text-gray-400 dark:text-gray-500 normal-case">
                      (станут колонками канбана)
                    </span>
                  )}
                </label>
                <div className="space-y-2">
                  {options.map((option, index) => (
                    <div
                      key={option.id}
                      className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg"
                    >
                      <button className="p-1 text-gray-400 dark:text-gray-500 cursor-grab">
                        <GripVertical className="w-4 h-4" />
                      </button>

                      <div className="relative">
                        <input
                          type="color"
                          value={option.color || '#3B82F6'}
                          onChange={(e) =>
                            handleUpdateOption(index, { color: e.target.value })
                          }
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div
                          className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
                          style={{ backgroundColor: option.color || '#3B82F6' }}
                        />
                      </div>

                      <input
                        type="text"
                        value={option.label}
                        onChange={(e) =>
                          handleUpdateOption(index, { label: e.target.value })
                        }
                        className="flex-1 px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="Название варианта"
                      />

                      <button
                        onClick={() => handleRemoveOption(index)}
                        className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400"
                        disabled={options.length <= 1}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleAddOption}
                  className="mt-2 flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                >
                  <Plus className="w-4 h-4" />
                  <span>Добавить вариант</span>
                </button>
              </div>
            )}

            {/* Related workspace for relation type */}
            {type === 'relation' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Связанное рабочее место
                </label>
                <select
                  value={relatedWorkspaceId}
                  onChange={(e) => setRelatedWorkspaceId(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Выберите рабочее место</option>
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.icon} {ws.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
