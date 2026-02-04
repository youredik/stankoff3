'use client';

import { useState, useEffect } from 'react';
import type { SlaDefinition, SlaTargetType, EscalationRule } from '@/types';
import * as slaApi from '@/lib/api/sla';
import type { CreateSlaDefinitionDto, UpdateSlaDefinitionDto } from '@/lib/api/sla';

interface SlaDefinitionFormProps {
  workspaceId: string;
  definition?: SlaDefinition;
  onSave: (definition: SlaDefinition) => void;
  onCancel: () => void;
}

const defaultBusinessHours = {
  start: '09:00',
  end: '18:00',
  timezone: 'Europe/Moscow',
  workdays: [1, 2, 3, 4, 5],
};

export function SlaDefinitionForm({
  workspaceId,
  definition,
  onSave,
  onCancel,
}: SlaDefinitionFormProps) {
  const [name, setName] = useState(definition?.name || '');
  const [description, setDescription] = useState(definition?.description || '');
  const [appliesTo, setAppliesTo] = useState<SlaTargetType>(definition?.appliesTo || 'entity');
  const [responseTime, setResponseTime] = useState(definition?.responseTime?.toString() || '60');
  const [resolutionTime, setResolutionTime] = useState(definition?.resolutionTime?.toString() || '480');
  const [warningThreshold, setWarningThreshold] = useState(definition?.warningThreshold?.toString() || '80');
  const [businessHoursOnly, setBusinessHoursOnly] = useState(definition?.businessHoursOnly ?? true);
  const [businessHours, setBusinessHours] = useState(definition?.businessHours || defaultBusinessHours);
  const [escalationRules, setEscalationRules] = useState<EscalationRule[]>(definition?.escalationRules || []);
  const [isActive, setIsActive] = useState(definition?.isActive ?? true);
  const [priority, setPriority] = useState(definition?.priority?.toString() || '10');
  const [conditions, setConditions] = useState<Record<string, string>>(
    definition?.conditions ? Object.fromEntries(
      Object.entries(definition.conditions).map(([k, v]) => [k, String(v)])
    ) : {}
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      setError('Название обязательно');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const data = {
        name: name.trim(),
        description: description.trim() || undefined,
        appliesTo,
        responseTime: responseTime ? parseInt(responseTime, 10) : undefined,
        resolutionTime: resolutionTime ? parseInt(resolutionTime, 10) : undefined,
        warningThreshold: parseInt(warningThreshold, 10),
        businessHoursOnly,
        businessHours: businessHoursOnly ? businessHours : undefined,
        escalationRules,
        isActive,
        priority: parseInt(priority, 10),
        conditions: Object.keys(conditions).length > 0 ? conditions : undefined,
      };

      let result: SlaDefinition;
      if (definition) {
        result = await slaApi.updateDefinition(definition.id, data as UpdateSlaDefinitionDto);
      } else {
        result = await slaApi.createDefinition({ ...data, workspaceId } as CreateSlaDefinitionDto);
      }

      onSave(result);
    } catch {
      setError('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  function addEscalationRule() {
    setEscalationRules([
      ...escalationRules,
      { threshold: 80, action: 'notify', targets: ['assignee'] },
    ]);
  }

  function updateEscalationRule(index: number, updates: Partial<EscalationRule>) {
    setEscalationRules(
      escalationRules.map((rule, i) => (i === index ? { ...rule, ...updates } : rule))
    );
  }

  function removeEscalationRule(index: number) {
    setEscalationRules(escalationRules.filter((_, i) => i !== index));
  }

  function addCondition() {
    const key = `field_${Object.keys(conditions).length + 1}`;
    setConditions({ ...conditions, [key]: '' });
  }

  function updateConditionKey(oldKey: string, newKey: string) {
    const value = conditions[oldKey];
    const newConditions = { ...conditions };
    delete newConditions[oldKey];
    newConditions[newKey] = value;
    setConditions(newConditions);
  }

  function updateConditionValue(key: string, value: string) {
    setConditions({ ...conditions, [key]: value });
  }

  function removeCondition(key: string) {
    const newConditions = { ...conditions };
    delete newConditions[key];
    setConditions(newConditions);
  }

  function toggleWorkday(day: number) {
    const workdays = businessHours.workdays.includes(day)
      ? businessHours.workdays.filter((d) => d !== day)
      : [...businessHours.workdays, day].sort();
    setBusinessHours({ ...businessHours, workdays });
  }

  const weekdays = [
    { value: 1, label: 'Пн' },
    { value: 2, label: 'Вт' },
    { value: 3, label: 'Ср' },
    { value: 4, label: 'Чт' },
    { value: 5, label: 'Пт' },
    { value: 6, label: 'Сб' },
    { value: 0, label: 'Вс' },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Название *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            placeholder="Например: Стандартный SLA"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Описание
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Применяется к
          </label>
          <select
            value={appliesTo}
            onChange={(e) => setAppliesTo(e.target.value as SlaTargetType)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          >
            <option value="entity">Заявки</option>
            <option value="task">Задачи</option>
            <option value="process">Процессы</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Приоритет
          </label>
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            min="1"
            max="100"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">Чем выше, тем приоритетнее</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Время ответа (минуты)
          </label>
          <input
            type="number"
            value={responseTime}
            onChange={(e) => setResponseTime(e.target.value)}
            min="1"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Время решения (минуты)
          </label>
          <input
            type="number"
            value={resolutionTime}
            onChange={(e) => setResolutionTime(e.target.value)}
            min="1"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Порог предупреждения (%)
          </label>
          <input
            type="number"
            value={warningThreshold}
            onChange={(e) => setWarningThreshold(e.target.value)}
            min="1"
            max="100"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <label htmlFor="isActive" className="text-sm text-gray-700 dark:text-gray-300">
            Активен
          </label>
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <input
            type="checkbox"
            id="businessHoursOnly"
            checked={businessHoursOnly}
            onChange={(e) => setBusinessHoursOnly(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <label htmlFor="businessHoursOnly" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Учитывать только рабочие часы
          </label>
        </div>

        {businessHoursOnly && (
          <div className="ml-6 space-y-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Начало</label>
                <input
                  type="time"
                  value={businessHours.start}
                  onChange={(e) => setBusinessHours({ ...businessHours, start: e.target.value })}
                  className="w-full px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Конец</label>
                <input
                  type="time"
                  value={businessHours.end}
                  onChange={(e) => setBusinessHours({ ...businessHours, end: e.target.value })}
                  className="w-full px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Рабочие дни</label>
              <div className="flex gap-1">
                {weekdays.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleWorkday(day.value)}
                    className={`px-2 py-1 text-xs rounded ${
                      businessHours.workdays.includes(day.value)
                        ? 'bg-teal-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Условия применения
          </h4>
          <button
            type="button"
            onClick={addCondition}
            className="text-xs text-teal-600 hover:text-teal-700"
          >
            + Добавить
          </button>
        </div>

        {Object.entries(conditions).length === 0 ? (
          <p className="text-xs text-gray-500">Применяется ко всем</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(conditions).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <input
                  type="text"
                  value={key}
                  onChange={(e) => updateConditionKey(key, e.target.value)}
                  placeholder="Поле"
                  className="flex-1 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                />
                <span className="text-gray-400">=</span>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => updateConditionValue(key, e.target.value)}
                  placeholder="Значение"
                  className="flex-1 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                />
                <button
                  type="button"
                  onClick={() => removeCondition(key)}
                  className="p-1 text-gray-400 hover:text-red-500"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Правила эскалации
          </h4>
          <button
            type="button"
            onClick={addEscalationRule}
            className="text-xs text-teal-600 hover:text-teal-700"
          >
            + Добавить
          </button>
        </div>

        {escalationRules.length === 0 ? (
          <p className="text-xs text-gray-500">Нет правил эскалации</p>
        ) : (
          <div className="space-y-3">
            {escalationRules.map((rule, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
              >
                <span className="text-xs text-gray-500">При</span>
                <input
                  type="number"
                  value={rule.threshold}
                  onChange={(e) =>
                    updateEscalationRule(index, { threshold: parseInt(e.target.value, 10) })
                  }
                  min="1"
                  max="200"
                  className="w-16 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                />
                <span className="text-xs text-gray-500">%</span>
                <select
                  value={rule.action}
                  onChange={(e) =>
                    updateEscalationRule(index, { action: e.target.value as 'notify' | 'escalate' })
                  }
                  className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                >
                  <option value="notify">Уведомить</option>
                  <option value="escalate">Эскалировать</option>
                </select>
                <input
                  type="text"
                  value={rule.targets.join(', ')}
                  onChange={(e) =>
                    updateEscalationRule(index, {
                      targets: e.target.value.split(',').map((t) => t.trim()),
                    })
                  }
                  placeholder="assignee, manager"
                  className="flex-1 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                />
                <button
                  type="button"
                  onClick={() => removeEscalationRule(index)}
                  className="p-1 text-gray-400 hover:text-red-500"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? 'Сохранение...' : definition ? 'Сохранить' : 'Создать'}
        </button>
      </div>
    </form>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
