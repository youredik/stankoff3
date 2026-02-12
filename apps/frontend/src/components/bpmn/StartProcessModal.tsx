'use client';

import { useState, useEffect } from 'react';
import { X, Play, FileCode } from 'lucide-react';
import { bpmnApi } from '@/lib/api/bpmn';
import type { ProcessDefinition } from '@/types';

interface StartProcessModalProps {
  workspaceId: string;
  entityId?: string;
  entityTitle?: string;
  onClose: () => void;
  onStarted?: () => void;
}

export function StartProcessModal({
  workspaceId,
  entityId,
  entityTitle,
  onClose,
  onStarted,
}: StartProcessModalProps) {
  const [definitions, setDefinitions] = useState<ProcessDefinition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Load deployed process definitions
  useEffect(() => {
    const loadDefinitions = async () => {
      try {
        setIsLoading(true);
        const defs = await bpmnApi.getDefinitions(workspaceId);
        // Only show deployed definitions
        const deployed = defs.filter((d) => d.deployedKey);
        setDefinitions(deployed);
        // Auto-select default or first
        const defaultDef = deployed.find((d) => d.isDefault) || deployed[0];
        if (defaultDef) {
          setSelectedId(defaultDef.id);
        }
      } catch (err) {
        console.error('Failed to load definitions:', err);
        setError('Не удалось загрузить список процессов');
      } finally {
        setIsLoading(false);
      }
    };

    loadDefinitions();
  }, [workspaceId]);

  const handleStart = async () => {
    if (!selectedId) return;

    try {
      setIsStarting(true);
      setError(null);

      await bpmnApi.startInstance({
        definitionId: selectedId,
        entityId,
        businessKey: entityId,
        variables: entityTitle ? { entityTitle } : undefined,
      });

      onStarted?.();
      onClose();
    } catch (err) {
      console.error('Failed to start process:', err);
      setError('Не удалось запустить процесс. Проверьте подключение к Camunda.');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Запустить процесс
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {entityTitle && (
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                Для заявки
              </p>
              <p className="font-medium text-gray-900 dark:text-white">
                {entityTitle}
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full" />
            </div>
          ) : definitions.length === 0 ? (
            <div className="text-center py-8">
              <FileCode className="w-10 h-10 mx-auto text-gray-400 mb-2" />
              <p className="text-gray-600 dark:text-gray-400">
                Нет развернутых процессов
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                Создайте и разверните процесс в настройках workspace
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Выберите процесс
              </label>
              {definitions.map((def) => (
                <label
                  key={def.id}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedId === def.id
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="process"
                    value={def.id}
                    checked={selectedId === def.id}
                    onChange={() => setSelectedId(def.id)}
                    className="w-4 h-4 text-teal-600"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {def.name}
                    </p>
                    {def.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {def.description}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Версия {def.version}
                    </p>
                  </div>
                  {def.isDefault && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300 rounded">
                      По умолчанию
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleStart}
            disabled={!selectedId || isStarting || definitions.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 rounded-md transition-colors"
          >
            <Play className="w-4 h-4" />
            {isStarting ? 'Запуск...' : 'Запустить'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default StartProcessModal;
