'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Plus,
  Play,
  Upload,
  MoreVertical,
  FileCode,
  CheckCircle,
  Clock,
} from 'lucide-react';
import type { ProcessDefinition } from '@/types';

interface ProcessListProps {
  definitions: ProcessDefinition[];
  onSelect: (definition: ProcessDefinition) => void;
  onCreateNew: () => void;
  onDeploy: (id: string) => Promise<void>;
  onStartInstance?: (definitionId: string) => void;
  isLoading?: boolean;
}

export function ProcessList({
  definitions,
  onSelect,
  onCreateNew,
  onDeploy,
  onStartInstance,
  isLoading = false,
}: ProcessListProps) {
  const [deployingId, setDeployingId] = useState<string | null>(null);

  const handleDeploy = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeployingId(id);
    try {
      await onDeploy(id);
    } finally {
      setDeployingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Бизнес-процессы
        </h2>
        <button
          onClick={onCreateNew}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md transition-colors"
        >
          <Plus className="w-4 h-4" />
          Создать процесс
        </button>
      </div>

      {/* List */}
      {definitions.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <FileCode className="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Нет созданных процессов
          </p>
          <button
            onClick={onCreateNew}
            className="text-teal-600 hover:text-teal-700 font-medium"
          >
            Создать первый процесс
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {definitions.map((def) => (
            <div
              key={def.id}
              onClick={() => onSelect(def)}
              className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:border-teal-300 dark:hover:border-teal-600 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="p-2 bg-teal-100 dark:bg-teal-900 rounded-lg">
                  <FileCode className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">
                    {def.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {def.description || `ID: ${def.processId}`}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>Версия {def.version}</span>
                    {def.createdAt && (
                      <span>
                        Создан{' '}
                        {format(new Date(def.createdAt), 'd MMM yyyy', {
                          locale: ru,
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Deploy status */}
                {def.deployedKey ? (
                  <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 rounded">
                    <CheckCircle className="w-3 h-3" />
                    Развернуто
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 rounded">
                    <Clock className="w-3 h-3" />
                    Черновик
                  </span>
                )}

                {/* Actions */}
                {!def.deployedKey && (
                  <button
                    onClick={(e) => handleDeploy(def.id, e)}
                    disabled={deployingId === def.id}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors disabled:opacity-50"
                    title="Развернуть"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                )}

                {def.deployedKey && onStartInstance && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartInstance(def.id);
                    }}
                    className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                    title="Запустить экземпляр"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProcessList;
