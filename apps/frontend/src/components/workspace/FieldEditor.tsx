'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, GripVertical, Settings2, Zap } from 'lucide-react';
import type { Field, FieldOption, FieldType, FieldRule, Workspace, FieldConfig } from '@/types';
import { RuleBuilder } from './RuleBuilder';

interface FieldEditorProps {
  field: Field;
  sectionId: string;
  workspaces: Workspace[];
  allFields?: Field[];
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

const TYPE_LABELS: Record<FieldType, string> = {
  text: 'Текст',
  textarea: 'Многострочный',
  number: 'Число',
  date: 'Дата',
  select: 'Выбор из списка',
  status: 'Статус',
  user: 'Пользователь',
  file: 'Файл',
  relation: 'Связь',
  checkbox: 'Чекбокс',
  url: 'Ссылка',
  geolocation: 'Геолокация',
  client: 'Клиент',
};

// Типы с расширенными настройками
const TYPES_WITH_CONFIG: FieldType[] = ['text', 'textarea', 'number', 'date', 'select', 'user', 'url', 'client'];

// Чекбокс-переключатель для boolean настроек
function ConfigToggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
      />
      <div>
        <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
        {hint && <p className="text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
      </div>
    </div>
  );
}

export function FieldEditor({
  field,
  sectionId,
  workspaces,
  allFields = [],
  onSave,
  onClose,
}: FieldEditorProps) {
  const [name, setName] = useState(field.name);
  const type = field.type;
  const [required, setRequired] = useState(field.required || false);
  const [description, setDescription] = useState(field.description || '');
  const [options, setOptions] = useState<FieldOption[]>(field.options || []);
  const [relatedWorkspaceId, setRelatedWorkspaceId] = useState(
    field.relatedWorkspaceId || ''
  );
  const [config, setConfig] = useState<Record<string, any>>(
    (field.config as Record<string, any>) || {}
  );
  const [rules, setRules] = useState<FieldRule[]>(field.rules || []);
  const [showConfig, setShowConfig] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const hasOptions = type === 'select' || type === 'status';
  const hasConfig = TYPES_WITH_CONFIG.includes(type);

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

  const updateConfig = (key: string, value: any) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: value };
      // Удаляем undefined/null
      if (value === undefined || value === null || value === '') {
        delete next[key];
      }
      return next;
    });
  };

  const handleSave = () => {
    const updates: Partial<Field> = {
      name,
      required,
      description: description || undefined,
    };

    if (hasOptions) {
      updates.options = options;
    }

    if (type === 'relation') {
      updates.relatedWorkspaceId = relatedWorkspaceId || undefined;
    }

    // Сохраняем config если есть настройки
    if (hasConfig && Object.keys(config).length > 0) {
      updates.config = { type, ...config } as FieldConfig;
    } else if (hasConfig) {
      updates.config = undefined;
    }

    // Сохраняем rules
    updates.rules = rules.length > 0 ? rules : undefined;

    onSave(sectionId, field.id, updates);
    onClose();
  };

  // Config UI для каждого типа
  const renderConfigSection = () => {
    switch (type) {
      case 'text':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Максимальная длина
              </label>
              <input
                type="number"
                value={config.maxLength ?? ''}
                onChange={(e) => updateConfig('maxLength', e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Без ограничений"
                min={1}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Маска ввода
              </label>
              <select
                value={config.mask ?? ''}
                onChange={(e) => updateConfig('mask', e.target.value || undefined)}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Без маски</option>
                <option value="phone">Телефон (+7 (___) ___-__-__)</option>
                <option value="inn">ИНН (10 или 12 цифр)</option>
              </select>
            </div>
            <ConfigToggle
              label="Обрезать пробелы"
              checked={config.trim !== false}
              onChange={(v) => updateConfig('trim', v ? undefined : false)}
              hint="Убирать пробелы в начале и конце"
            />
          </div>
        );

      case 'textarea':
        return (
          <div className="space-y-3">
            <ConfigToggle
              label="Rich Text (Tiptap)"
              checked={config.markdown ?? false}
              onChange={(v) => updateConfig('markdown', v || undefined)}
              hint="Форматированный текст: жирный, курсив, списки, ссылки"
            />
            {!config.markdown && (
              <ConfigToggle
                label="Авто-высота"
                checked={config.autoResize ?? false}
                onChange={(v) => updateConfig('autoResize', v || undefined)}
                hint="Поле автоматически растягивается по содержимому"
              />
            )}
            <ConfigToggle
              label="Сворачиваемое"
              checked={config.collapsible ?? false}
              onChange={(v) => updateConfig('collapsible', v || undefined)}
              hint="Длинный текст будет свёрнут с кнопкой «Показать полностью»"
            />
            {config.collapsible && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Строк до сворачивания
                </label>
                <input
                  type="number"
                  value={config.collapsedLines ?? 3}
                  onChange={(e) => updateConfig('collapsedLines', e.target.value ? Number(e.target.value) : undefined)}
                  min={1}
                  max={20}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            )}
          </div>
        );

      case 'number':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Подтип числа
              </label>
              <select
                value={config.subtype ?? 'integer'}
                onChange={(e) => updateConfig('subtype', e.target.value === 'integer' ? undefined : e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="integer">Целое число</option>
                <option value="decimal">Десятичное</option>
                <option value="money">Деньги (₽)</option>
                <option value="percent">Проценты (%)</option>
                <option value="inn">ИНН</option>
              </select>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Мин</label>
                <input
                  type="number"
                  value={config.min ?? ''}
                  onChange={(e) => updateConfig('min', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="—"
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Макс</label>
                <input
                  type="number"
                  value={config.max ?? ''}
                  onChange={(e) => updateConfig('max', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="—"
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Префикс</label>
                <input
                  type="text"
                  value={config.prefix ?? ''}
                  onChange={(e) => updateConfig('prefix', e.target.value || undefined)}
                  placeholder="напр. $"
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Суффикс</label>
                <input
                  type="text"
                  value={config.suffix ?? ''}
                  onChange={(e) => updateConfig('suffix', e.target.value || undefined)}
                  placeholder="напр. шт."
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>
        );

      case 'date':
        return (
          <div className="space-y-3">
            <ConfigToggle
              label="Включить время"
              checked={config.includeTime ?? false}
              onChange={(v) => updateConfig('includeTime', v || undefined)}
              hint="Дата + время (datetime-local)"
            />
            <ConfigToggle
              label="Быстрые кнопки"
              checked={config.quickPicks ?? false}
              onChange={(v) => updateConfig('quickPicks', v || undefined)}
              hint="Сегодня, Завтра, +1 неделя"
            />
          </div>
        );

      case 'select': {
        // Собираем поля-кандидаты для cascadeFrom (другие select/status поля)
        const cascadeParentFields = allFields.filter(
          (f) => f.id !== field.id && (f.type === 'select' || f.type === 'status') && f.options && f.options.length > 0
        );
        const cascadeParentField = cascadeParentFields.find((f) => f.id === config.cascadeFrom);

        return (
          <div className="space-y-3">
            <ConfigToggle
              label="Множественный выбор"
              checked={config.multiSelect ?? false}
              onChange={(v) => updateConfig('multiSelect', v || undefined)}
              hint="Можно выбрать несколько вариантов"
            />
            <ConfigToggle
              label="Поиск по вариантам"
              checked={config.searchable ?? false}
              onChange={(v) => updateConfig('searchable', v || undefined)}
              hint="Строка поиска в выпадающем списке"
            />
            <ConfigToggle
              label="Разрешить создание вариантов"
              checked={config.allowCreate ?? false}
              onChange={(v) => updateConfig('allowCreate', v || undefined)}
              hint="Пользователи смогут добавлять новые варианты при вводе"
            />
            {cascadeParentFields.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Зависит от поля (каскад)
                </label>
                <select
                  value={config.cascadeFrom ?? ''}
                  onChange={(e) => {
                    updateConfig('cascadeFrom', e.target.value || undefined);
                    // Сбросить parentId у всех опций при смене родителя
                    if (!e.target.value) {
                      setOptions(options.map((o) => {
                        const { parentId, ...rest } = o;
                        return rest;
                      }));
                    }
                  }}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Без зависимости</option>
                  {cascadeParentFields.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Варианты фильтруются по значению родительского поля
                </p>
              </div>
            )}
            {config.cascadeFrom && cascadeParentField && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                  Привязка вариантов к «{cascadeParentField.name}»
                </label>
                <div className="space-y-1.5">
                  {options.map((opt, index) => (
                    <div key={opt.id} className="flex items-center gap-2">
                      <span className="text-sm text-gray-700 dark:text-gray-300 min-w-[100px] truncate">{opt.label}</span>
                      <span className="text-xs text-gray-400">→</span>
                      <select
                        value={opt.parentId ?? ''}
                        onChange={(e) => handleUpdateOption(index, { parentId: e.target.value || undefined })}
                        className="flex-1 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      >
                        <option value="">Все варианты</option>
                        {cascadeParentField.options?.map((po) => (
                          <option key={po.id} value={po.id}>{po.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Вариант без привязки показывается всегда
                </p>
              </div>
            )}
          </div>
        );
      }

      case 'user':
        return (
          <div className="space-y-3">
            <ConfigToggle
              label="Множественный выбор"
              checked={config.multiSelect ?? false}
              onChange={(v) => updateConfig('multiSelect', v || undefined)}
              hint="Можно назначить несколько пользователей"
            />
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Фильтр по отделу
              </label>
              <input
                type="text"
                value={config.departmentFilter ?? ''}
                onChange={(e) => updateConfig('departmentFilter', e.target.value || undefined)}
                placeholder="Все отделы"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Показывать только пользователей из указанного отдела
              </p>
            </div>
            <ConfigToggle
              label="Индикатор онлайн"
              checked={config.showOnlineStatus ?? false}
              onChange={(v) => updateConfig('showOnlineStatus', v || undefined)}
              hint="Зелёная точка у аватара пользователей, которые сейчас в системе"
            />
          </div>
        );

      case 'url':
        return (
          <div className="space-y-3">
            <ConfigToggle
              label="Показывать превью"
              checked={config.showPreview ?? false}
              onChange={(v) => updateConfig('showPreview', v || undefined)}
              hint="Превью страницы (OG meta-теги: заголовок, описание, изображение)"
            />
          </div>
        );

      case 'client':
        return (
          <div className="space-y-3">
            <ConfigToggle
              label="Автозаполнение из Legacy CRM"
              checked={config.showLegacyPicker ?? false}
              onChange={(v) => updateConfig('showLegacyPicker', v || undefined)}
              hint="Поиск клиента в Legacy CRM для автозаполнения данных"
            />
            <ConfigToggle
              label="Контрагент (компания)"
              checked={config.showCounterparty ?? false}
              onChange={(v) => updateConfig('showCounterparty', v || undefined)}
              hint="Выбор контрагента из Legacy CRM"
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Настройка поля
              </h3>
              <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium rounded">
                {TYPE_LABELS[type]}
              </span>
            </div>
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

            {/* Config section (expandable) */}
            {hasConfig && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowConfig(!showConfig)}
                  className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
                >
                  <Settings2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Расширенные настройки</span>
                  <svg
                    className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${showConfig ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showConfig && (
                  <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                    {renderConfigSection()}
                  </div>
                )}
              </div>
            )}

            {/* Rules section (expandable) */}
            {allFields.length > 0 && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowRules(!showRules)}
                  className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
                >
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Правила поля</span>
                  {rules.length > 0 && (
                    <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full">
                      {rules.length}
                    </span>
                  )}
                  <svg
                    className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${showRules ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showRules && (
                  <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                      Условная видимость и обязательность поля в зависимости от значений других полей
                    </p>
                    <RuleBuilder
                      rules={rules}
                      allFields={allFields.filter((f) => f.id !== field.id)}
                      onChange={setRules}
                    />
                  </div>
                )}
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
