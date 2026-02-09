'use client';

import { useState, useCallback } from 'react';
import { X, Loader2, Copy, Check, RefreshCw } from 'lucide-react';
import type { ProcessTrigger, ProcessDefinition, TriggerType, TriggerConditions } from '@/types';
import { triggersApi, CreateTriggerDto, UpdateTriggerDto } from '@/lib/api/triggers';

interface TriggerFormProps {
  workspaceId: string;
  definitions: ProcessDefinition[];
  trigger?: ProcessTrigger;
  onSave: (trigger: ProcessTrigger) => void;
  onCancel: () => void;
}

const triggerTypes: { value: TriggerType; label: string; description: string }[] = [
  {
    value: 'entity_created',
    label: 'Создание заявки',
    description: 'Запускать процесс при создании новой заявки',
  },
  {
    value: 'status_changed',
    label: 'Изменение статуса',
    description: 'Запускать процесс при смене статуса заявки',
  },
  {
    value: 'assignee_changed',
    label: 'Смена исполнителя',
    description: 'Запускать процесс при назначении или смене исполнителя',
  },
  {
    value: 'comment_added',
    label: 'Новый комментарий',
    description: 'Запускать процесс при добавлении комментария',
  },
  {
    value: 'cron',
    label: 'По расписанию',
    description: 'Запускать процесс по расписанию (cron)',
  },
  {
    value: 'webhook',
    label: 'Webhook',
    description: 'Запускать процесс при получении HTTP запроса',
  },
];

