'use client';

import { useEffect } from 'react';
import { FileText, HelpCircle, Database, Layers } from 'lucide-react';
import { useKnowledgeBaseStore } from '@/store/useKnowledgeBaseStore';

export function KnowledgeBaseStatsPanel() {
  const { stats, fetchStats } = useKnowledgeBaseStore();

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (!stats) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-r-transparent" />
      </div>
    );
  }

  const cards = [
    {
      icon: FileText,
      label: 'Документы',
      value: stats.totalDocuments,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      icon: HelpCircle,
      label: 'FAQ статьи',
      value: stats.totalFaq,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
    },
    {
      icon: Database,
      label: 'Всего статей',
      value: stats.totalArticles,
      color: 'text-teal-600 dark:text-teal-400',
      bg: 'bg-teal-50 dark:bg-teal-900/20',
    },
    {
      icon: Layers,
      label: 'AI чанков',
      value: stats.totalChunks,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Карточки */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${card.bg}`}>
                  <Icon className={`h-6 w-6 ${card.color}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {card.value}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Индексация */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Индексация для AI поиска
        </h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              Чанков из документов
            </p>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
              {stats.documentChunks}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              Чанков из FAQ
            </p>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
              {stats.faqChunks}
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
          Загруженные документы и FAQ статьи автоматически разбиваются на фрагменты и
          индексируются для AI-подсказок при работе с заявками.
        </p>
      </div>
    </div>
  );
}
