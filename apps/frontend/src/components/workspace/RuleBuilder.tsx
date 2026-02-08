'use client';

import { useState } from 'react';
import { Plus, Trash2, Eye, AlertCircle, Calculator } from 'lucide-react';
import type { Field, FieldRule, FieldRuleCondition, FieldRuleType, FieldRuleOperator } from '@/types';
import { validateFormula, extractFieldRefs } from '@/lib/rules/formula-parser';

interface RuleBuilderProps {
  rules: FieldRule[];
  allFields: Field[];
  onChange: (rules: FieldRule[]) => void;
}

const RULE_TYPE_LABELS: Record<FieldRuleType, { label: string; icon: typeof Eye }> = {
  visibility: { label: 'Видимость', icon: Eye },
  required_if: { label: 'Обязательность', icon: AlertCircle },
  computed: { label: 'Вычисляемое', icon: Calculator },
};

const OPERATOR_LABELS: Record<FieldRuleOperator, string> = {
  eq: 'равно',
  neq: 'не равно',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
  in: 'одно из',
  not_in: 'не одно из',
  is_empty: 'пусто',
  is_not_empty: 'не пусто',
  contains: 'содержит',
};

// Операторы, не требующие значения
const VALUELESS_OPERATORS: FieldRuleOperator[] = ['is_empty', 'is_not_empty'];