export function TriggerForm({
  workspaceId,
  definitions,
  trigger,
  onSave,
  onCancel,
}: TriggerFormProps) {
  const isEditing = !!trigger;

  const [name, setName] = useState(trigger?.name || '');
  const [description, setDescription] = useState(trigger?.description || '');
  const [processDefinitionId, setProcessDefinitionId] = useState(
    trigger?.processDefinitionId || ''
  );
  const [triggerType, setTriggerType] = useState<TriggerType>(
    trigger?.triggerType || 'entity_created'
  );
  const [conditions, setConditions] = useState<TriggerConditions>(
    trigger?.conditions || {}
  );
  const [isActive, setIsActive] = useState(trigger?.isActive ?? true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const deployedDefinitions = definitions.filter((d) => d.deployedKey);

  const webhookUrl = trigger?.id
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/bpmn/triggers/webhook/${trigger.id}`
    : null;

  const copyToClipboard = useCallback(async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  const generateSecret = useCallback(() => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const secret = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
    updateCondition('secret', secret);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!processDefinitionId) {
      setError('Выберите процесс');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let result: ProcessTrigger;

      if (isEditing) {
        const data: UpdateTriggerDto = {
          name: name || undefined,
          description: description || undefined,
          conditions,
          isActive,
        };
        result = await triggersApi.update(trigger.id, data);
      } else {
        const data: CreateTriggerDto = {
          workspaceId,
          processDefinitionId,
          triggerType,
          name: name || undefined,
          description: description || undefined,
          conditions,
          isActive,
        };
        result = await triggersApi.create(data);
      }

      onSave(result);
    } catch (err) {
      setError('Не удалось сохранить триггер');
      console.error('Failed to save trigger:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const updateCondition = (key: keyof TriggerConditions, value: unknown) => {
    setConditions((prev) => {
      if (value === '' || value === undefined) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[90vh] bg-white dark:bg-gray-800 rounded-lg shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEditing ? 'Редактировать триггер' : 'Создать триггер'}
          </h3>
          <button
            onClick={onCancel}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Название
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название триггера"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Process */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Процесс <span className="text-red-500">*</span>
            </label>
            <select
              value={processDefinitionId}
              onChange={(e) => setProcessDefinitionId(e.target.value)}
              disabled={isEditing}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
            >
              <option value="">Выберите процесс</option>
              {deployedDefinitions.map((def) => (
                <option key={def.id} value={def.id}>
                  {def.name}
                </option>
              ))}
            </select>
            {deployedDefinitions.length === 0 && (
              <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                Нет развернутых процессов. Сначала создайте и разверните процесс.
              </p>
            )}
          </div>

          {/* Trigger Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Тип триггера <span className="text-red-500">*</span>
            </label>
            <select
              value={triggerType}
              onChange={(e) => {
                setTriggerType(e.target.value as TriggerType);
                setConditions({});
              }}
              disabled={isEditing}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
            >
              {triggerTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {triggerTypes.find((t) => t.value === triggerType)?.description}
            </p>
          </div>

          {/* Type-specific conditions */}
          {triggerType === 'status_changed' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Из статуса
                </label>
                <input
                  type="text"
                  value={conditions.fromStatus || ''}
                  onChange={(e) => updateCondition('fromStatus', e.target.value)}
                  placeholder="Любой"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  В статус
                </label>
                <input
                  type="text"
                  value={conditions.toStatus || ''}
                  onChange={(e) => updateCondition('toStatus', e.target.value)}
                  placeholder="Любой"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </>
          )}

          {triggerType === 'assignee_changed' && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="onlyWhenAssigned"
                checked={conditions.onlyWhenAssigned || false}
                onChange={(e) => updateCondition('onlyWhenAssigned', e.target.checked)}
                className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
              />
              <label htmlFor="onlyWhenAssigned" className="text-sm text-gray-700 dark:text-gray-300">
                Только при назначении (не при снятии)
              </label>
            </div>
          )}

          {triggerType === 'cron' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Cron выражение <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={conditions.expression || ''}
                  onChange={(e) => updateCondition('expression', e.target.value)}
                  placeholder="0 9 * * 1-5"
                  className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Например: 0 9 * * 1-5 (каждый будний день в 9:00)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Часовой пояс
                </label>
                <input
                  type="text"
                  value={conditions.timezone || ''}
                  onChange={(e) => updateCondition('timezone', e.target.value)}
                  placeholder="Europe/Moscow"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </>
          )}

          {triggerType === 'webhook' && (
            <div className="space-y-3">
              {/* Webhook URL (only shown for existing triggers) */}
              {webhookUrl && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Webhook URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={webhookUrl}
                      readOnly
                      className="flex-1 px-3 py-2 text-sm font-mono bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(webhookUrl, 'url')}
                      className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      title="Копировать URL"
                    >
                      {copiedField === 'url' ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-500" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Secret */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Секретный ключ (HMAC-SHA256)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={conditions.secret || ''}
                    onChange={(e) => updateCondition('secret', e.target.value)}
                    placeholder="Опционально — для подписи запросов"
                    className="flex-1 px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <button
                    type="button"
                    onClick={generateSecret}
                    className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Сгенерировать ключ"
                  >
                    <RefreshCw className="w-4 h-4 text-gray-500" />
                  </button>
                  {conditions.secret && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(conditions.secret!, 'secret')}
                      className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      title="Копировать ключ"
                    >
                      {copiedField === 'secret' ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-500" />
                      )}
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Отправляйте заголовок <code className="px-1 bg-gray-100 dark:bg-gray-700 rounded">X-Webhook-Signature: sha256=&lt;hmac&gt;</code> или <code className="px-1 bg-gray-100 dark:bg-gray-700 rounded">X-Webhook-Secret: &lt;ключ&gt;</code>
                </p>
              </div>
            </div>
          )}

          {/* Priority filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Фильтр по приоритету
            </label>
            <select
              value={conditions.priority || ''}
              onChange={(e) => updateCondition('priority', e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">Любой приоритет</option>
              <option value="high">Высокий</option>
              <option value="medium">Средний</option>
              <option value="low">Низкий</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Описание
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Описание триггера"
              rows={3}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Active */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
            />
            <label htmlFor="isActive" className="text-sm text-gray-700 dark:text-gray-300">
              Триггер активен
            </label>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !processDefinitionId}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEditing ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TriggerForm;
