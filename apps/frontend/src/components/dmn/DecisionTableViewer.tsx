'use client';

import { useState } from 'react';
import type { DecisionTable, EvaluationOutput } from '@/types';
import * as dmnApi from '@/lib/api/dmn';

interface DecisionTableViewerProps {
  table: DecisionTable;
  onEdit?: () => void;
  onClone?: () => void;
  onDelete?: () => void;
  className?: string;
}

export function DecisionTableViewer({
  table,
  onEdit,
  onClone,
  onDelete,
  className = '',
}: DecisionTableViewerProps) {
  const [testInputs, setTestInputs] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<EvaluationOutput | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [statistics, setStatistics] = useState<dmnApi.DecisionTableStatistics | null>(null);

  async function handleTest() {
    try {
      setTesting(true);
      setError(null);

      const inputData: Record<string, unknown> = {};
      for (const col of table.inputColumns) {
        const value = testInputs[col.name];
        if (col.type === 'number' && value) {
          inputData[col.name] = parseFloat(value);
        } else if (col.type === 'boolean' && value) {
          inputData[col.name] = value === 'true';
        } else {
          inputData[col.name] = value || null;
        }
      }

      const result = await dmnApi.evaluate({
        decisionTableId: table.id,
        inputData,
        triggeredBy: 'manual',
      });

      setTestResult(result.output);
    } catch {
      setError('Ошибка при вычислении');
    } finally {
      setTesting(false);
    }
  }

  async function loadStatistics() {
    try {
      const stats = await dmnApi.getStatistics(table.id);
      setStatistics(stats);
      setShowHistory(true);
    } catch {
      setError('Не удалось загрузить статистику');
    }
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                {table.name}
              </h3>
              <span
                className={`px-2 py-0.5 rounded-full text-xs ${
                  table.isActive
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                }`}
              >
                {table.isActive ? 'Активна' : 'Неактивна'}
              </span>
              <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs">
                {dmnApi.getHitPolicyLabel(table.hitPolicy)}
              </span>
            </div>
            {table.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {table.description}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Версия {table.version} • {table.rules.length} правил
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                onClick={onEdit}
                className="px-3 py-1.5 text-sm text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg"
              >
                Редактировать
              </button>
            )}
            {onClone && (
              <button
                onClick={onClone}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 rounded-lg"
              >
                Клонировать
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
              >
                Удалить
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                #
              </th>
              {table.inputColumns.map((col) => (
                <th
                  key={col.id}
                  className="px-3 py-2 text-left text-xs font-medium text-blue-600 dark:text-blue-400"
                >
                  <div>{col.label}</div>
                  <div className="text-gray-400 font-normal">{dmnApi.getColumnTypeLabel(col.type)}</div>
                </th>
              ))}
              {table.outputColumns.map((col) => (
                <th
                  key={col.id}
                  className="px-3 py-2 text-left text-xs font-medium text-green-600 dark:text-green-400"
                >
                  <div>{col.label}</div>
                  <div className="text-gray-400 font-normal">{dmnApi.getColumnTypeLabel(col.type)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rules.map((rule, index) => {
              const isMatched = testResult?.results.find((r) => r.ruleId === rule.id)?.matched;
              return (
                <tr
                  key={rule.id}
                  className={`border-b border-gray-100 dark:border-gray-800 ${
                    isMatched ? 'bg-green-50 dark:bg-green-900/10' : ''
                  }`}
                >
                  <td className="px-3 py-2 text-xs text-gray-400">{index + 1}</td>
                  {table.inputColumns.map((col) => {
                    const condition = rule.inputs[col.id];
                    return (
                      <td key={col.id} className="px-3 py-2 text-gray-900 dark:text-gray-100">
                        {condition ? formatCondition(condition) : '-'}
                      </td>
                    );
                  })}
                  {table.outputColumns.map((col) => (
                    <td key={col.id} className="px-3 py-2 text-gray-900 dark:text-gray-100">
                      {rule.outputs[col.id] !== undefined ? String(rule.outputs[col.id]) : '-'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Тестирование
        </h4>

        {error && (
          <div className="mb-3 p-2 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          {table.inputColumns.map((col) => (
            <div key={col.id}>
              <label className="block text-xs text-gray-500 mb-1">{col.label}</label>
              {col.type === 'boolean' ? (
                <select
                  value={testInputs[col.name] || ''}
                  onChange={(e) => setTestInputs({ ...testInputs, [col.name]: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                >
                  <option value="">-</option>
                  <option value="true">Да</option>
                  <option value="false">Нет</option>
                </select>
              ) : (
                <input
                  type={col.type === 'number' ? 'number' : 'text'}
                  value={testInputs[col.name] || ''}
                  onChange={(e) => setTestInputs({ ...testInputs, [col.name]: e.target.value })}
                  placeholder={col.name}
                  className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleTest}
            disabled={testing || !table.isActive}
            className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
          >
            {testing ? 'Вычисление...' : 'Вычислить'}
          </button>
          <button
            onClick={loadStatistics}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 rounded-lg"
          >
            Статистика
          </button>
        </div>

        {testResult && (
          <div className="mt-4 p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Результат
              </span>
              <span className="text-xs text-gray-500">
                {testResult.matchedCount} правил сработало • {testResult.evaluationTimeMs}мс
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(testResult.finalOutput).map(([key, value]) => (
                <div key={key} className="p-2 bg-green-50 dark:bg-green-900/20 rounded">
                  <div className="text-xs text-gray-500">{key}</div>
                  <div className="text-sm font-medium text-green-700 dark:text-green-400">
                    {Array.isArray(value) ? value.join(', ') : String(value)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showHistory && statistics && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Статистика
            </h4>
            <button
              onClick={() => setShowHistory(false)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Скрыть
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {statistics.totalEvaluations}
              </div>
              <div className="text-xs text-gray-500">Всего вычислений</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {statistics.avgEvaluationTime.toFixed(1)}мс
              </div>
              <div className="text-xs text-gray-500">Среднее время</div>
            </div>
          </div>

          {Object.keys(statistics.ruleHitCounts).length > 0 && (
            <div>
              <h5 className="text-xs font-medium text-gray-500 mb-2">Срабатывания правил</h5>
              <div className="space-y-1">
                {table.rules.map((rule, index) => {
                  const count = statistics.ruleHitCounts[rule.id] || 0;
                  const maxCount = Math.max(...Object.values(statistics.ruleHitCounts), 1);
                  const percent = (count / maxCount) * 100;
                  return (
                    <div key={rule.id} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-6">#{index + 1}</span>
                      <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                        <div
                          className="h-full bg-teal-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 dark:text-gray-400 w-12 text-right">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatCondition(condition: { operator: string; value: unknown; value2?: unknown }): string {
  const { operator, value, value2 } = condition;

  if (operator === 'any') return '*';

  const opLabel = dmnApi.getOperatorLabel(operator);
  const val = value !== null && value !== undefined ? String(value) : '';

  if (operator === 'between') {
    return `${val} - ${value2 !== null && value2 !== undefined ? String(value2) : ''}`;
  }

  if (operator === 'in' || operator === 'not_in') {
    return `${opLabel} [${Array.isArray(value) ? value.join(', ') : val}]`;
  }

  return `${opLabel} ${val}`;
}
