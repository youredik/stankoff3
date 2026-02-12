'use client';

import { useState, useEffect } from 'react';
import { X, FileCode, FileText, Loader2 } from 'lucide-react';
import { bpmnApi } from '@/lib/api/bpmn';
import type { BpmnTemplate } from '@/types';

interface TemplateSelectorProps {
  onSelect: (template: { name: string; description: string; bpmnXml: string } | null) => void;
  onClose: () => void;
}

type TemplateInfo = Omit<BpmnTemplate, 'bpmnXml'>;

const CATEGORY_LABELS: Record<string, string> = {
  approval: 'Согласование',
  support: 'Техподдержка',
  hr: 'HR-процессы',
  sales: 'Продажи',
  other: 'Другое',
};

export function TemplateSelector({ onSelect, onClose }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Load templates and categories
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        setIsLoading(true);
        const [templatesData, categoriesData] = await Promise.all([
          bpmnApi.getTemplates(),
          bpmnApi.getTemplateCategories(),
        ]);
        setTemplates(templatesData);
        setCategories(categoriesData);
      } catch (err) {
        console.error('Failed to load templates:', err);
        setError('Не удалось загрузить шаблоны');
      } finally {
        setIsLoading(false);
      }
    };

    loadTemplates();
  }, []);

  const handleSelectBlank = () => {
    onSelect(null);
  };

  const handleSelectTemplate = async () => {
    if (!selectedId) return;

    try {
      setIsLoadingTemplate(true);
      setError(null);

      const template = await bpmnApi.getTemplate(selectedId);
      onSelect({
        name: template.name,
        description: template.description,
        bpmnXml: template.bpmnXml,
      });
    } catch (err) {
      console.error('Failed to load template:', err);
      setError('Не удалось загрузить шаблон');
    } finally {
      setIsLoadingTemplate(false);
    }
  };

  // Group templates by category
  const templatesByCategory = categories.reduce(
    (acc, category) => {
      acc[category] = templates.filter((t) => t.category === category);
      return acc;
    },
    {} as Record<string, TemplateInfo[]>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-lg shadow-xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Создать процесс
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Blank option */}
          <div className="mb-6">
            <button
              onClick={handleSelectBlank}
              className="w-full flex items-center gap-4 p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-teal-400 dark:hover:border-teal-500 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
            >
              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg group-hover:bg-teal-100 dark:group-hover:bg-teal-900/30 transition-colors">
                <FileCode className="w-6 h-6 text-gray-500 dark:text-gray-400 group-hover:text-teal-600 dark:group-hover:text-teal-400" />
              </div>
              <div className="text-left">
                <p className="font-medium text-gray-900 dark:text-white">
                  Пустой процесс
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Создать процесс с нуля в визуальном редакторе
                </p>
              </div>
            </button>
          </div>

          {/* Templates section */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Или выберите шаблон
            </h3>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">
                Шаблоны не найдены
              </div>
            ) : (
              <div className="space-y-4">
                {categories.map((category) => {
                  const categoryTemplates = templatesByCategory[category];
                  if (!categoryTemplates || categoryTemplates.length === 0) return null;

                  return (
                    <div key={category}>
                      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                        {CATEGORY_LABELS[category] || category}
                      </h4>
                      <div className="space-y-2">
                        {categoryTemplates.map((template) => (
                          <label
                            key={template.id}
                            className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                              selectedId === template.id
                                ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                            }`}
                          >
                            <input
                              type="radio"
                              name="template"
                              value={template.id}
                              checked={selectedId === template.id}
                              onChange={() => setSelectedId(template.id)}
                              className="w-4 h-4 text-teal-600"
                            />
                            <FileText className="w-5 h-5 text-gray-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 dark:text-white">
                                {template.name}
                              </p>
                              {template.description && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                  {template.description}
                                </p>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSelectTemplate}
            disabled={!selectedId || isLoadingTemplate}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 rounded-md transition-colors"
          >
            {isLoadingTemplate && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLoadingTemplate ? 'Загрузка...' : 'Использовать шаблон'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TemplateSelector;
