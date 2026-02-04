'use client';

import { useState, useEffect } from 'react';
import type { SlaDashboard as SlaDashboardType, SlaDefinition } from '@/types';
import * as slaApi from '@/lib/api/sla';

interface SlaDashboardProps {
  workspaceId: string;
  onDefinitionClick?: (definition: SlaDefinition) => void;
  className?: string;
}

export function SlaDashboard({
  workspaceId,
  onDefinitionClick,
  className = '',
}: SlaDashboardProps) {
  const [dashboard, setDashboard] = useState<SlaDashboardType | null>(null);
  const [definitions, setDefinitions] = useState<SlaDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const [dashboardData, definitionsData] = await Promise.all([
        slaApi.getDashboard(workspaceId),
        slaApi.getDefinitions(workspaceId),
      ]);
      setDashboard(dashboardData);
      setDefinitions(definitionsData);
    } catch {
      setError('Не удалось загрузить данные SLA');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
        <div className="h-64 rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <p className="text-red-500">{error}</p>
        <button
          onClick={loadData}
          className="mt-2 text-sm text-teal-600 hover:text-teal-700 dark:text-teal-400"
        >
          Повторить
        </button>
      </div>
    );
  }

  if (!dashboard) {
    return null;
  }

  const complianceRate = dashboard.total > 0
    ? Math.round((dashboard.met / dashboard.total) * 100)
    : 100;

  return (
    <div className={className}>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Всего"
          value={dashboard.total}
          icon={<DocumentIcon />}
          color="gray"
        />
        <StatCard
          title="Выполнено"
          value={dashboard.met}
          icon={<CheckIcon />}
          color="green"
        />
        <StatCard
          title="Нарушено"
          value={dashboard.breached}
          icon={<ExclamationIcon />}
          color="red"
        />
        <StatCard
          title="В процессе"
          value={dashboard.pending}
          subtitle={`${dashboard.atRisk} под угрозой`}
          icon={<ClockIcon />}
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            Соблюдение SLA
          </h3>
          <div className="flex items-center gap-4">
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 transform -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-gray-200 dark:text-gray-700"
                />
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeDasharray={`${complianceRate * 2.51} 251`}
                  className={complianceRate >= 90 ? 'text-green-500' : complianceRate >= 70 ? 'text-amber-500' : 'text-red-500'}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-gray-900 dark:text-gray-100">
                {complianceRate}%
              </span>
            </div>
            <div className="flex-1">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Выполнено</span>
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    {dashboard.met}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Нарушено</span>
                  <span className="text-red-600 dark:text-red-400 font-medium">
                    {dashboard.breached}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">В процессе</span>
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    {dashboard.pending}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            Определения SLA
          </h3>
          {definitions.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Нет определений SLA
            </p>
          ) : (
            <div className="space-y-2">
              {definitions.map((def) => (
                <button
                  key={def.id}
                  onClick={() => onDefinitionClick?.(def)}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                >
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {def.name}
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Ответ: {def.responseTime}м / Решение: {def.resolutionTime}м
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs ${
                      def.isActive
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }`}
                  >
                    {def.isActive ? 'Активен' : 'Неактивен'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {dashboard.atRisk > 0 && (
        <div className="mt-6 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 p-4">
          <div className="flex items-start gap-3">
            <ExclamationIcon className="w-5 h-5 text-amber-500 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Внимание: {dashboard.atRisk} {dashboard.atRisk === 1 ? 'SLA' : 'SLA'} под угрозой нарушения
              </h4>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                Использовано более 80% времени. Рекомендуется проверить эти заявки.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon: React.ReactNode;
  color: 'gray' | 'green' | 'red' | 'amber';
}

function StatCard({ title, value, subtitle, icon, color }: StatCardProps) {
  const colorClasses = {
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    green: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    red: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          {subtitle && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ExclamationIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
