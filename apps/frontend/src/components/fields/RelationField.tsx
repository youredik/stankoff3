'use client';

import { Link2, ExternalLink } from 'lucide-react';
import type { FieldRenderer } from './types';

function RelationRenderer({ field, value, canEdit }: Parameters<FieldRenderer['Renderer']>[0]) {
  const linkedIds: string[] = Array.isArray(value) ? value : value ? [value] : [];

  return (
    <div className="space-y-2">
      {linkedIds.length > 0 ? (
        <div className="space-y-1">
          {linkedIds.map((id) => (
            <div
              key={id}
              className="flex items-center gap-2 px-2 py-1.5 bg-gray-100 dark:bg-gray-800 rounded text-sm"
            >
              <Link2 className="w-3.5 h-3.5 text-gray-400" />
              <span className="flex-1 text-gray-700 dark:text-gray-300 truncate">
                {id}
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
            </div>
          ))}
        </div>
      ) : (
        <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>
      )}
      {canEdit && field.relatedWorkspaceId && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Связь настраивается через LinkedEntities
        </p>
      )}
    </div>
  );
}

function RelationForm() {
  return (
    <p className="text-xs text-gray-400 dark:text-gray-500">
      Связи можно добавить после создания заявки
    </p>
  );
}

export const relationFieldRenderer: FieldRenderer = {
  Renderer: RelationRenderer,
  Form: RelationForm,
};
