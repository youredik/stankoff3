'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useEntityStore } from '@/store/useEntityStore';

const PRIORITIES = [
  { value: 'high' as const, label: 'Высокий', cls: 'bg-red-100 text-red-800 border-red-200' },
  { value: 'medium' as const, label: 'Средний', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 'low' as const, label: 'Низкий', cls: 'bg-green-100 text-green-800 border-green-200' },
];

interface CreateEntityModalProps {
  workspaceId: string;
  onClose: () => void;
}

export function CreateEntityModal({ workspaceId, onClose }: CreateEntityModalProps) {
  const { users, createEntity } = useEntityStore();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    await createEntity({
      workspaceId,
      title: title.trim(),
      priority,
      assigneeId: assigneeId || undefined,
    });
    setSubmitting(false);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-entity-title"
          className="bg-white rounded-xl shadow-xl w-[440px] max-w-[90vw]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b">
            <h3 id="create-entity-title" className="text-lg font-semibold text-gray-900">
              Новая заявка
            </h3>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Form */}
          <div className="p-5 space-y-4">
            {/* Title */}
            <div>
              <label htmlFor="entity-title" className="block text-xs font-medium text-gray-500 uppercase mb-1">
                Название
              </label>
              <input
                id="entity-title"
                name="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="Описание проблемы или задачи"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                autoFocus
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                Приоритет
              </label>
              <div className="flex gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                      priority === p.value
                        ? p.cls + ' ring-2 ring-offset-1 ring-primary-500'
                        : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Assignee */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                Исполнитель
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Не назначить</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 p-5 border-t">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleSubmit}
              disabled={!title.trim() || submitting}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Создаём…' : 'Создать заявку'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
