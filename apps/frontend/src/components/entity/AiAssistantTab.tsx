'use client';

import { useState, useEffect, useCallback } from 'react';
import { Copy, Check, Sparkles, MessageSquare } from 'lucide-react';
import { useAiStore } from '@/store/useAiStore';
import { AiFeedbackButtons } from '@/components/ai/AiFeedbackButtons';
import { aiApi } from '@/lib/api/ai';
import type {
  SimilarCase,
  SuggestedExpert,
  AiAssistantResponse,
} from '@/types/ai';

interface AiAssistantTabProps {
  entityId: string;
  /** Callback для вставки текста в редактор комментария */
  onInsertDraft?: (text: string) => void;
}

/**
 * AI Assistant Tab
 * Показывает похожие случаи, экспертов и рекомендации на основе RAG
 */
export function AiAssistantTab({ entityId, onInsertDraft }: AiAssistantTabProps) {
  const data = useAiStore((s) => s.assistanceCache.get(entityId)?.data ?? null);
  const loading = useAiStore((s) => s.assistanceLoading.get(entityId) ?? false);
  const generatedResponse = useAiStore((s) => s.generatedResponse);
  const isGenerating = useAiStore((s) => s.isGenerating);
  const streamingDraft = useAiStore((s) => s.streamingDraft);
  const { fetchAssistance, generateResponseStream } = useAiStore();

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchAssistance(entityId);
  }, [entityId, fetchAssistance]);

  // Генерация черновика ответа (streaming)
  const handleGenerateResponse = useCallback(async () => {
    if (!entityId || isGenerating) return;
    await generateResponseStream(entityId);
  }, [entityId, isGenerating, generateResponseStream]);

  // Копировать черновик
  const handleCopy = useCallback(() => {
    if (!generatedResponse?.draft) return;
    navigator.clipboard.writeText(generatedResponse.draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Implicit positive feedback
    aiApi.submitFeedback({
      type: 'response', entityId, rating: 'positive',
      metadata: { action: 'copy' },
    }).catch(() => {});
  }, [generatedResponse, entityId]);

  // Вставить в редактор
  const handleInsert = useCallback(() => {
    if (!generatedResponse?.draft || !onInsertDraft) return;
    onInsertDraft(generatedResponse.draft);
    // Implicit positive feedback
    aiApi.submitFeedback({
      type: 'response', entityId, rating: 'positive',
      metadata: { action: 'insert' },
    }).catch(() => {});
  }, [generatedResponse, onInsertDraft, entityId]);

  if (loading) {
    return (
      <div data-testid="ai-assistant-loading" className="flex flex-col items-center justify-center py-12 text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500 mb-3" />
        <span>Анализирую...</span>
      </div>
    );
  }

  if (!data?.available) {
    return (
      <div data-testid="ai-assistant-unavailable" className="py-8 text-center text-gray-500 dark:text-gray-400">
        <p>AI помощник недоступен</p>
        <p className="text-sm mt-1">Проверьте настройки AI провайдеров</p>
      </div>
    );
  }

  const hasContent =
    data.similarCases.length > 0 ||
    data.suggestedExperts.length > 0 ||
    data.suggestedActions?.length ||
    data.relatedContext;

  if (!hasContent) {
    return (
      <div data-testid="ai-assistant-no-data" className="py-8 text-center text-gray-500 dark:text-gray-400">
        <p>Недостаточно данных для анализа</p>
        <p className="text-sm mt-1">Добавьте описание к заявке</p>
      </div>
    );
  }

  return (
    <div data-testid="ai-assistant-tab" className="space-y-6 p-4">
      {/* Кнопка генерации ответа */}
      <section className="pb-4 border-b border-gray-200 dark:border-gray-700">
        <button
          data-testid="ai-generate-response-btn"
          onClick={handleGenerateResponse}
          disabled={isGenerating}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              <span>Генерирую ответ...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Предложить ответ</span>
            </>
          )}
        </button>

        {/* Streaming: текст появляется по мере генерации */}
        {isGenerating && streamingDraft && (
          <div data-testid="ai-streaming-draft" className="mt-4">
            <div className="p-4 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-800">
              <h4 className="text-sm font-medium text-teal-700 dark:text-teal-300 mb-2">
                Черновик ответа
              </h4>
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                {streamingDraft}
                <span className="inline-block w-0.5 h-4 bg-teal-500 ml-0.5 animate-pulse align-text-bottom" />
              </p>
            </div>
          </div>
        )}

        {/* Сгенерированный ответ (после завершения) */}
        {!isGenerating && generatedResponse && (
          <div data-testid="ai-generated-draft" className="mt-4 space-y-3">
            <div className="p-4 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-800">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-teal-700 dark:text-teal-300">
                  Черновик ответа
                </h4>
                <div className="flex items-center gap-1">
                  <button
                    data-testid="ai-copy-draft-btn"
                    onClick={handleCopy}
                    className="p-1.5 text-gray-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                    title="Копировать"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                  {onInsertDraft && (
                    <button
                      data-testid="ai-insert-draft-btn"
                      onClick={handleInsert}
                      className="p-1.5 text-gray-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                      title="Вставить в комментарий"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <p data-testid="ai-draft-text" className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                {generatedResponse.draft}
              </p>
            </div>

            {/* Источники */}
            {generatedResponse.sources.length > 0 && (
              <div data-testid="ai-draft-sources" className="text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium">Источники: </span>
                {generatedResponse.sources.map((source, i) => (
                  <span key={source.id}>
                    {source.title || `#${source.id}`}
                    {source.similarity && ` (${Math.round(source.similarity * 100)}%)`}
                    {i < generatedResponse.sources.length - 1 && ', '}
                  </span>
                ))}
              </div>
            )}

            {/* Feedback */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-gray-400">Было полезно?</span>
              <AiFeedbackButtons
                type="response"
                entityId={entityId}
                metadata={{
                  draftLength: generatedResponse.draft.length,
                  sourcesCount: generatedResponse.sources.length,
                }}
              />
            </div>
          </div>
        )}
      </section>

      {/* Рекомендуемые действия */}
      {data.suggestedActions && data.suggestedActions.length > 0 && (
        <section data-testid="ai-actions-section">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Рекомендации
          </h3>
          <ul className="space-y-2">
            {data.suggestedActions.map((action, index) => (
              <li
                key={index}
                data-testid="ai-action-item"
                className="flex items-start gap-2 p-2 bg-teal-50 dark:bg-teal-900/20 rounded-lg text-sm"
              >
                <span className="text-teal-500 mt-0.5">-</span>
                <span className="text-gray-700 dark:text-gray-300">{action}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Похожие случаи */}
      {data.similarCases.length > 0 && (
        <section data-testid="ai-similar-cases-section">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Похожие решённые случаи
          </h3>
          <div className="space-y-2">
            {data.similarCases.map((caseItem) => (
              <SimilarCaseCard key={caseItem.requestId} caseItem={caseItem} />
            ))}
          </div>
        </section>
      )}

      {/* Эксперты */}
      {data.suggestedExperts.length > 0 && (
        <section data-testid="ai-experts-section">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Рекомендуемые эксперты
          </h3>
          <div className="space-y-2">
            {data.suggestedExperts.map((expert, index) => (
              <ExpertCard key={index} expert={expert} />
            ))}
          </div>
        </section>
      )}

      {/* Связанный контекст */}
      {data.relatedContext && (
        <section data-testid="ai-related-context">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Связанный контекст
          </h3>
          <RelatedContextCard context={data.relatedContext} />
        </section>
      )}

      {/* Ключевые слова */}
      {data.keywords && data.keywords.length > 0 && (
        <section data-testid="ai-keywords-section">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Теги
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.keywords.map((keyword, index) => (
              <span
                key={index}
                data-testid="ai-keyword-tag"
                className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-xs text-gray-600 dark:text-gray-300"
              >
                {keyword}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Карточка похожего случая с кнопкой копирования решения
 */
function SimilarCaseCard({ caseItem }: { caseItem: SimilarCase }) {
  const [copied, setCopied] = useState(false);

  const handleCopyResolution = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (caseItem.resolution) {
      navigator.clipboard.writeText(caseItem.resolution);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <a
      data-testid="ai-similar-case"
      href={caseItem.legacyUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-blue-600 dark:text-blue-400">
              #{caseItem.requestId}
            </span>
            <span className="text-xs text-gray-500">
              {Math.round(caseItem.similarity * 100)}% схожесть
            </span>
          </div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
            {caseItem.subject}
          </p>
          {caseItem.resolution && (
            <div className="flex items-start gap-1.5 mt-1">
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 flex-1">
                {caseItem.resolution}
              </p>
              <button
                onClick={handleCopyResolution}
                className="p-0.5 text-gray-400 hover:text-teal-500 shrink-0 transition-colors"
                title="Копировать решение"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            {caseItem.resolutionTimeHours && (
              <span>Решено за {caseItem.resolutionTimeHours}ч</span>
            )}
            {caseItem.specialists && caseItem.specialists.length > 0 && (
              <span>{caseItem.specialists.join(', ')}</span>
            )}
          </div>
        </div>
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </div>
    </a>
  );
}

/**
 * Карточка эксперта
 */
function ExpertCard({ expert }: { expert: SuggestedExpert }) {
  return (
    <div data-testid="ai-expert-card" className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {expert.name}
          </p>
          {expert.department && (
            <p className="text-xs text-gray-500">{expert.department}</p>
          )}
        </div>
        <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded-full">
          {expert.relevantCases} случаев
        </span>
      </div>
      {expert.topics.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {expert.topics.slice(0, 3).map((topic, index) => (
            <span
              key={index}
              className="text-xs text-gray-500 dark:text-gray-400"
              title={topic}
            >
              {topic.length > 30 ? topic.substring(0, 30) + '...' : topic}
              {index < Math.min(expert.topics.length, 3) - 1 && ' | '}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Карточка связанного контекста
 */
function RelatedContextCard({ context }: { context: NonNullable<AiAssistantResponse['relatedContext']> }) {
  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
      {/* Контрагент */}
      {context.counterpartyName && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Контрагент</p>
          {context.counterpartyUrl ? (
            <a
              href={context.counterpartyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {context.counterpartyName}
            </a>
          ) : (
            <p className="text-sm text-gray-800 dark:text-gray-200">
              {context.counterpartyName}
            </p>
          )}
          {context.customerTotalRequests && (
            <p className="text-xs text-gray-500 mt-1">
              Всего обращений: {context.customerTotalRequests}
            </p>
          )}
        </div>
      )}

      {/* Сделки */}
      {context.deals && context.deals.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Связанные сделки</p>
          <ul className="space-y-1">
            {context.deals.map((deal) => (
              <li key={deal.id}>
                <a
                  href={deal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded p-1 -m-1"
                >
                  <span className="text-blue-600 dark:text-blue-400">{deal.name}</span>
                  <span className="text-gray-500">
                    {new Intl.NumberFormat('ru-RU', {
                      style: 'currency',
                      currency: 'RUB',
                      maximumFractionDigits: 0,
                    }).format(deal.sum)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
