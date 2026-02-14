'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { FormEditor as FormEditorType, FormSchema, CommandStack } from '@bpmn-io/form-js';
import { Save, Download, Upload, Undo, Redo, Eye } from 'lucide-react';

// Form-JS editor styles
import '@bpmn-io/form-js/dist/assets/form-js.css';
import '@bpmn-io/form-js/dist/assets/form-js-editor.css';
import '@bpmn-io/form-js/dist/assets/properties-panel.css';
import '@bpmn-io/form-js/dist/assets/flatpickr/light.css';

// Default empty form schema
const EMPTY_SCHEMA: FormSchema = {
  type: 'default',
  components: [],
};

interface FormEditorProps {
  schema?: FormSchema;
  onChange?: (schema: FormSchema) => void;
  onSave?: (schema: FormSchema) => void;
  onPreview?: (schema: FormSchema) => void;
  className?: string;
}

export function FormEditor({
  schema,
  onChange,
  onSave,
  onPreview,
  className = '',
}: FormEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<FormEditorType | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;

    let mounted = true;

    const initEditor = async () => {
      try {
        // Dynamic import to avoid SSR issues
        const { FormEditor: FormEditorClass } = await import('@bpmn-io/form-js');

        if (!mounted || !containerRef.current) return;

        const editor = new FormEditorClass({
          container: containerRef.current,
        });

        editorRef.current = editor;

        // Import schema
        const formSchema = schema || EMPTY_SCHEMA;
        await editor.importSchema(formSchema);

        // Listen for changes
        editor.on('changed', () => {
          if (onChange && editorRef.current) {
            const currentSchema = editorRef.current.getSchema();
            onChange(currentSchema);
          }

          // Update undo/redo state
          updateCommandStackState();
        });

        editor.on('commandStack.changed', () => {
          updateCommandStackState();
        });

        setIsLoaded(true);
        setError(null);
      } catch (err) {
        console.error('Failed to initialize form editor:', err);
        setError('Failed to load form editor');
      }
    };

    initEditor();

    return () => {
      mounted = false;
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, []);

  // Update schema when prop changes
  useEffect(() => {
    if (!editorRef.current || !isLoaded) return;

    const updateSchema = async () => {
      try {
        // Only update if the schema is different
        const currentSchema = editorRef.current!.getSchema();
        if (JSON.stringify(schema) !== JSON.stringify(currentSchema) && schema) {
          await editorRef.current!.importSchema(schema);
        }
      } catch (err) {
        console.error('Failed to update schema:', err);
      }
    };

    updateSchema();
  }, [schema, isLoaded]);

  const updateCommandStackState = useCallback(() => {
    if (!editorRef.current) return;

    try {
      const commandStack = editorRef.current.get<CommandStack>('commandStack');
      if (commandStack) {
        setCanUndo(commandStack.canUndo?.() || false);
        setCanRedo(commandStack.canRedo?.() || false);
      }
    } catch {
      // Command stack not available
    }
  }, []);

  const handleSave = useCallback(() => {
    if (!editorRef.current || !onSave) return;

    try {
      const currentSchema = editorRef.current.getSchema();
      onSave(currentSchema);
    } catch (err) {
      console.error('Failed to save form:', err);
      setError('Failed to save');
    }
  }, [onSave]);

  const handlePreview = useCallback(() => {
    if (!editorRef.current || !onPreview) return;

    try {
      const currentSchema = editorRef.current.getSchema();
      onPreview(currentSchema);
    } catch (err) {
      console.error('Failed to get schema for preview:', err);
    }
  }, [onPreview]);

  const handleExport = useCallback(() => {
    if (!editorRef.current) return;

    try {
      const currentSchema = editorRef.current.getSchema();
      const schemaJson = JSON.stringify(currentSchema, null, 2);
      const blob = new Blob([schemaJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'form-schema.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export form:', err);
    }
  }, []);

  const handleImport = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !editorRef.current) return;

      try {
        const text = await file.text();
        const importedSchema = JSON.parse(text) as FormSchema;
        await editorRef.current.importSchema(importedSchema);
        if (onChange) {
          onChange(importedSchema);
        }
      } catch (err) {
        console.error('Failed to import form:', err);
        setError('Failed to import form file. Make sure it is a valid JSON schema.');
      }
    },
    [onChange]
  );

  const handleUndo = useCallback(() => {
    if (!editorRef.current) return;

    try {
      const commandStack = editorRef.current.get<CommandStack>('commandStack');
      if (commandStack?.undo) {
        commandStack.undo();
      }
    } catch {
      // Undo not available
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (!editorRef.current) return;

    try {
      const commandStack = editorRef.current.get<CommandStack>('commandStack');
      if (commandStack?.redo) {
        commandStack.redo();
      }
    } catch {
      // Redo not available
    }
  }, []);

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-900 ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-1">
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            title="Undo"
            aria-label="Отменить"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            title="Redo"
            aria-label="Повторить"
          >
            <Redo className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

          <label className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg cursor-pointer">
            <Upload className="w-4 h-4" />
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
          <button
            onClick={handleExport}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            title="Export form schema"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {onPreview && (
            <button
              onClick={handlePreview}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <Eye className="w-4 h-4" />
              Preview
            </button>
          )}

          {onSave && (
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Editor container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{ minHeight: '400px' }}
      />

      {/* Loading overlay */}
      {!isLoaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Loading form editor...</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default FormEditor;
