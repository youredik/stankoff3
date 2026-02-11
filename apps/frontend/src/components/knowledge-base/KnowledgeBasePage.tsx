'use client';

import { useEffect, useState, useCallback } from 'react';
import { BookOpen, FileText, HelpCircle, BarChart3, Plus } from 'lucide-react';
import { useKnowledgeBaseStore } from '@/store/useKnowledgeBaseStore';
import { KnowledgeBaseList } from './KnowledgeBaseList';
import { DocumentUploadDialog } from './DocumentUploadDialog';
import { FaqEditorDialog } from './FaqEditorDialog';
import { KnowledgeBaseStatsPanel } from './KnowledgeBaseStatsPanel';

type Tab = 'documents' | 'faq' | 'stats';

export function KnowledgeBasePage() {
  const [activeTab, setActiveTab] = useState<Tab>('documents');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showFaqDialog, setShowFaqDialog] = useState(false);

  const { setFilters, fetchCategories, fetchStats } = useKnowledgeBaseStore();

  const handleTabChange = useCallback(
    (tab: Tab) => {
      setActiveTab(tab);
      if (tab === 'documents') {
        setFilters({ type: 'document', search: undefined, category: undefined });
      } else if (tab === 'faq') {
        setFilters({ type: 'faq', search: undefined, category: undefined });
      } else {
        fetchStats();
      }
    },
    [setFilters, fetchStats],
  );

  useEffect(() => {
    fetchCategories();
    handleTabChange('documents');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs: { key: Tab; label: string; icon: typeof FileText }[] = [
    { key: 'documents', label: 'Документы', icon: FileText },
    { key: 'faq', label: 'FAQ', icon: HelpCircle },
    { key: 'stats', label: 'Статистика', icon: BarChart3 },
  ];

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Заголовок */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-lg">
              <BookOpen className="h-7 w-7 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                База знаний
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Документы и FAQ для AI-подсказок
              </p>
            </div>
          </div>

          {activeTab !== 'stats' && (
            <div className="flex gap-2">
              {activeTab === 'documents' && (
                <button
                  onClick={() => setShowUploadDialog(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium"
                >
                  <Plus className="h-4 w-4" />
                  Загрузить документ
                </button>
              )}
              {activeTab === 'faq' && (
                <button
                  onClick={() => setShowFaqDialog(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium"
                >
                  <Plus className="h-4 w-4" />
                  Создать статью
                </button>
              )}
            </div>
          )}
        </div>

        {/* Табы */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors text-sm font-medium ${
                  isActive
                    ? 'border-teal-600 text-teal-600 dark:text-teal-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Контент */}
        {activeTab === 'stats' ? (
          <KnowledgeBaseStatsPanel />
        ) : (
          <KnowledgeBaseList />
        )}

        {/* Диалоги */}
        {showUploadDialog && (
          <DocumentUploadDialog onClose={() => setShowUploadDialog(false)} />
        )}
        {showFaqDialog && (
          <FaqEditorDialog onClose={() => setShowFaqDialog(false)} />
        )}
      </div>
    </div>
  );
}
