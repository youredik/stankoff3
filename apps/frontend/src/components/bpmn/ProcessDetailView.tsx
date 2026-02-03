'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Edit, Upload, BarChart3 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { ProcessStatisticsCard } from './ProcessStatisticsCard';
import { bpmnApi } from '@/lib/api/bpmn';
import type { ProcessDefinition, ProcessDefinitionStatistics } from '@/types';

// Dynamic imports for browser-only components
const BpmnHeatMap = dynamic(() => import('./BpmnHeatMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] flex items-center justify-center bg-gray-100 dark:bg-gray-800">
      <span className="text-gray-500">Загрузка диаграммы...</span>
    </div>
  ),
});

interface ProcessDetailViewProps {
  definition: ProcessDefinition;
  onBack: () => void;
  onEdit: () => void;
  onDeploy: () => void;
  isDeploying?: boolean;
  canDeploy?: boolean;
}

export function ProcessDetailView({
  definition,
  onBack,
  onEdit,
  onDeploy,
  isDeploying = false,
  canDeploy = true,
}: ProcessDetailViewProps) {
  const [statistics, setStatistics] = useState<ProcessDefinitionStatistics | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Load statistics
  useEffect(() => {
    if (!definition.deployedKey) {
      setStatistics(null);
      setIsLoadingStats(false);
      return;
    }

    const loadStats = async () => {
      setIsLoadingStats(true);
      try {
        const stats = await bpmnApi.getDefinitionStatistics(definition.id);
        setStatistics(stats);
      } catch (err) {
        console.error('Failed to load statistics:', err);
        setStatistics(null);
      } finally {
        setIsLoadingStats(false);
      }
    };

    loadStats();
  }, [definition.id, definition.deployedKey]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {definition.name}
            </h2>
            {definition.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {definition.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {definition.deployedKey ? (
            <span className="px-3 py-1 text-sm font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 rounded-full">
              Версия {definition.version}
            </span>
          ) : (
            <span className="px-3 py-1 text-sm font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 rounded-full">
              Черновик
            </span>
          )}

          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
          >
            <Edit className="w-4 h-4" />
            Редактировать
          </button>

          {!definition.deployedKey && canDeploy && (
            <button
              onClick={onDeploy}
              disabled={isDeploying}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-md transition-colors"
            >
              <Upload className="w-4 h-4" />
              {isDeploying ? 'Развертывание...' : 'Развернуть'}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Heat Map */}
        <div className="flex-1 min-w-0">
          <BpmnHeatMap
            xml={definition.bpmnXml}
            statistics={statistics}
            className="h-full"
          />
        </div>

        {/* Sidebar with statistics */}
        <div className="w-80 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-y-auto p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-teal-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Аналитика
            </h3>
          </div>

          {definition.deployedKey ? (
            <ProcessStatisticsCard
              statistics={statistics}
              isLoading={isLoadingStats}
            />
          ) : (
            <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-center">
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Разверните процесс, чтобы увидеть статистику
              </p>
            </div>
          )}

          {/* Process info */}
          <div className="mt-4 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase">
              Информация
            </h4>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">Process ID</dt>
                <dd className="font-mono text-gray-900 dark:text-white">
                  {definition.processId}
                </dd>
              </div>
              {definition.deployedKey && (
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Key</dt>
                  <dd className="font-mono text-gray-900 dark:text-white truncate max-w-[150px]">
                    {definition.deployedKey}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">Версия</dt>
                <dd className="text-gray-900 dark:text-white">
                  {definition.version}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProcessDetailView;
