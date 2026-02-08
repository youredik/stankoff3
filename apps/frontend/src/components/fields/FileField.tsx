'use client';

import { X, Upload } from 'lucide-react';
import { AttachmentPreview } from '@/components/ui/AttachmentPreview';
import { filesApi } from '@/lib/api/files';
import type { Attachment } from '@/types';
import type { FieldRenderer } from './types';

function FileRenderer({ value, canEdit, onUpdate }: Parameters<FieldRenderer['Renderer']>[0]) {
  const files: Attachment[] = Array.isArray(value) ? value : value ? [value] : [];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const uploadedFiles: Attachment[] = [...files];
    for (const file of Array.from(fileList)) {
      try {
        const uploaded = await filesApi.upload(file);
        uploadedFiles.push(uploaded as Attachment);
      } catch (error) {
        console.error('Ошибка загрузки файла:', error);
      }
    }
    onUpdate(uploadedFiles);
    e.target.value = '';
  };

  const handleRemoveFile = (fileId: string) => {
    onUpdate(files.filter((f) => f.id !== fileId));
  };

  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((file) => (
            <div key={file.id} className="flex items-center gap-2">
              <div className="flex-1">
                <AttachmentPreview
                  attachment={file}
                  allAttachments={files}
                  showThumbnail={false}
                />
              </div>
              {canEdit && (
                <button
                  onClick={() => handleRemoveFile(file.id)}
                  className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                  title="Удалить"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded cursor-pointer hover:border-primary-400 dark:hover:border-primary-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <Upload className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-500 dark:text-gray-400">Загрузить файл</span>
          <input
            type="file"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      )}
      {files.length === 0 && !canEdit && (
        <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>
      )}
    </div>
  );
}

function FileForm() {
  return (
    <p className="text-xs text-gray-400 dark:text-gray-500">
      Файлы можно добавить после создания заявки
    </p>
  );
}

export const fileFieldRenderer: FieldRenderer = {
  Renderer: FileRenderer,
  Form: FileForm,
};
