'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Workspace error:', error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-5">
          <AlertTriangle className="w-7 h-7 text-amber-500" />
        </div>

        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Ошибка загрузки рабочего места
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Не удалось загрузить данные. Попробуйте обновить страницу или вернуться к списку.
        </p>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium"
            aria-label="Попробовать снова"
          >
            <RefreshCw className="w-4 h-4" />
            Попробовать снова
          </button>
          <a
            href="/workspace"
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            К списку
          </a>
        </div>
      </div>
    </div>
  );
}
