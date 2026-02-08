'use client';

import { useEffect } from 'react';
import { GraduationCap, CheckCircle, PlayCircle, BookOpen } from 'lucide-react';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { ProgressStatus } from '@/lib/api/onboarding';

/**
 * Карточка статуса онбординга для Dashboard
 */
export function OnboardingStatusCard() {
  const { status, isLoading, loadStatus, startTour } = useOnboardingStore();

  useEffect(() => {
    if (!status) {
      loadStatus();
    }
  }, [status, loadStatus]);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  const allTours = [...status.requiredTours, ...status.optionalTours];
  const completedTours = allTours.filter(
    (t) => t.status === ProgressStatus.COMPLETED,
  );
  const inProgressTours = allTours.filter(
    (t) => t.status === ProgressStatus.IN_PROGRESS,
  );
  const notStartedTours = allTours.filter(
    (t) =>
      t.status === ProgressStatus.NOT_STARTED ||
      t.status === ProgressStatus.SKIPPED,
  );

  // Если всё завершено, показываем минимальную карточку
  if (status.hasCompletedInitialOnboarding && notStartedTours.length === 0) {
    return (
      <div className="bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 rounded-lg border border-teal-200 dark:border-teal-800 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-teal-700 dark:text-teal-300">
              Обучение завершено!
            </p>
            <p className="text-xs text-teal-600 dark:text-teal-400">
              Вы прошли все обязательные туры
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Обучение
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {status.totalCompletionPercentage}% завершено
              </p>
            </div>
          </div>

          {/* Progress ring */}
          <div className="relative w-14 h-14">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="28"
                cy="28"
                r="24"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
                className="text-gray-200 dark:text-gray-700"
              />
              <circle
                cx="28"
                cy="28"
                r="24"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
                strokeDasharray={`${(status.totalCompletionPercentage / 100) * 151} 151`}
                strokeLinecap="round"
                className="text-teal-500"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-gray-700 dark:text-gray-300">
              {status.totalCompletionPercentage}%
            </span>
          </div>
        </div>
      </div>

      {/* Tours list */}
      <div className="p-4 space-y-3">
        {/* In Progress */}
        {inProgressTours.map((tour) => (
          <button
            key={tour.id}
            onClick={() => startTour(tour.id)}
            className="w-full flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 hover:border-amber-400 dark:hover:border-amber-600 transition-colors text-left"
          >
            <PlayCircle className="w-5 h-5 text-amber-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {tour.name}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 bg-amber-200 dark:bg-amber-800 rounded-full">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${tour.completionPercentage}%` }}
                  />
                </div>
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  {tour.completedSteps}/{tour.totalSteps}
                </span>
              </div>
            </div>
          </button>
        ))}

        {/* Not Started Required */}
        {status.requiredTours
          .filter((t) => t.status === ProgressStatus.NOT_STARTED)
          .map((tour) => (
            <button
              key={tour.id}
              onClick={() => startTour(tour.id)}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 hover:border-teal-400 dark:hover:border-teal-600 transition-colors text-left"
            >
              <BookOpen className="w-5 h-5 text-teal-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {tour.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {tour.totalSteps} шагов • Обязательный
                </p>
              </div>
            </button>
          ))}

        {/* Optional Tours (collapsed) */}
        {status.optionalTours.filter(
          (t) =>
            t.status === ProgressStatus.NOT_STARTED ||
            t.status === ProgressStatus.SKIPPED,
        ).length > 0 && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              Дополнительные туры
            </p>
            <div className="space-y-2">
              {status.optionalTours
                .filter(
                  (t) =>
                    t.status === ProgressStatus.NOT_STARTED ||
                    t.status === ProgressStatus.SKIPPED,
                )
                .slice(0, 3)
                .map((tour) => (
                  <button
                    key={tour.id}
                    onClick={() => startTour(tour.id)}
                    className="w-full flex items-center gap-2 p-2 rounded text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                  >
                    <BookOpen className="w-4 h-4 text-gray-400" />
                    <span className="truncate">{tour.name}</span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
