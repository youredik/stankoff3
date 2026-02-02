'use client';

import { useState, useRef } from 'react';
import { X, Upload, FileJson, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import { useEntityStore } from '@/store/useEntityStore';
import { entitiesApi } from '@/lib/api/entities';

interface ImportModalProps {
  workspaceId: string;
  onClose: () => void;
}

type ImportFormat = 'json' | 'csv';

interface ImportResult {
  imported: number;
  errors: string[];
}

export function ImportModal({ workspaceId, onClose }: ImportModalProps) {
  const { fetchEntities } = useEntityStore();
  const [format, setFormat] = useState<ImportFormat>('csv');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setResult(null);
      setError(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      if (format === 'csv') {
        const result = await entitiesApi.importCsv(workspaceId, file);
        setResult(result);
      } else {
        // JSON import - читаем файл и отправляем как CSV с преобразованием
        const content = await file.text();
        let entities;
        try {
          const parsed = JSON.parse(content);
          entities = Array.isArray(parsed) ? parsed : parsed.entities;
          if (!Array.isArray(entities)) {
            throw new Error('JSON должен содержать массив entities');
          }
        } catch {
          throw new Error('Неверный формат JSON');
        }

        // Преобразуем JSON в CSV формат для импорта
        const headers = ['ID', 'Номер', 'Название', 'Статус', 'Приоритет', 'Исполнитель', 'Создано'];
        const rows = entities.map((e: any) => [
          '',
          '',
          `"${(e.title || '').replace(/"/g, '""')}"`,
          e.status || 'new',
          e.priority || 'medium',
          '',
          '',
        ]);
        const csv = [headers.join(';'), ...rows.map((r: string[]) => r.join(';'))].join('\n');
        const csvFile = new File([csv], 'import.csv', { type: 'text/csv' });
        const result = await entitiesApi.importCsv(workspaceId, csvFile);
        setResult(result);
      }

      // Обновляем список сущностей
      await fetchEntities(workspaceId);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Ошибка импорта');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Импорт данных
            </h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Format selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Формат файла
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setFormat('csv');
                    setFile(null);
                    setResult(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                    format === 'csv'
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <FileSpreadsheet className="w-5 h-5" />
                  <span className="font-medium">CSV</span>
                </button>
                <button
                  onClick={() => {
                    setFormat('json');
                    setFile(null);
                    setResult(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                    format === 'json'
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <FileJson className="w-5 h-5" />
                  <span className="font-medium">JSON</span>
                </button>
              </div>
            </div>

            {/* File drop zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                file
                  ? 'border-primary-300 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/30'
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={format === 'csv' ? '.csv' : '.json'}
                onChange={handleFileSelect}
                className="hidden"
              />
              <Upload className="w-8 h-8 mx-auto text-gray-400 dark:text-gray-500 mb-2" />
              {file ? (
                <p className="text-sm text-primary-700 dark:text-primary-300 font-medium">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Перетащите файл сюда или нажмите для выбора
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {format === 'csv'
                      ? 'Файл должен содержать колонку "Название" или "Title"'
                      : 'JSON массив объектов с полем "title"'}
                  </p>
                </>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/30 rounded-lg text-red-700 dark:text-red-300">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Result */}
            {result && (
              <div
                className={`p-4 rounded-lg ${
                  result.errors.length > 0 ? 'bg-yellow-50 dark:bg-yellow-900/30' : 'bg-green-50 dark:bg-green-900/30'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle
                    className={`w-5 h-5 ${
                      result.errors.length > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'
                    }`}
                  />
                  <span
                    className={`font-medium ${
                      result.errors.length > 0 ? 'text-yellow-700 dark:text-yellow-300' : 'text-green-700 dark:text-green-300'
                    }`}
                  >
                    Импортировано: {result.imported}
                  </span>
                </div>
                {result.errors.length > 0 && (
                  <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                    <p className="font-medium mb-1">Ошибки ({result.errors.length}):</p>
                    <ul className="list-disc list-inside space-y-0.5 max-h-24 overflow-y-auto">
                      {result.errors.slice(0, 5).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                      {result.errors.length > 5 && (
                        <li>...и ещё {result.errors.length - 5}</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Help text */}
            <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              {format === 'csv' ? (
                <>
                  <p className="font-medium mb-1">Формат CSV:</p>
                  <p>
                    Первая строка — заголовки. Обязательная колонка: <code>Название</code>{' '}
                    или <code>Title</code>. Опционально: <code>Статус</code>,{' '}
                    <code>Приоритет</code>.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium mb-1">Формат JSON:</p>
                  <p>
                    Массив объектов или объект с полем <code>entities</code>. Каждый
                    объект должен содержать поле <code>title</code>. Опционально:{' '}
                    <code>status</code>, <code>priority</code>, <code>data</code>.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {result ? 'Закрыть' : 'Отмена'}
            </button>
            {!result && (
              <button
                onClick={handleImport}
                disabled={!file || loading}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Импортирую...' : 'Импортировать'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
