'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSlaStore, SlaUpdate } from '@/store/useSlaStore';
import * as slaApi from '@/lib/api/sla';

interface SlaTimerProps {
  targetId: string;
  showResponse?: boolean;
  showResolution?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * Real-time SLA timer component that shows countdown
 * Uses WebSocket updates for live data, with client-side interpolation
 */
export function SlaTimer({
  targetId,
  showResponse = false,
  showResolution = true,
  compact = true,
  className = '',
}: SlaTimerProps) {
  const [localUpdate, setLocalUpdate] = useState<SlaUpdate | null>(null);
  const [clientSeconds, setClientSeconds] = useState(0);
  const storeUpdate = useSlaStore((state) => state.updates.get(targetId));
  const lastUpdateTime = useSlaStore((state) => state.lastUpdateTime);

  // Update local state when store updates
  useEffect(() => {
    if (storeUpdate) {
      setLocalUpdate(storeUpdate);
      setClientSeconds(0);
    }
  }, [storeUpdate, lastUpdateTime]);

  // Client-side countdown interpolation (updates every second)
  useEffect(() => {
    if (!localUpdate || localUpdate.isPaused) return;

    const interval = setInterval(() => {
      setClientSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [localUpdate, localUpdate?.isPaused]);

  // Calculate interpolated remaining time
  const interpolatedData = useMemo(() => {
    if (!localUpdate) return null;

    const secondsOffset = clientSeconds / 60; // Convert to minutes

    return {
      responseRemainingMinutes:
        localUpdate.responseRemainingMinutes !== null
          ? Math.max(0, localUpdate.responseRemainingMinutes - secondsOffset)
          : null,
      resolutionRemainingMinutes:
        localUpdate.resolutionRemainingMinutes !== null
          ? Math.max(0, localUpdate.resolutionRemainingMinutes - secondsOffset)
          : null,
      responseUsedPercent: localUpdate.responseUsedPercent,
      resolutionUsedPercent: localUpdate.resolutionUsedPercent,
      isPaused: localUpdate.isPaused,
    };
  }, [localUpdate, clientSeconds]);

  if (!interpolatedData) {
    return null;
  }

  const { responseRemainingMinutes, resolutionRemainingMinutes, isPaused } = interpolatedData;

  if (isPaused) {
    return (
      <div className={`inline-flex items-center gap-1 text-yellow-600 dark:text-yellow-400 ${className}`}>
        <PauseIcon className="w-3 h-3" />
        {!compact && <span className="text-xs">Приостановлен</span>}
      </div>
    );
  }

  const mainRemaining = showResponse
    ? responseRemainingMinutes
    : resolutionRemainingMinutes;

  if (mainRemaining === null) {
    return null;
  }

  const isUrgent = mainRemaining <= 15;
  const isWarning = mainRemaining <= 60 && mainRemaining > 15;

  const colorClass = isUrgent
    ? 'text-red-600 dark:text-red-400'
    : isWarning
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-gray-600 dark:text-gray-400';

  const bgClass = isUrgent
    ? 'bg-red-50 dark:bg-red-900/20'
    : isWarning
      ? 'bg-amber-50 dark:bg-amber-900/20'
      : 'bg-gray-100 dark:bg-gray-800';

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${bgClass} ${colorClass} ${className}`}
      title={`SLA: ${slaApi.formatRemainingTime(mainRemaining)}`}
    >
      <ClockIcon className={`w-3 h-3 ${isUrgent ? 'animate-pulse' : ''}`} />
      <span className={isUrgent ? 'font-bold' : ''}>
        {formatCountdown(mainRemaining)}
      </span>
    </div>
  );
}

/**
 * Format remaining time as countdown
 */
function formatCountdown(minutes: number): string {
  if (minutes <= 0) {
    return 'Просрочено';
  }

  if (minutes < 1) {
    const seconds = Math.floor(minutes * 60);
    return `${seconds}с`;
  }

  if (minutes < 60) {
    return `${Math.floor(minutes)}м`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);

  if (hours < 24) {
    return mins > 0 ? `${hours}ч ${mins}м` : `${hours}ч`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}д ${remainingHours}ч` : `${days}д`;
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

export default SlaTimer;
