'use client';

import { useState } from 'react';
import { FileText, HelpCircle, Download, Trash2, Calendar, User, Tag } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useKnowledgeBaseStore } from '@/store/useKnowledgeBaseStore';
import type { KnowledgeArticle } from '@/types/knowledge-base';

interface Props {
  article: KnowledgeArticle;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function KnowledgeArticleCard({ article }: Props) {
  const { user } = useAuthStore();
  const { deleteArticle } = useKnowledgeBaseStore();
  const [isDeleting, setIsDeleting] = useState(false);

  const canDelete = user?.role === 'admin' || user?.id === article.authorId;
  const isDocument = article.type === 'document';

  const handleDelete = async () => {
    if (!confirm('Удалить эту статью? Действие необратимо.')) return;
    setIsDeleting(true);
    try {
      await deleteArticle(article.id);
    } catch {
      alert('Не удалось удалить статью');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = () => {
    if (!article.fileKey) return;
    const url = `/api/files/download/${article.fileKey}?name=${encodeURIComponent(article.fileName || 'document')}`;
    window.open(url, '_blank');
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow group">
      {/* Заголовок */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className={`p-2 rounded-lg shrink-0 ${
            isDocument
              ? 'bg-blue-50 dark:bg-blue-900/20'
              : 'bg-amber-50 dark:bg-amber-900/20'
          }`}
        >
          {isDocument ? (
            <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          ) : (
            <HelpCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
            {article.title}
          </h3>
          {article.category && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {article.category}
            </span>
          )}
        </div>

        {/* Действия */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {isDocument && article.fileKey && (
            <button
              onClick={handleDownload}
              className="p-1.5 rounded text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Скачать"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-1.5 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              title="Удалить"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Превью контента FAQ */}
      {!isDocument && article.content && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
          {article.content.substring(0, 200)}
        </p>
      )}

      {/* Инфо документа */}
      {isDocument && article.fileName && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {article.fileName}
          {article.fileSize ? ` · ${formatFileSize(article.fileSize)}` : ''}
        </p>
      )}

      {/* Теги */}
      {article.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {article.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-xs"
            >
              <Tag className="h-3 w-3" />
              {tag}
            </span>
          ))}
          {article.tags.length > 4 && (
            <span className="text-xs text-gray-400">
              +{article.tags.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Метаданные */}
      <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-100 dark:border-gray-700/50">
        <span className="flex items-center gap-1">
          <User className="h-3 w-3" />
          {article.author?.name || 'Неизвестно'}
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {new Date(article.createdAt).toLocaleDateString('ru-RU')}
        </span>
        {article.status === 'draft' && (
          <span className="px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded text-xs">
            Черновик
          </span>
        )}
      </div>
    </div>
  );
}
