'use client';

import { useState, useEffect } from 'react';
import {
  Zap,
  Plus,
  Trash2,
  Edit2,
  Power,
  PowerOff,
  ChevronDown,
  ChevronUp,
  Play,
  Clock,
} from 'lucide-react';
import {
  automationApi,
  AutomationRule,
  TriggerType,
  ActionType,
  RuleCondition,
  RuleAction,
  triggerLabels,
  actionLabels,
  operatorLabels,
  CreateRuleDto,
} from '@/lib/api/automation';
import { getTables } from '@/lib/api/dmn';
import type { DecisionTable } from '@/types';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import SearchableUserSelect from '@/components/ui/SearchableUserSelect';
import { useEntityStore } from '@/store/useEntityStore';

interface AutomationRulesProps {
  workspaceId: string;
}

export function AutomationRules({ workspaceId }: AutomationRulesProps) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  const { currentWorkspace } = useWorkspaceStore();
  const { users, fetchUsers } = useEntityStore();

  useEffect(() => {
    loadRules();
    if (users.length === 0) {
      fetchUsers();
    }
  }, [workspaceId]);

  const loadRules = async () => {
    try {
      setLoading(true);
      const data = await automationApi.getByWorkspace(workspaceId);
      setRules(data);
    } catch (err) {
      console.error('Failed to load automation rules:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      const updated = await automationApi.toggle(id);
      setRules(rules.map((r) => (r.id === id ? updated : r)));
    } catch (err) {
      console.error('Failed to toggle rule:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить правило автоматизации?')) return;
    try {
      await automationApi.remove(id);
      setRules(rules.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to delete rule:', err);
    }
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedRules);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRules(newExpanded);
  };

  // Получаем статусы из workspace
  const statuses =
    currentWorkspace?.sections
      ?.flatMap((s) => s.fields)
      .find((f) => f.type === 'status')?.options || [];

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-500 dark:text-gray-400">
        Загрузка правил...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Автоматизация
          </h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            ({rules.length})
          </span>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Добавить правило
        </button>
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Нет настроенных правил автоматизации</p>
          <p className="text-sm mt-1">
            Создайте правило для автоматического выполнения действий
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`border rounded-lg transition-colors ${
                rule.isActive
                  ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 opacity-60'
              }`}
            >
              {/* Rule header */}
              <div
                className="flex items-center gap-3 p-3 cursor-pointer"
                onClick={() => toggleExpand(rule.id)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggle(rule.id);
                  }}
                  className={`p-1.5 rounded transition-colors ${
                    rule.isActive
                      ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30'
                      : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  title={rule.isActive ? 'Выключить' : 'Включить'}
                >
                  {rule.isActive ? (
                    <Power className="w-4 h-4" />
                  ) : (
                    <PowerOff className="w-4 h-4" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {rule.name}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                      {triggerLabels[rule.trigger]}
                    </span>
                  </div>
                  {rule.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {rule.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-400">
                  {rule.executionCount > 0 && (
                    <span className="flex items-center gap-1" title="Выполнений">
                      <Play className="w-3 h-3" />
                      {rule.executionCount}
                    </span>
                  )}
                  {rule.lastExecutedAt && (
                    <span
                      className="flex items-center gap-1"
                      title={`Последнее выполнение: ${new Date(rule.lastExecutedAt).toLocaleString()}`}
                    >
                      <Clock className="w-3 h-3" />
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingRule(rule);
                      setShowCreateModal(true);
                    }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                    title="Редактировать"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(rule.id);
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                    title="Удалить"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {expandedRules.has(rule.id) ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Expanded details */}
              {expandedRules.has(rule.id) && (
                <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-3">
                  {/* Conditions */}
                  {rule.conditions && rule.conditions.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Условия:
                      </span>
                      <ul className="mt-1 space-y-1">
                        {rule.conditions.map((cond, i) => (
                          <li
                            key={i}
                            className="text-sm text-gray-700 dark:text-gray-300"
                          >
                            • {cond.field} {operatorLabels[cond.operator]}{' '}
                            {cond.value !== undefined && (
                              <span className="font-medium">"{cond.value}"</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Actions */}
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Действия:
                    </span>
                    <ul className="mt-1 space-y-1">
                      {rule.actions.map((action, i) => (
                        <li
                          key={i}
                          className="text-sm text-gray-700 dark:text-gray-300"
                        >
                          • {actionLabels[action.type]}
                          {action.config.status && (
                            <span className="ml-1 font-medium">
                              → {statuses.find((s) => s.id === action.config.status)?.label || action.config.status}
                            </span>
                          )}
                          {action.config.priority && (
                            <span className="ml-1 font-medium">
                              → {action.config.priority}
                            </span>
                          )}
                          {action.config.assigneeId && (
                            <span className="ml-1 font-medium">
                              → {users.find((u) => u.id === action.config.assigneeId)?.firstName || 'Пользователь'}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Trigger config */}
                  {rule.triggerConfig && Object.keys(rule.triggerConfig).length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Конфигурация триггера:
                      </span>
                      <div className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                        {rule.triggerConfig.fromStatus && (
                          <div>
                            Из статуса:{' '}
                            {Array.isArray(rule.triggerConfig.fromStatus)
                              ? rule.triggerConfig.fromStatus
                                  .map((s) => statuses.find((st) => st.id === s)?.label || s)
                                  .join(', ')
                              : statuses.find((s) => s.id === rule.triggerConfig?.fromStatus)?.label ||
                                rule.triggerConfig.fromStatus}
                          </div>
                        )}
                        {rule.triggerConfig.toStatus && (
                          <div>
                            В статус:{' '}
                            {Array.isArray(rule.triggerConfig.toStatus)
                              ? rule.triggerConfig.toStatus
                                  .map((s) => statuses.find((st) => st.id === s)?.label || s)
                                  .join(', ')
                              : statuses.find((s) => s.id === rule.triggerConfig?.toStatus)?.label ||
                                rule.triggerConfig.toStatus}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <AutomationRuleModal
          workspaceId={workspaceId}
          rule={editingRule}
          statuses={statuses}
          users={users}
          onClose={() => {
            setShowCreateModal(false);
            setEditingRule(null);
          }}
          onSave={async (data) => {
            try {
              if (editingRule) {
                const updated = await automationApi.update(editingRule.id, data);
                setRules(rules.map((r) => (r.id === editingRule.id ? updated : r)));
              } else {
                const created = await automationApi.create({ ...data, workspaceId });
                setRules([...rules, created]);
              }
              setShowCreateModal(false);
              setEditingRule(null);
            } catch (err) {
              console.error('Failed to save rule:', err);
              alert('Ошибка сохранения правила');
            }
          }}
        />
      )}
    </div>
  );
}

// Modal for creating/editing rules
interface AutomationRuleModalProps {
  workspaceId: string;
  rule: AutomationRule | null;
  statuses: Array<{ id: string; label: string; color?: string }>;
  users: Array<{ id: string; firstName: string; lastName: string }>;
  onClose: () => void;
  onSave: (data: CreateRuleDto) => Promise<void>;
}

function AutomationRuleModal({
  workspaceId,
  rule,
  statuses,
  users,
  onClose,
  onSave,
}: AutomationRuleModalProps) {
  const [name, setName] = useState(rule?.name || '');
  const [description, setDescription] = useState(rule?.description || '');
  const [trigger, setTrigger] = useState<TriggerType>(rule?.trigger || 'on_create');
  const [triggerConfig, setTriggerConfig] = useState(rule?.triggerConfig || {});
  const [conditions, setConditions] = useState<RuleCondition[]>(rule?.conditions || []);
  const [actions, setActions] = useState<RuleAction[]>(
    rule?.actions || [{ type: 'set_status', config: {} }]
  );
  const [saving, setSaving] = useState(false);
  const [decisionTables, setDecisionTables] = useState<DecisionTable[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);

  // Загружаем таблицы решений при открытии модала
  useEffect(() => {
    const loadDecisionTables = async () => {
      setLoadingTables(true);
      try {
        const tables = await getTables(workspaceId);
        setDecisionTables(tables.filter((t) => t.isActive));
      } catch (err) {
        console.error('Failed to load decision tables:', err);
      } finally {
        setLoadingTables(false);
      }
    };
    loadDecisionTables();
  }, [workspaceId]);

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Введите название правила');
      return;
    }
    if (actions.length === 0) {
      alert('Добавьте хотя бы одно действие');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name,
        description: description || undefined,
        workspaceId,
        trigger,
        triggerConfig: Object.keys(triggerConfig).length > 0 ? triggerConfig : undefined,
        conditions: conditions.length > 0 ? conditions : undefined,
        actions,
        isActive: rule?.isActive ?? true,
        priority: rule?.priority ?? 0,
      });
    } finally {
      setSaving(false);
    }
  };

  const addAction = () => {
    setActions([...actions, { type: 'set_status', config: {} }]);
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const updateAction = (index: number, updates: Partial<RuleAction>) => {
    setActions(
      actions.map((a, i) => (i === index ? { ...a, ...updates } : a))
    );
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white dark:bg-gray-900 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {rule ? 'Редактировать правило' : 'Новое правило автоматизации'}
            </h3>
          </div>

          {/* Content */}
          <div className="p-6 space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Название *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Автоназначение новых заявок"
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Описание
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Опциональное описание правила"
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>

            {/* Trigger */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Когда срабатывает *
              </label>
              <select
                value={trigger}
                onChange={(e) => {
                  setTrigger(e.target.value as TriggerType);
                  setTriggerConfig({});
                }}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                {Object.entries(triggerLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Trigger Config for status change */}
            {trigger === 'on_status_change' && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Из статуса (опционально)
                  </label>
                  <select
                    value={(triggerConfig as any).fromStatus || ''}
                    onChange={(e) =>
                      setTriggerConfig({
                        ...triggerConfig,
                        fromStatus: e.target.value || undefined,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Любой</option>
                    {statuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    В статус (опционально)
                  </label>
                  <select
                    value={(triggerConfig as any).toStatus || ''}
                    onChange={(e) =>
                      setTriggerConfig({
                        ...triggerConfig,
                        toStatus: e.target.value || undefined,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Любой</option>
                    {statuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Actions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Действия *
                </label>
                <button
                  onClick={addAction}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  + Добавить действие
                </button>
              </div>
              <div className="space-y-3">
                {actions.map((action, index) => (
                  <div
                    key={index}
                    className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-3">
                        <select
                          value={action.type}
                          onChange={(e) =>
                            updateAction(index, {
                              type: e.target.value as ActionType,
                              config: {},
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        >
                          {Object.entries(actionLabels).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>

                        {/* Action config based on type */}
                        {action.type === 'set_status' && (
                          <select
                            value={action.config.status || ''}
                            onChange={(e) =>
                              updateAction(index, {
                                config: { ...action.config, status: e.target.value },
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Выберите статус</option>
                            {statuses.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        )}

                        {action.type === 'set_assignee' && (
                          <SearchableUserSelect
                            value={action.config.assigneeId || null}
                            onChange={(userId) =>
                              updateAction(index, {
                                config: { ...action.config, assigneeId: userId },
                              })
                            }
                            users={users}
                            placeholder="Выберите исполнителя"
                            emptyLabel="Выберите исполнителя"
                          />
                        )}

                        {action.type === 'set_priority' && (
                          <select
                            value={action.config.priority || ''}
                            onChange={(e) =>
                              updateAction(index, {
                                config: {
                                  ...action.config,
                                  priority: e.target.value as 'low' | 'medium' | 'high',
                                },
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Выберите приоритет</option>
                            <option value="low">Низкий</option>
                            <option value="medium">Средний</option>
                            <option value="high">Высокий</option>
                          </select>
                        )}

                        {action.type === 'send_notification' && (
                          <textarea
                            value={action.config.message || ''}
                            onChange={(e) =>
                              updateAction(index, {
                                config: { ...action.config, message: e.target.value },
                              })
                            }
                            placeholder="Текст уведомления (можно использовать {title}, {customId}, {status})"
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          />
                        )}

                        {action.type === 'evaluate_dmn' && (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                Таблица решений *
                              </label>
                              <select
                                value={action.config.decisionTableId || ''}
                                onChange={(e) =>
                                  updateAction(index, {
                                    config: { ...action.config, decisionTableId: e.target.value },
                                  })
                                }
                                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                disabled={loadingTables}
                              >
                                <option value="">
                                  {loadingTables ? 'Загрузка...' : 'Выберите таблицу'}
                                </option>
                                {decisionTables.map((table) => (
                                  <option key={table.id} value={table.id}>
                                    {table.name}
                                    {table.description && ` — ${table.description}`}
                                  </option>
                                ))}
                              </select>
                              {decisionTables.length === 0 && !loadingTables && (
                                <p className="text-xs text-gray-400 mt-1">
                                  Нет активных таблиц решений. Создайте таблицу в разделе DMN.
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`apply-output-${index}`}
                                checked={action.config.applyOutputToEntity !== false}
                                onChange={(e) =>
                                  updateAction(index, {
                                    config: { ...action.config, applyOutputToEntity: e.target.checked },
                                  })
                                }
                                className="rounded border-gray-300 dark:border-gray-600"
                              />
                              <label htmlFor={`apply-output-${index}`} className="text-sm text-gray-700 dark:text-gray-300">
                                Применить результат к заявке (статус, приоритет, поля)
                              </label>
                            </div>

                            <p className="text-xs text-gray-400">
                              Данные заявки (статус, приоритет, кастомные поля) будут переданы как входные данные.
                              Результат DMN таблицы будет применён к заявке автоматически.
                            </p>
                          </div>
                        )}
                      </div>

                      {actions.length > 1 && (
                        <button
                          onClick={() => removeAction(index)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white dark:bg-gray-900 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
