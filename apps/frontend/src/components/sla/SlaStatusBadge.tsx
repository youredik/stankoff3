'use client';

import { useState, useEffect } from 'react';
import type { SlaStatusInfo, SlaTargetType } from '@/types';
import * as slaApi from '@/lib/api/sla';

interface SlaStatusBadgeProps {
  targetType: SlaTargetType;
  targetId: string;
  showDetails?: boolean;
  className?: string;
  onPause?: () => void;
  onResume?: () => void;
}

export function SlaStatusBadge({
  targetType,
  targetId,
  showDetails = false,
  className = '',
  onPause,
  onResume,
}: SlaStatusBadgeProps) {
  const [status, setStatus] = useState<SlaStatusInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
  }, [targetType, targetId]);

  async function loadStatus() {
    try {
      setLoading(true);
      setError(null);
      const data = await slaApi.getStatus(targetType, targetId);
      setStatus(data);
    } catch (err) {
      setError('Не удалось загрузить SLA');
    } finally {
      setLoading(false);
    }
  }

  async function handlePause() {
    if (!status) return;
    try {
      await slaApi.pauseInstance(status.instanceId, 'Приостановлено пользователем');
      await loadStatus();
      onPause?.();
    } catch {
      setError('Не удалось приостановить SLA');
    }
  }

  async function handleResume() {
    if (!status) return;
    try {
      await slaApi.resumeInstance(status.instanceId);
      await loadStatus();
      onResume?.();
    } catch {
      setError('Не удалось возобновить SLA');
    }
  }

  if (loading) {
    return (
      <div className={`inline-flex items-center gap-1.5 ${className}`}>
        <div className="w-2 h-2 rounded-full bg-gray-300 animate-pulse" />
        <span className="text-xs text-gray-400">...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`inline-flex items-center gap-1.5 ${className}`}>
        <div className="w-2 h-2 rounded-full bg-red-500" />
        <span className="text-xs text-red-500">{error}</span>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  const responseColorClass = slaApi.getSlaStatusColor(
    status.responseStatus,
    status.responseUsedPercent,
  );
  const responseBgClass = slaApi.getSlaStatusBgColor(
    status.responseStatus,
    status.responseUsedPercent,
  );
  const resolutionColorClass = slaApi.getSlaStatusColor(
    status.resolutionStatus,
    status.resolutionUsedPercent,
  );
  const resolutionBgClass = slaApi.getSlaStatusBgColor(
    status.resolutionStatus,
    status.resolutionUsedPercent,
  );

  if (!showDetails) {
    const overallStatus =
      status.responseStatus === 'breached' || status.resolutionStatus === 'breached'
        ? 'breached'
        : status.responseStatus === 'met' && status.resolutionStatus === 'met'
          ? 'met'
          : 'pending';
    const overallPercent = Math.max(
      status.responseUsedPercent ?? 0,
      status.resolutionUsedPercent ?? 0,
    );
    const colorClass = slaApi.getSlaStatusColor(overallStatus, overallPercent);
    const bgClass = slaApi.getSlaStatusBgColor(overallStatus, overallPercent);

    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${bgClass} ${colorClass} ${className}`}
        title={`SLA: ${status.definitionName}`}
      >
        {status.isPaused ? (
          <>
            <PauseIcon className="w-3 h-3" />
            <span>Приостановлен</span>
          </>
        ) : (
          <>
            <ClockIcon className="w-3 h-3" />
            <span>{slaApi.formatRemainingTime(status.resolutionRemainingMinutes)}</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-gray-200 dark:border-gray-700 p-3 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {status.definitionName}
        </h4>
        {status.isPaused ? (
          <button
            onClick={handleResume}
            className="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400"
          >
            Возобновить
          </button>
        ) : (
          <button
            onClick={handlePause}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400"
          >
            Приостановить
          </button>
        )}
      </div>

      {status.isPaused && (
        <div className="mb-3 px-2 py-1.5 rounded bg-yellow-50 dark:bg-yellow-900/20 text-xs text-yellow-700 dark:text-yellow-400">
          SLA приостановлен
        </div>
      )}

      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Время ответа</span>
            <span className={`text-xs font-medium ${responseColorClass}`}>
              {status.responseStatus === 'met'
                ? 'Выполнено'
                : status.responseStatus === 'breached'
                  ? 'Нарушено'
                  : slaApi.formatRemainingTime(status.responseRemainingMinutes)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${responseBgClass.replace('bg-', 'bg-').replace('/30', '')}`}
              style={{ width: `${Math.min(status.responseUsedPercent ?? 0, 100)}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Время решения</span>
            <span className={`text-xs font-medium ${resolutionColorClass}`}>
              {status.resolutionStatus === 'met'
                ? 'Выполнено'
                : status.resolutionStatus === 'breached'
                  ? 'Нарушено'
                  : slaApi.formatRemainingTime(status.resolutionRemainingMinutes)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${resolutionBgClass.replace('bg-', 'bg-').replace('/30', '')}`}
              style={{ width: `${Math.min(status.resolutionUsedPercent ?? 0, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {(status.responseDueAt || status.resolutionDueAt) && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          {status.responseDueAt && (
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Ответ до:</span>
              <span>{new Date(status.responseDueAt).toLocaleString('ru-RU')}</span>
            </div>
          )}
          {status.resolutionDueAt && (
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Решение до:</span>
              <span>{new Date(status.resolutionDueAt).toLocaleString('ru-RU')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6" />
    </svg>
  );
}
