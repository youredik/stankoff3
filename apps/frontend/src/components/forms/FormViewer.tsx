'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Form, FormSchema, FormData, FormErrors, FormSubmitResult } from '@bpmn-io/form-js';
import { Send, RotateCcw, AlertCircle } from 'lucide-react';

// Form-JS styles
import '@bpmn-io/form-js/dist/assets/form-js.css';

// Default empty form schema
const EMPTY_SCHEMA: FormSchema = {
  type: 'default',
  components: [
    {
      type: 'text',
      text: 'Form not configured',
    },
  ],
};

interface FormViewerProps {
  schema?: FormSchema;
  data?: FormData;
  onSubmit?: (result: FormSubmitResult) => void;
  onChange?: (data: FormData) => void;
  readOnly?: boolean;
  disabled?: boolean;
  submitLabel?: string;
  showSubmitButton?: boolean;
  className?: string;
}

export function FormViewer({
  schema,
  data,
  onSubmit,
  onChange,
  readOnly = false,
  disabled = false,
  submitLabel = 'Submit',
  showSubmitButton = true,
  className = '',
}: FormViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<Form | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<FormErrors>({});

  // Initialize form
  useEffect(() => {
    if (!containerRef.current) return;

    let mounted = true;

    const initForm = async () => {
      try {
        // Dynamic import to avoid SSR issues
        const { Form } = await import('@bpmn-io/form-js');

        if (!mounted || !containerRef.current) return;

        const form = new Form({
          container: containerRef.current,
        });

        formRef.current = form;

        // Import schema
        const formSchema = schema || EMPTY_SCHEMA;
        await form.importSchema(formSchema, data);

        // Set properties
        form.setProperty('readOnly', readOnly);
        form.setProperty('disabled', disabled);

        // Listen for changes
        if (onChange) {
          form.on('changed', (event: unknown) => {
            const formEvent = event as { data: FormData };
            onChange(formEvent.data);
          });
        }

        setIsLoaded(true);
        setError(null);
      } catch (err) {
        console.error('Failed to initialize form:', err);
        setError('Failed to load form');
      }
    };

    initForm();

    return () => {
      mounted = false;
      if (formRef.current) {
        formRef.current.destroy();
        formRef.current = null;
      }
    };
  }, [readOnly, disabled]);

  // Update schema when prop changes
  useEffect(() => {
    if (!formRef.current || !isLoaded) return;

    const updateSchema = async () => {
      try {
        const formSchema = schema || EMPTY_SCHEMA;
        await formRef.current!.importSchema(formSchema, data);
      } catch (err) {
        console.error('Failed to update schema:', err);
        setError('Failed to update form');
      }
    };

    updateSchema();
  }, [schema, isLoaded]);

  // Update data when prop changes
  useEffect(() => {
    if (!formRef.current || !isLoaded || !data) return;

    const updateData = async () => {
      try {
        const currentSchema = schema || EMPTY_SCHEMA;
        await formRef.current!.importSchema(currentSchema, data);
      } catch (err) {
        console.error('Failed to update data:', err);
      }
    };

    updateData();
  }, [data, isLoaded]);

  // Update properties when they change
  useEffect(() => {
    if (!formRef.current || !isLoaded) return;
    formRef.current.setProperty('readOnly', readOnly);
    formRef.current.setProperty('disabled', disabled);
  }, [readOnly, disabled, isLoaded]);

  const handleSubmit = useCallback(() => {
    if (!formRef.current || !onSubmit) return;

    const result = formRef.current.submit();
    setValidationErrors(result.errors);

    // Check if there are any errors
    const hasErrors = Object.keys(result.errors).some(
      (key) => result.errors[key] && result.errors[key].length > 0
    );

    if (!hasErrors) {
      onSubmit(result);
    }
  }, [onSubmit]);

  const handleReset = useCallback(() => {
    if (!formRef.current) return;
    formRef.current.reset();
    setValidationErrors({});
  }, []);

  const errorCount = Object.keys(validationErrors).filter(
    (key) => validationErrors[key] && validationErrors[key].length > 0
  ).length;

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-900 ${className}`}>
      {/* Error message */}
      {error && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Validation errors summary */}
      {errorCount > 0 && (
        <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {errorCount === 1
            ? 'Please fix 1 validation error'
            : `Please fix ${errorCount} validation errors`}
        </div>
      )}

      {/* Form container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto p-4"
        style={{ minHeight: '200px' }}
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
            <span>Loading form...</span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {isLoaded && !readOnly && showSubmitButton && (
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleSubmit}
            disabled={disabled}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
            {submitLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export default FormViewer;
