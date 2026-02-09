'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { incidentsApi, type IncidentInfo } from '@/lib/api/incidents';

interface IncidentPanelProps {
  workspaceId: string;
  onNavigateToEntity?: (entityId: string) => void;
}

export function IncidentPanel({
  workspaceId,
  onNavigateToEntity,
}: IncidentPanelProps) {
  const [incidents, setIncidents] = useState<IncidentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchIncidents = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await incidentsApi.getIncidents(workspaceId);
      setIncidents(data);
    } catch {
      setError('Не удалось загрузить инциденты');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  const handleRetry = async (id: string) => {
    setActionLoading(id);
    try {
      await incidentsApi.retryIncident(id);
      setIncidents((prev) => prev.filter((i) => i.id !== id));
    } catch {
      console.error('Failed to retry incident');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Отменить процесс? Это действие необратимо.')) return;
    setActionLoading(id);
    try {
      await incidentsApi.cancelIncident(id);
      setIncidents((prev) => prev.filter((i) => i.id !== id));
    } catch {
      console.error('Failed to cancel incident');
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500 mb-2">{error}</p>
        <button onClick={fetchIncidents} className="text-teal-600 hover:underline text-sm">
          Попробовать снова
        </button>
      </div>
    );
  }

  if (incidents.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
        <p>Нет активных инцидентов</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Инциденты ({incidents.length})
          </h3>
        </div>
        <button
          onClick={fetchIncidents}
          className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3">
        {incidents.map((incident) => (
          <div
            key={incident.id}
            className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {incident.definitionName || incident.processDefinitionKey}
                </p>
                {incident.entityCustomId && (
                  <button
                    onClick={() => incident.entityId && onNavigateToEntity?.(incident.entityId)}
                    className="text-sm text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {incident.entityCustomId}: {incident.entityTitle}
                  </button>
                )}
              </div>
              <span className="text-xs text-gray-500">
                {formatDistanceToNow(new Date(incident.updatedAt), {
                  addSuffix: true,
                  locale: ru,
                })}
              </span>
            </div>

            {incident.errorMessage && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded px-2 py-1 mb-3 font-mono break-all">
                {incident.errorMessage}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => handleRetry(incident.id)}
                disabled={actionLoading === incident.id}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Повторить
              </button>
              <button
                onClick={() => handleCancel(incident.id)}
                disabled={actionLoading === incident.id}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
              >
                <XCircle className="w-3.5 h-3.5" />
                Отменить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default IncidentPanel;
