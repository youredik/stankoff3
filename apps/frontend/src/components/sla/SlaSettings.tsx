'use client';

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { SlaDefinition } from '@/types';
import * as slaApi from '@/lib/api/sla';
import { SlaDashboard } from './SlaDashboard';
import { SlaDefinitionForm } from './SlaDefinitionForm';

interface SlaSettingsProps {
  workspaceId: string;
}

export function SlaSettings({ workspaceId }: SlaSettingsProps) {
  const [definitions, setDefinitions] = useState<SlaDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingDefinition, setEditingDefinition] = useState<SlaDefinition | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadDefinitions();
  }, [workspaceId]);

  async function loadDefinitions() {
    try {
      setLoading(true);
      setError(null);
      const data = await slaApi.getDefinitions(workspaceId);
      setDefinitions(data);
    } catch {
      setError('Не удалось загрузить определения SLA');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Удалить определение SLA?')) return;
    try {
      await slaApi.deleteDefinition(id);
      setDefinitions(definitions.filter((d) => d.id !== id));
    } catch {
      setError('Не удалось удалить');
    }
  }

  function handleSave(definition: SlaDefinition) {
    if (editingDefinition) {
      setDefinitions(definitions.map((d) => (d.id === definition.id ? definition : d)));
    } else {
      setDefinitions([...definitions, definition]);
    }
    setShowForm(false);
    setEditingDefinition(null);
  }

  function handleEdit(definition: SlaDefinition) {
    setEditingDefinition(definition);
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingDefinition(null);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <SlaDashboard
        workspaceId={workspaceId}
        onDefinitionClick={handleEdit}
      />

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Определения SLA
          </h3>
          <button
            onClick={() => {
              setEditingDefinition(null);
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700"
          >
            <Plus className="w-4 h-4" />
            Добавить
          </button>
        </div>

        {showForm ? (
          <div className="p-4">
            <SlaDefinitionForm
              workspaceId={workspaceId}
              definition={editingDefinition || undefined}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          </div>
        ) : definitions.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            Нет определений SLA. Создайте первое определение.
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {definitions.map((def) => (
              <div
                key={def.id}
                className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {def.name}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        def.isActive
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                      }`}
                    >
                      {def.isActive ? 'Активен' : 'Неактивен'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Ответ: {def.responseTime}м • Решение: {def.resolutionTime}м •{' '}
                    {def.businessHoursOnly ? 'Рабочие часы' : '24/7'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(def)}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(def.id)}
                    className="p-2 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