export function RuleBuilder({ rules, allFields, onChange }: RuleBuilderProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const addRule = () => {
    const newRule: FieldRule = {
      id: `rule-${Date.now()}`,
      type: 'visibility',
      condition: {
        fieldId: allFields[0]?.id || '',
        operator: 'eq',
        value: '',
      },
      action: {
        visible: false,
      },
    };
    onChange([...rules, newRule]);
    setExpandedIdx(rules.length);
  };

  const updateRule = (idx: number, updates: Partial<FieldRule>) => {
    onChange(rules.map((r, i) => (i === idx ? { ...r, ...updates } : r)));
  };

  const removeRule = (idx: number) => {
    onChange(rules.filter((_, i) => i !== idx));
    setExpandedIdx(null);
  };

  const updateCondition = (idx: number, updates: Partial<FieldRuleCondition>) => {
    const rule = rules[idx];
    updateRule(idx, {
      condition: { ...rule.condition, ...updates },
    });
  };

  return (
    <div className="space-y-2">
      {rules.map((rule, idx) => {
        const isExpanded = expandedIdx === idx;
        const typeInfo = RULE_TYPE_LABELS[rule.type];
        const condField = allFields.find((f) => f.id === rule.condition.fieldId);

        return (
          <div
            key={rule.id}
            className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
          >
            {/* Header */}
            <button
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 text-left"
            >
              <typeInfo.icon className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {typeInfo.label}
              </span>
              {condField && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  — если «{condField.name}» {OPERATOR_LABELS[rule.condition.operator]}
                  {!VALUELESS_OPERATORS.includes(rule.condition.operator) && ` "${rule.condition.value}"`}
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); removeRule(idx); }}
                className="ml-auto p-1 text-gray-400 hover:text-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </button>

            {/* Body */}
            {isExpanded && (
              <div className="p-3 space-y-3 border-t border-gray-200 dark:border-gray-700">
                {/* Rule type */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Тип</label>
                  <select
                    value={rule.type}
                    onChange={(e) => {
                      const type = e.target.value as FieldRuleType;
                      const action = type === 'visibility'
                        ? { visible: false }
                        : type === 'computed'
                          ? { formula: '' }
                          : { required: true };
                      updateRule(idx, { type, action });
                    }}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-200"
                  >
                    <option value="visibility">Видимость</option>
                    <option value="required_if">Обязательность</option>
                    <option value="computed">Вычисляемое</option>
                  </select>
                </div>

                {/* Computed: формула */}
                {rule.type === 'computed' && (
                  <ComputedFormulaEditor
                    formula={rule.action.formula || ''}
                    allFields={allFields}
                    onChange={(formula) => updateRule(idx, { action: { formula } })}
                  />
                )}

                {/* Condition (не для computed) */}
                {rule.type !== 'computed' && (
                  <>
                    {/* Condition: field */}
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Когда поле
                      </label>
                      <select
                        value={rule.condition.fieldId}
                        onChange={(e) => updateCondition(idx, { fieldId: e.target.value })}
                        className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-200"
                      >
                        {allFields.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Condition: operator */}
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Оператор
                      </label>
                      <select
                        value={rule.condition.operator}
                        onChange={(e) => updateCondition(idx, { operator: e.target.value as FieldRuleOperator })}
                        className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-200"
                      >
                        {(Object.keys(OPERATOR_LABELS) as FieldRuleOperator[]).map((op) => (
                          <option key={op} value={op}>
                            {OPERATOR_LABELS[op]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Condition: value (not for is_empty/is_not_empty) */}
                    {!VALUELESS_OPERATORS.includes(rule.condition.operator) && (
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                          Значение
                        </label>
                        {/* Если поле-условие это select/status — показываем dropdown */}
                        {condField && (condField.type === 'select' || condField.type === 'status') && condField.options ? (
                          <select
                            value={rule.condition.value ?? ''}
                            onChange={(e) => updateCondition(idx, { value: e.target.value })}
                            className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-200"
                          >
                            <option value="">Выберите...</option>
                            {condField.options.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : condField?.type === 'checkbox' ? (
                          <select
                            value={String(rule.condition.value ?? '')}
                            onChange={(e) => updateCondition(idx, { value: e.target.value === 'true' })}
                            className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-200"
                          >
                            <option value="true">Да</option>
                            <option value="false">Нет</option>
                          </select>
                        ) : (
                          <input
                            type={condField?.type === 'number' ? 'number' : 'text'}
                            value={rule.condition.value ?? ''}
                            onChange={(e) => updateCondition(idx, {
                              value: condField?.type === 'number' ? Number(e.target.value) : e.target.value,
                            })}
                            placeholder="Значение..."
                            className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-200"
                          />
                        )}
                      </div>
                    )}

                    {/* Action */}
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Тогда
                      </label>
                      {rule.type === 'visibility' && (
                        <select
                          value={rule.action.visible ? 'show' : 'hide'}
                          onChange={(e) => updateRule(idx, { action: { visible: e.target.value === 'show' } })}
                          className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-200"
                        >
                          <option value="hide">Скрыть поле</option>
                          <option value="show">Показать поле</option>
                        </select>
                      )}
                      {rule.type === 'required_if' && (
                        <div className="text-sm text-gray-600 dark:text-gray-400 px-2 py-1.5">
                          Сделать поле обязательным
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={addRule}
        className="flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
      >
        <Plus className="w-3.5 h-3.5" />
        Добавить правило
      </button>
    </div>
  );
}

// Компонент редактора формулы для computed правил
function ComputedFormulaEditor({
  formula,
  allFields,
  onChange,
}: {
  formula: string;
  allFields: Field[];
  onChange: (formula: string) => void;
}) {
  const error = formula ? validateFormula(formula) : null;
  const refs = formula ? extractFieldRefs(formula) : [];
  const unknownRefs = refs.filter((r) => !allFields.some((f) => f.id === r));

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
          Формула
        </label>
        <textarea
          value={formula}
          onChange={(e) => onChange(e.target.value)}
          placeholder="{price} * {quantity}"
          rows={2}
          className={`w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 font-mono ${
            error
              ? 'border-red-300 dark:border-red-700 focus:ring-red-500'
              : 'border-gray-200 dark:border-gray-700 focus:ring-primary-500'
          } focus:outline-none focus:ring-1`}
        />
        {error && (
          <p className="text-xs text-red-500 mt-0.5">{error}</p>
        )}
        {unknownRefs.length > 0 && (
          <p className="text-xs text-amber-500 mt-0.5">
            Неизвестные поля: {unknownRefs.map((r) => `{${r}}`).join(', ')}
          </p>
        )}
      </div>
      <div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Доступные поля:</p>
        <div className="flex flex-wrap gap-1">
          {allFields.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onChange(formula + `{${f.id}}`)}
              className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-xs hover:bg-gray-200 dark:hover:bg-gray-700 font-mono"
            >
              {f.name}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
          Функции: round(), ceil(), floor(), abs(), min(), max(), sum()
        </p>
      </div>
    </div>
  );
}
