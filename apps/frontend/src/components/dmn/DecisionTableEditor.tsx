'use client';

import { useState } from 'react';
import type {
  DecisionTable,
  DecisionRule,
  InputColumn,
  OutputColumn,
  HitPolicy,
  RuleCondition,
  RuleOperator,
  ColumnType,
} from '@/types';
import * as dmnApi from '@/lib/api/dmn';
import type { CreateDecisionTableDto, UpdateDecisionTableDto } from '@/lib/api/dmn';

interface DecisionTableEditorProps {
  workspaceId: string;
  table?: DecisionTable;
  onSave: (table: DecisionTable) => void;
  onCancel: () => void;
}

export function DecisionTableEditor({
  workspaceId,
  table,
  onSave,
  onCancel,
}: DecisionTableEditorProps) {
  const [name, setName] = useState(table?.name || '');
  const [description, setDescription] = useState(table?.description || '');
  const [hitPolicy, setHitPolicy] = useState<HitPolicy>(table?.hitPolicy || 'FIRST');
  const [isActive, setIsActive] = useState(table?.isActive ?? true);
  const [inputColumns, setInputColumns] = useState<InputColumn[]>(
    table?.inputColumns || [{ id: dmnApi.generateColumnId(), name: 'input1', label: 'Вход 1', type: 'string' }]
  );
  const [outputColumns, setOutputColumns] = useState<OutputColumn[]>(
    table?.outputColumns || [{ id: dmnApi.generateColumnId(), name: 'output1', label: 'Выход 1', type: 'string' }]
  );
  const [rules, setRules] = useState<DecisionRule[]>(table?.rules || []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      setError('Название обязательно');
      return;
    }

    if (inputColumns.length === 0) {
      setError('Нужна хотя бы одна входная колонка');
      return;
    }

    if (outputColumns.length === 0) {
      setError('Нужна хотя бы одна выходная колонка');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const data = {
        name: name.trim(),
        description: description.trim() || undefined,
        hitPolicy,
        isActive,
        inputColumns,
        outputColumns,
        rules,
      };

      let result: DecisionTable;
      if (table) {
        result = await dmnApi.updateTable(table.id, data as UpdateDecisionTableDto);
      } else {
        result = await dmnApi.createTable({ ...data, workspaceId } as CreateDecisionTableDto);
      }

      onSave(result);
    } catch {
      setError('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  function addInputColumn() {
    const num = inputColumns.length + 1;
    setInputColumns([
      ...inputColumns,
      { id: dmnApi.generateColumnId(), name: `input${num}`, label: `Вход ${num}`, type: 'string' },
    ]);
  }

  function updateInputColumn(index: number, updates: Partial<InputColumn>) {
    setInputColumns(inputColumns.map((col, i) => (i === index ? { ...col, ...updates } : col)));
  }

  function removeInputColumn(index: number) {
    const colId = inputColumns[index].id;
    setInputColumns(inputColumns.filter((_, i) => i !== index));
    setRules(
      rules.map((rule) => {
        const inputs = { ...rule.inputs };
        delete inputs[colId];
        return { ...rule, inputs };
      })
    );
  }

  function addOutputColumn() {
    const num = outputColumns.length + 1;
    setOutputColumns([
      ...outputColumns,
      { id: dmnApi.generateColumnId(), name: `output${num}`, label: `Выход ${num}`, type: 'string' },
    ]);
  }

  function updateOutputColumn(index: number, updates: Partial<OutputColumn>) {
    setOutputColumns(outputColumns.map((col, i) => (i === index ? { ...col, ...updates } : col)));
  }

  function removeOutputColumn(index: number) {
    const colId = outputColumns[index].id;
    setOutputColumns(outputColumns.filter((_, i) => i !== index));
    setRules(
      rules.map((rule) => {
        const outputs = { ...rule.outputs };
        delete outputs[colId];
        return { ...rule, outputs };
      })
    );
  }

  function addRule() {
    const inputs: Record<string, RuleCondition> = {};
    for (const col of inputColumns) {
      inputs[col.id] = { operator: 'any', value: null };
    }
    const outputs: Record<string, unknown> = {};
    for (const col of outputColumns) {
      outputs[col.id] = col.defaultValue ?? null;
    }
    setRules([...rules, { id: dmnApi.generateRuleId(), inputs, outputs }]);
  }

  function updateRuleCondition(ruleIndex: number, colId: string, updates: Partial<RuleCondition>) {
    setRules(
      rules.map((rule, i) => {
        if (i !== ruleIndex) return rule;
        return {
          ...rule,
          inputs: {
            ...rule.inputs,
            [colId]: { ...rule.inputs[colId], ...updates },
          },
        };
      })
    );
  }

  function updateRuleOutput(ruleIndex: number, colId: string, value: unknown) {
    setRules(
      rules.map((rule, i) => {
        if (i !== ruleIndex) return rule;
        return {
          ...rule,
          outputs: { ...rule.outputs, [colId]: value },
        };
      })
    );
  }

  function removeRule(index: number) {
    setRules(rules.filter((_, i) => i !== index));
  }

  function moveRule(index: number, direction: 'up' | 'down') {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= rules.length) return;
    const newRules = [...rules];
    [newRules[index], newRules[newIndex]] = [newRules[newIndex], newRules[index]];
    setRules(newRules);
  }

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
            placeholder="Например: Расчёт скидки"
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
            Политика выбора
          </label>
          <select
            value={hitPolicy}
            onChange={(e) => setHitPolicy(e.target.value as HitPolicy)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          >
            <option value="FIRST">Первое совпадение</option>
            <option value="UNIQUE">Уникальное</option>
            <option value="ANY">Любое</option>
            <option value="COLLECT">Собрать все</option>
            <option value="RULE_ORDER">По порядку</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">{dmnApi.getHitPolicyDescription(hitPolicy)}</p>
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
            Активна
          </label>
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Входные колонки</h4>
          <button
            type="button"
            onClick={addInputColumn}
            className="text-xs text-teal-600 hover:text-teal-700"
          >
            + Добавить
          </button>
        </div>

        <div className="space-y-2">
          {inputColumns.map((col, index) => (
            <div key={col.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <input
                type="text"
                value={col.name}
                onChange={(e) => updateInputColumn(index, { name: e.target.value })}
                placeholder="Имя"
                className="w-24 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              />
              <input
                type="text"
                value={col.label}
                onChange={(e) => updateInputColumn(index, { label: e.target.value })}
                placeholder="Метка"
                className="flex-1 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              />
              <select
                value={col.type}
                onChange={(e) => updateInputColumn(index, { type: e.target.value as ColumnType })}
                className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              >
                <option value="string">Строка</option>
                <option value="number">Число</option>
                <option value="boolean">Логический</option>
                <option value="date">Дата</option>
              </select>
              <button
                type="button"
                onClick={() => removeInputColumn(index)}
                disabled={inputColumns.length <= 1}
                className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Выходные колонки</h4>
          <button
            type="button"
            onClick={addOutputColumn}
            className="text-xs text-teal-600 hover:text-teal-700"
          >
            + Добавить
          </button>
        </div>

        <div className="space-y-2">
          {outputColumns.map((col, index) => (
            <div key={col.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <input
                type="text"
                value={col.name}
                onChange={(e) => updateOutputColumn(index, { name: e.target.value })}
                placeholder="Имя"
                className="w-24 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              />
              <input
                type="text"
                value={col.label}
                onChange={(e) => updateOutputColumn(index, { label: e.target.value })}
                placeholder="Метка"
                className="flex-1 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              />
              <select
                value={col.type}
                onChange={(e) => updateOutputColumn(index, { type: e.target.value as ColumnType })}
                className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              >
                <option value="string">Строка</option>
                <option value="number">Число</option>
                <option value="boolean">Логический</option>
                <option value="date">Дата</option>
              </select>
              <input
                type="text"
                value={col.defaultValue !== undefined ? String(col.defaultValue) : ''}
                onChange={(e) => updateOutputColumn(index, { defaultValue: e.target.value || undefined })}
                placeholder="По умолчанию"
                className="w-24 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              />
              <button
                type="button"
                onClick={() => removeOutputColumn(index)}
                disabled={outputColumns.length <= 1}
                className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Правила ({rules.length})
          </h4>
          <button type="button" onClick={addRule} className="text-xs text-teal-600 hover:text-teal-700">
            + Добавить правило
          </button>
        </div>

        {rules.length === 0 ? (
          <p className="text-xs text-gray-500">Нет правил. Добавьте хотя бы одно.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-2 py-1 text-left text-xs text-gray-500">#</th>
                  {inputColumns.map((col) => (
                    <th key={col.id} className="px-2 py-1 text-left text-xs text-blue-600 dark:text-blue-400">
                      {col.label}
                    </th>
                  ))}
                  {outputColumns.map((col) => (
                    <th key={col.id} className="px-2 py-1 text-left text-xs text-green-600 dark:text-green-400">
                      {col.label}
                    </th>
                  ))}
                  <th className="px-2 py-1"></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule, ruleIndex) => (
                  <tr key={rule.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="px-2 py-1 text-xs text-gray-400">{ruleIndex + 1}</td>
                    {inputColumns.map((col) => (
                      <td key={col.id} className="px-1 py-1">
                        <ConditionEditor
                          condition={rule.inputs[col.id] || { operator: 'any', value: null }}
                          columnType={col.type}
                          onChange={(updates) => updateRuleCondition(ruleIndex, col.id, updates)}
                        />
                      </td>
                    ))}
                    {outputColumns.map((col) => (
                      <td key={col.id} className="px-1 py-1">
                        <input
                          type="text"
                          value={rule.outputs[col.id] !== undefined ? String(rule.outputs[col.id]) : ''}
                          onChange={(e) => updateRuleOutput(ruleIndex, col.id, e.target.value)}
                          className="w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => moveRule(ruleIndex, 'up')}
                        disabled={ruleIndex === 0}
                        className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <ChevronUpIcon className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveRule(ruleIndex, 'down')}
                        disabled={ruleIndex === rules.length - 1}
                        className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <ChevronDownIcon className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRule(ruleIndex)}
                        className="p-0.5 text-gray-400 hover:text-red-500"
                      >
                        <XIcon className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          {saving ? 'Сохранение...' : table ? 'Сохранить' : 'Создать'}
        </button>
      </div>
    </form>
  );
}

interface ConditionEditorProps {
  condition: RuleCondition;
  columnType: ColumnType;
  onChange: (updates: Partial<RuleCondition>) => void;
}

function ConditionEditor({ condition, columnType, onChange }: ConditionEditorProps) {
  const operators: { value: RuleOperator; label: string }[] = [
    { value: 'any', label: '*' },
    { value: 'eq', label: '=' },
    { value: 'neq', label: '≠' },
    ...(columnType === 'number'
      ? [
          { value: 'gt' as RuleOperator, label: '>' },
          { value: 'gte' as RuleOperator, label: '≥' },
          { value: 'lt' as RuleOperator, label: '<' },
          { value: 'lte' as RuleOperator, label: '≤' },
          { value: 'between' as RuleOperator, label: '⟷' },
        ]
      : []),
    { value: 'in', label: '∈' },
    { value: 'contains', label: '⊃' },
  ];

  return (
    <div className="flex items-center gap-1">
      <select
        value={condition.operator}
        onChange={(e) => onChange({ operator: e.target.value as RuleOperator })}
        className="w-10 px-1 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
      >
        {operators.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>
      {condition.operator !== 'any' && (
        <>
          <input
            type="text"
            value={condition.value !== null && condition.value !== undefined ? String(condition.value) : ''}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="значение"
            className="w-16 px-1 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
          />
          {condition.operator === 'between' && (
            <>
              <span className="text-xs text-gray-400">-</span>
              <input
                type="text"
                value={condition.value2 !== null && condition.value2 !== undefined ? String(condition.value2) : ''}
                onChange={(e) => onChange({ value2: e.target.value })}
                placeholder="до"
                className="w-16 px-1 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
