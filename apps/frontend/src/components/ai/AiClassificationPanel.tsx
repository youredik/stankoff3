'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sparkles, RefreshCw, Check, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { aiApi } from '@/lib/api/ai';
import type { AiClassification, ClassifyResponse } from '@/types/ai';

interface AiClassificationPanelProps {
  entityId: string;
  title: string;
  description?: string;
  workspaceId?: string;
  /** Callback при применении классификации */
  onApply?: (classification: AiClassification) => void;
  /** Только для чтения */
  readOnly?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  technical_support: 'Техподдержка',
  complaint: 'Рекламация',
  question: 'Вопрос',
  feature_request: 'Запрос функции',
  bug: 'Ошибка',
  consultation: 'Консультация',
  installation: 'Установка/Наладка',
  warranty: 'Гарантия',
  spare_parts: 'Запчасти',
  other: 'Другое',
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Критичный',
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-gray-900',
  low: 'bg-green-500 text-white',
};

const SKILL_LABELS: Record<string, string> = {
  mechanical: 'Механика',
  electrical: 'Электрика',
  software: 'ПО',
  hydraulics: 'Гидравлика',
  pneumatics: 'Пневматика',
  cnc: 'ЧПУ',
  welding: 'Сварка',
  laser: 'Лазер',
  general: 'Общее',
};

/**
 * Панель AI классификации для карточки заявки
 */
export function AiClassificationPanel({
  entityId,
  title,
  description,
  workspaceId,
  onApply,
  readOnly = false,
}: AiClassificationPanelProps) {
  const [classification, setClassification] = useState<AiClassification | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);

  // Проверяем доступность AI
  useEffect(() => {
    aiApi.getHealth()
      .then((health) => setIsAvailable(health.available))
      .catch(() => setIsAvailable(false));
  }, []);

  // Загружаем существующую классификацию
  useEffect(() => {
    if (!entityId) return;

    setIsLoading(true);
    setError(null);

    aiApi.getClassification(entityId)
      .then((data) => {
        setClassification(data);
      })
      .catch((err) => {
        console.error('Failed to load classification:', err);
        // Не показываем ошибку если классификации просто нет
      })
      .finally(() => setIsLoading(false));
  }, [entityId]);

  // Слушаем WebSocket событие автоклассификации
  useEffect(() => {
    const handler = (e: Event) => {
      const { entityId: eid } = (e as CustomEvent).detail;
      if (eid === entityId) {
        aiApi.getClassification(entityId).then((data) => {
          if (data) setClassification(data);
        }).catch(() => {});
      }
    };
    window.addEventListener('ai:classification:ready', handler);
    return () => window.removeEventListener('ai:classification:ready', handler);
  }, [entityId]);

  // Запустить классификацию
  const handleClassify = useCallback(async () => {
    if (!title) return;

    setIsClassifying(true);
    setError(null);

    try {
      const result = await aiApi.classifyAndSave(entityId, {
        title,
        description: description || '',
        workspaceId,
      });
      setClassification(result);
    } catch (err) {
      console.error('Classification failed:', err);
      setError('Ошибка классификации');
    } finally {
      setIsClassifying(false);
    }
  }, [entityId, title, description, workspaceId]);

  // Применить классификацию
  const handleApply = useCallback(async () => {
    if (!classification) return;

    try {
      const applied = await aiApi.applyClassification(entityId);
      setClassification(applied);
      onApply?.(applied);
    } catch (err) {
      console.error('Failed to apply classification:', err);
      setError('Ошибка применения');
    }
  }, [entityId, classification, onApply]);

  // AI недоступен
  if (isAvailable === false) {
    return (
      <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
        <AlertCircle className="w-3.5 h-3.5" />
        AI недоступен
      </div>
    );
  }

  // Загрузка
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <div className="animate-spin w-3 h-3 border border-gray-400 border-t-transparent rounded-full" />
        <span>Загрузка...</span>
      </div>
    );
  }

  // Нет классификации — показываем кнопку
  if (!classification) {
    return (
      <div>
        <button
          onClick={handleClassify}
          disabled={isClassifying || readOnly}
          className="flex items-center gap-2 px-3 py-2 w-full text-sm font-medium text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isClassifying ? (
            <>
              <div className="animate-spin w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full" />
              <span>Анализирую...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Классифицировать с AI</span>
            </>
          )}
        </button>
        {error && (
          <p className="text-xs text-red-500 mt-1">{error}</p>
        )}
      </div>
    );
  }

  // Есть классификация — показываем результат
  return (
    <div className="space-y-2">
      {/* Заголовок */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-xs font-medium text-gray-500 uppercase hover:text-gray-700 dark:hover:text-gray-300"
      >
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-teal-500" />
          <span>AI Классификация</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
      </button>

      {isExpanded && (
        <div className="space-y-3 p-3 bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 rounded-lg border border-teal-200 dark:border-teal-800">
          {/* Категория */}
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Категория</p>
            <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">
              {CATEGORY_LABELS[classification.category] || classification.category}
            </span>
          </div>

          {/* Приоритет */}
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Приоритет</p>
            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded ${
              PRIORITY_COLORS[classification.priority] || 'bg-gray-200 text-gray-800'
            }`}>
              {PRIORITY_LABELS[classification.priority] || classification.priority}
            </span>
          </div>

          {/* Навыки */}
          {classification.skills && classification.skills.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Требуемые навыки</p>
              <div className="flex flex-wrap gap-1">
                {classification.skills.map((skill) => (
                  <span
                    key={skill}
                    className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded"
                  >
                    {SKILL_LABELS[skill] || skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Уверенность */}
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Уверенность</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all"
                  style={{ width: `${Math.round(classification.confidence * 100)}%` }}
                />
              </div>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                {Math.round(classification.confidence * 100)}%
              </span>
            </div>
          </div>

          {/* Обоснование */}
          {classification.reasoning && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Обоснование</p>
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                {classification.reasoning}
              </p>
            </div>
          )}

          {/* Провайдер */}
          <div className="pt-2 border-t border-teal-200 dark:border-teal-800/50 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
            <span>{classification.provider} / {classification.model}</span>
            {classification.applied && (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <Check className="w-3 h-3" />
                Применено
              </span>
            )}
          </div>

          {/* Действия */}
          {!readOnly && (
            <div className="flex items-center gap-2 pt-2">
              {!classification.applied && (
                <button
                  onClick={handleApply}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  Применить
                </button>
              )}
              <button
                onClick={handleClassify}
                disabled={isClassifying}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded transition-colors disabled:opacity-50"
                title="Переклассифицировать"
              >
                {isClassifying ? (
                  <div className="animate-spin w-3.5 h-3.5 border border-gray-400 border-t-transparent rounded-full" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default AiClassificationPanel;
