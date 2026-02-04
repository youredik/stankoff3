'use client';

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Copy, ChevronRight } from 'lucide-react';
import type { DecisionTable } from '@/types';
import * as dmnApi from '@/lib/api/dmn';
import { DecisionTableEditor } from './DecisionTableEditor';
import { DecisionTableViewer } from './DecisionTableViewer';

interface DmnSettingsProps {
  workspaceId: string;
}

export function DmnSettings({ workspaceId }: DmnSettingsProps) {
  const [tables, setTables] = useState<DecisionTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTable, setEditingTable] = useState<DecisionTable | null>(null);
  const [viewingTable, setViewingTable] = useState<DecisionTable | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadTables();
  }, [workspaceId]);

  async function loadTables() {
    try {
      setLoading(true);
      setError(null);
      const data = await dmnApi.getTables(workspaceId);
      setTables(data);
    } catch {
      setError('Не удалось загрузить таблицы решений');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Удалить таблицу решений?')) return;
    try {
      await dmnApi.deleteTable(id);
      setTables(tables.filter((t) => t.id !== id));
      if (viewingTable?.id === id) {
        setViewingTable(null);
      }
    } catch {
      setError('Не удалось удалить');
    }
  }

  async function handleClone(table: DecisionTable) {
    const newName = prompt('Название копии:', `${table.name} (копия)`);
    if (!newName) return;
    try {
      const cloned = await dmnApi.cloneTable(table.id, newName);
      setTables([...tables, cloned]);
    } catch {
      setError('Не удалось клонировать');
    }
  }

  function handleSave(table: DecisionTable) {
    if (editingTable) {
      setTables(tables.map((t) => (t.id === table.id ? table : t)));
      if (viewingTable?.id === table.id) {
        setViewingTable(table);
      }
    } else {
      setTables([...tables, table]);
    }
    setShowForm(false);
    setEditingTable(null);
  }

  function handleEdit(table: DecisionTable) {
    setEditingTable(table);
    setShowForm(true);
    setViewingTable(null);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingTable(null);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {viewingTable ? (
        <div>
          <button
            onClick={() => setViewingTable(null)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 mb-4"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            Назад к списку
          </button>
          <DecisionTableViewer
            table={viewingTable}
            onEdit={() => handleEdit(viewingTable)}
            onClone={() => handleClone(viewingTable)}
            onDelete={() => handleDelete(viewingTable.id)}
          />
        </div>
      ) : showForm ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            {editingTable ? 'Редактирование таблицы' : 'Новая таблица решений'}
          </h3>
          <DecisionTableEditor
            workspaceId={workspaceId}
            table={editingTable || undefined}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              Таблицы решений
            </h3>
            <button
              onClick={() => {
                setEditingTable(null);
                setShowForm(true);
              }}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700"
            >
              <Plus className="w-4 h-4" />
              Создать
            </button>
          </div>

          {tables.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              Нет таблиц решений. Создайте первую таблицу.
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {tables.map((table) => (
                <div
                  key={table.id}
                  className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <button
                    onClick={() => setViewingTable(table)}
                    className="flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {table.name}
                      </span>
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
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {table.inputColumns.length} входов • {table.outputColumns.length} выходов •{' '}
                      {table.rules.length} правил • v{table.version}
                    </p>
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClone(table);
                      }}
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Клонировать"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(table);
                      }}
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Редактировать"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(table.id);
                      }}
                      className="p-2 text-gray-400 hover:text-red-500"
                      title="Удалить"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
