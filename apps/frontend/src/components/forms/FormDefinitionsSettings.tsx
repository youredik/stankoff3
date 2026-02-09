'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Pencil, Trash2, ChevronRight, Eye } from 'lucide-react';
import type { FormDefinition } from '@/types';
import type { FormSchema } from '@bpmn-io/form-js';
import * as formsApi from '@/lib/api/forms';

const FormEditor = dynamic(
  () => import('./FormEditor').then((mod) => mod.FormEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" />
      </div>
    ),
  },
);

const FormViewer = dynamic(
  () => import('./FormViewer').then((mod) => mod.FormViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" />
      </div>
    ),
  },
);

interface FormDefinitionsSettingsProps {
  workspaceId: string;
}

type ViewMode = 'list' | 'edit' | 'preview';

export function FormDefinitionsSettings({
  workspaceId,
}: FormDefinitionsSettingsProps) {
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingForm, setEditingForm] = useState<FormDefinition | null>(null);

  // Form editor state
  const [formName, setFormName] = useState('');
  const [formKey, setFormKey] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSchema, setFormSchema] = useState<FormSchema | undefined>(
    undefined,
  );

  useEffect(() => {
    loadForms();
  }, [workspaceId]);

  async function loadForms() {
    try {
      setLoading(true);
      setError(null);
      const data = await formsApi.getFormDefinitions(workspaceId);
      setForms(data);
    } catch {
      setError('Не удалось загрузить формы');
    } finally {
      setLoading(false);
    }
  }

  function handleCreate() {
    setEditingForm(null);
    setFormName('');
    setFormKey('');
    setFormDescription('');
    setFormSchema(undefined);
    setViewMode('edit');
  }

  function handleEdit(form: FormDefinition) {
    setEditingForm(form);
    setFormName(form.name);
    setFormKey(form.key);
    setFormDescription(form.description || '');
    setFormSchema(form.schema as unknown as FormSchema);
    setViewMode('edit');
  }

  function handlePreview(form: FormDefinition) {
    setEditingForm(form);
    setFormSchema(form.schema as unknown as FormSchema);
    setViewMode('preview');
  }

  function handleCancel() {
    setViewMode('list');
    setEditingForm(null);
    setError(null);
  }

  async function handleSave() {
    if (!formName.trim() || !formKey.trim()) {
      setError('Название и ключ обязательны');
      return;
    }
    if (!formSchema) {
      setError('Необходимо добавить хотя бы одно поле в форму');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      if (editingForm) {
        const updated = await formsApi.updateFormDefinition(editingForm.id, {
          name: formName,
          key: formKey,
          description: formDescription || undefined,
          schema: formSchema as unknown as Record<string, any>,
        });
        setForms(forms.map((f) => (f.id === updated.id ? updated : f)));
      } else {
        const created = await formsApi.createFormDefinition({
          workspaceId,
          name: formName,
          key: formKey,
          description: formDescription || undefined,
          schema: formSchema as unknown as Record<string, any>,
        });
        setForms([...forms, created]);
      }

      setViewMode('list');
      setEditingForm(null);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || 'Не удалось сохранить форму';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Удалить определение формы?')) return;
    try {
      await formsApi.deleteFormDefinition(id);
      setForms(forms.filter((f) => f.id !== id));
    } catch {
      setError('Не удалось удалить');
    }
  }

  const handleSchemaChange = useCallback((schema: FormSchema) => {
    setFormSchema(schema);
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {viewMode === 'preview' && editingForm ? (
        <div>
          <button
            onClick={handleCancel}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 mb-4"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            Назад к списку
          </button>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
              {editingForm.name}
              <span className="ml-2 text-sm text-gray-500">
                ({editingForm.key})
              </span>
            </h3>
            <FormViewer
              schema={formSchema}
              readOnly
              showSubmitButton={false}
            />
          </div>
        </div>
      ) : viewMode === 'edit' ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            {editingForm ? 'Редактирование формы' : 'Новая форма'}
          </h3>

          {/* Metadata fields */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Название
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Форма согласования"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Ключ (уникальный ID)
              </label>
              <input
                type="text"
                value={formKey}
                onChange={(e) =>
                  setFormKey(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, '-'),
                  )
                }
                placeholder="approval-form"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Описание
            </label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Опишите назначение формы"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Form Editor */}
          <div
            className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-4"
            style={{ minHeight: '500px' }}
          >
            <FormEditor
              schema={formSchema}
              onChange={handleSchemaChange}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              Формы
            </h3>
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700"
            >
              <Plus className="w-4 h-4" />
              Создать
            </button>
          </div>

          {forms.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              Нет определений форм. Создайте первую форму для использования в
              задачах BPMN.
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {forms.map((form) => (
                <div
                  key={form.id}
                  className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {form.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs ${
                          form.isActive
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        {form.isActive ? 'Активна' : 'Неактивна'}
                      </span>
                      <code className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-400">
                        {form.key}
                      </code>
                    </div>
                    {form.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {form.description}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      v{form.version}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePreview(form)}
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Предпросмотр"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEdit(form)}
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Редактировать"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(form.id)}
                      className="p-2 text-gray-400 hover:text-red-500"
                      title="Удалить"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
