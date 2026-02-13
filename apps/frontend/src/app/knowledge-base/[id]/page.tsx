'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, User, Tag, Edit3 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { Breadcrumbs, createHomeBreadcrumb } from '@/components/ui/Breadcrumbs';
import { knowledgeBaseApi } from '@/lib/api/knowledge-base';
import type { KnowledgeArticle } from '@/types/knowledge-base';

function ArticleContent() {
  const params = useParams();
  const router = useRouter();
  const [article, setArticle] = useState<KnowledgeArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = params.id as string;
    if (!id) return;
    setLoading(true);
    knowledgeBaseApi
      .getArticle(id)
      .then(setArticle)
      .catch(() => setError('Статья не найдена'))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500" />
        </div>
      </AppShell>
    );
  }

  if (error || !article) {
    return (
      <AppShell>
        <div className="px-6 pt-4 pb-2">
          <Breadcrumbs items={[
            { ...createHomeBreadcrumb(), onClick: () => router.push('/workspace') },
            { label: 'База знаний', onClick: () => router.push('/knowledge-base') },
            { label: 'Ошибка' },
          ]} />
        </div>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <p className="text-gray-500 dark:text-gray-400">{error || 'Статья не найдена'}</p>
          <button
            onClick={() => router.push('/knowledge-base')}
            className="flex items-center gap-2 text-teal-600 dark:text-teal-400 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Вернуться в Базу знаний
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-6 pt-4 pb-2">
        <Breadcrumbs items={[
          { ...createHomeBreadcrumb(), onClick: () => router.push('/workspace') },
          { label: 'База знаний', onClick: () => router.push('/knowledge-base') },
          { label: article.category || 'FAQ', onClick: () => router.push(`/knowledge-base?tab=faq`) },
          { label: article.title },
        ]} />
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Кнопка назад */}
        <button
          onClick={() => router.push('/knowledge-base?tab=faq')}
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад к Базе знаний
        </button>

        {/* Заголовок */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            {article.title}
          </h1>

          {/* Метаданные */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-4">
            {article.category && (
              <span className="px-2.5 py-1 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 rounded-md text-xs font-medium">
                {article.category}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <User className="h-4 w-4" />
              {article.author?.name || 'Неизвестно'}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {new Date(article.createdAt).toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
            {article.status === 'draft' && (
              <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded text-xs">
                Черновик
              </span>
            )}
          </div>

          {/* Теги */}
          {article.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-md text-xs"
                >
                  <Tag className="h-3 w-3" />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Контент */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8">
          <div className="kb-article-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {article.content || ''}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      {/* Стили для markdown контента */}
      <style jsx global>{`
        .kb-article-content {
          color: var(--tw-prose-body, #374151);
          line-height: 1.75;
          font-size: 0.95rem;
        }
        .dark .kb-article-content {
          color: #d1d5db;
        }
        .kb-article-content h1 {
          font-size: 1.75rem;
          font-weight: 700;
          margin: 2rem 0 1rem;
          color: #111827;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 0.5rem;
        }
        .dark .kb-article-content h1 {
          color: #f3f4f6;
          border-bottom-color: #374151;
        }
        .kb-article-content h2 {
          font-size: 1.4rem;
          font-weight: 600;
          margin: 1.75rem 0 0.75rem;
          color: #1f2937;
        }
        .dark .kb-article-content h2 {
          color: #e5e7eb;
        }
        .kb-article-content h3 {
          font-size: 1.15rem;
          font-weight: 600;
          margin: 1.5rem 0 0.5rem;
          color: #374151;
        }
        .dark .kb-article-content h3 {
          color: #d1d5db;
        }
        .kb-article-content h4 {
          font-size: 1.05rem;
          font-weight: 600;
          margin: 1.25rem 0 0.5rem;
          color: #4b5563;
        }
        .dark .kb-article-content h4 {
          color: #9ca3af;
        }
        .kb-article-content p {
          margin: 0.75rem 0;
        }
        .kb-article-content strong {
          font-weight: 600;
          color: #111827;
        }
        .dark .kb-article-content strong {
          color: #f9fafb;
        }
        .kb-article-content ul, .kb-article-content ol {
          margin: 0.75rem 0;
          padding-left: 1.5rem;
        }
        .kb-article-content ul {
          list-style-type: disc;
        }
        .kb-article-content ol {
          list-style-type: decimal;
        }
        .kb-article-content li {
          margin: 0.25rem 0;
        }
        .kb-article-content li > ul, .kb-article-content li > ol {
          margin: 0.25rem 0;
        }
        .kb-article-content hr {
          border: none;
          border-top: 1px solid #e5e7eb;
          margin: 2rem 0;
        }
        .dark .kb-article-content hr {
          border-top-color: #374151;
        }
        .kb-article-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 1rem 0;
          font-size: 0.875rem;
        }
        .kb-article-content th {
          background: #f3f4f6;
          font-weight: 600;
          text-align: left;
          padding: 0.625rem 0.75rem;
          border: 1px solid #e5e7eb;
          color: #374151;
        }
        .dark .kb-article-content th {
          background: #1f2937;
          border-color: #374151;
          color: #d1d5db;
        }
        .kb-article-content td {
          padding: 0.5rem 0.75rem;
          border: 1px solid #e5e7eb;
        }
        .dark .kb-article-content td {
          border-color: #374151;
        }
        .kb-article-content tr:hover {
          background: #f9fafb;
        }
        .dark .kb-article-content tr:hover {
          background: #111827;
        }
        .kb-article-content code {
          background: #f3f4f6;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-size: 0.85em;
          color: #dc2626;
        }
        .dark .kb-article-content code {
          background: #1f2937;
          color: #f87171;
        }
        .kb-article-content pre {
          background: #1f2937;
          color: #e5e7eb;
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: auto;
          margin: 1rem 0;
        }
        .kb-article-content pre code {
          background: transparent;
          padding: 0;
          color: inherit;
          font-size: 0.85rem;
        }
        .kb-article-content blockquote {
          border-left: 3px solid #0d9488;
          padding: 0.5rem 1rem;
          margin: 1rem 0;
          background: #f0fdfa;
          color: #115e59;
          border-radius: 0 0.25rem 0.25rem 0;
        }
        .dark .kb-article-content blockquote {
          background: #042f2e;
          color: #5eead4;
          border-left-color: #14b8a6;
        }
        .kb-article-content a {
          color: #0d9488;
          text-decoration: underline;
        }
        .kb-article-content a:hover {
          color: #0f766e;
        }
      `}</style>
    </AppShell>
  );
}

export default function ArticlePage() {
  return (
    <AuthProvider>
      <ArticleContent />
    </AuthProvider>
  );
}
