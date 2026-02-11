'use client';

import { useState, useRef } from 'react';
import { X, Upload, FileText } from 'lucide-react';
import { useKnowledgeBaseStore } from '@/store/useKnowledgeBaseStore';

interface Props {
  onClose: () => void;
}

export function DocumentUploadDialog({ onClose }: Props) {
  const { uploadDocument, isCreating, categories } = useKnowledgeBaseStore();

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      setFile(droppedFile);
      if (!title) setTitle(droppedFile.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      if (!title) setTitle(selected.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title) return;

    try {
      await uploadDocument(file, {
        title,
        category: category || undefined,
        tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      });
      onClose();
    } catch {
      alert('Не удалось загрузить документ');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Загрузить документ
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Drag & Drop */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
              dragActive
                ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="h-8 w-8 text-teal-600 shrink-0" />
                <div className="text-left min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                  className="p-1 text-gray-400 hover:text-red-500 shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="h-10 w-10 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Перетащите файл сюда или нажмите для выбора
                </p>
                <p className="text-xs text-gray-400">PDF, DOCX, TXT (до 50 МБ)</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.docx,.txt,.csv"
              className="hidden"
            />
          </div>

          {/* Название */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Название <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          {/* Категория */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Категория
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list="upload-categories"
              placeholder="Документация, Инструкции..."
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
            <datalist id="upload-categories">
              {categories.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>

          {/* Теги */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Теги (через запятую)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="инструкция, руководство, техподдержка"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          {/* Кнопки */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!file || !title || isCreating}
              className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isCreating ? 'Загрузка...' : 'Загрузить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
