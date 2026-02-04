'use client';

import { useState, useCallback } from 'react';
import type { FormSchema, FormFieldSchema, FormUISchema } from '@/types';

interface DynamicFormProps {
  schema: FormSchema;
  uiSchema?: FormUISchema;
  initialData?: Record<string, unknown>;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel?: () => void;
  readOnly?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
}

interface ValidationError {
  field: string;
  message: string;
}

function validateField(
  name: string,
  value: unknown,
  fieldSchema: FormFieldSchema,
  required: boolean
): string | null {
  // Required check
  if (required && (value === undefined || value === null || value === '')) {
    return 'Обязательное поле';
  }

  if (value === undefined || value === null || value === '') {
    return null;
  }

  // Type-specific validation
  switch (fieldSchema.type) {
    case 'string': {
      const strValue = String(value);
      if (fieldSchema.minLength && strValue.length < fieldSchema.minLength) {
        return `Минимум ${fieldSchema.minLength} символов`;
      }
      if (fieldSchema.maxLength && strValue.length > fieldSchema.maxLength) {
        return `Максимум ${fieldSchema.maxLength} символов`;
      }
      if (fieldSchema.pattern && !new RegExp(fieldSchema.pattern).test(strValue)) {
        return 'Неверный формат';
      }
      if (fieldSchema.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strValue)) {
        return 'Неверный email';
      }
      break;
    }
    case 'number': {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        return 'Должно быть числом';
      }
      if (fieldSchema.minimum !== undefined && numValue < fieldSchema.minimum) {
        return `Минимум ${fieldSchema.minimum}`;
      }
      if (fieldSchema.maximum !== undefined && numValue > fieldSchema.maximum) {
        return `Максимум ${fieldSchema.maximum}`;
      }
      break;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        return 'Должен быть массивом';
      }
      if (fieldSchema.minItems && value.length < fieldSchema.minItems) {
        return `Минимум ${fieldSchema.minItems} элементов`;
      }
      if (fieldSchema.maxItems && value.length > fieldSchema.maxItems) {
        return `Максимум ${fieldSchema.maxItems} элементов`;
      }
      break;
    }
  }

  return null;
}

function validateForm(
  data: Record<string, unknown>,
  schema: FormSchema
): ValidationError[] {
  const errors: ValidationError[] = [];
  const required = schema.required || [];

  for (const [name, fieldSchema] of Object.entries(schema.properties)) {
    const error = validateField(name, data[name], fieldSchema, required.includes(name));
    if (error) {
      errors.push({ field: name, message: error });
    }
  }

  return errors;
}

export function DynamicForm({
  schema,
  uiSchema,
  initialData = {},
  onSubmit,
  onCancel,
  readOnly = false,
  submitLabel = 'Отправить',
  cancelLabel = 'Отмена',
}: DynamicFormProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const handleChange = useCallback((name: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when field is changed
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }, [errors]);

  const handleBlur = useCallback((name: string) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    // Validate single field on blur
    const fieldSchema = schema.properties[name];
    if (fieldSchema) {
      const required = (schema.required || []).includes(name);
      const error = validateField(name, formData[name], fieldSchema, required);
      if (error) {
        setErrors((prev) => ({ ...prev, [name]: error }));
      }
    }
  }, [formData, schema]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all fields
    const validationErrors = validateForm(formData, schema);
    if (validationErrors.length > 0) {
      const errorMap: Record<string, string> = {};
      validationErrors.forEach((err) => {
        errorMap[err.field] = err.message;
      });
      setErrors(errorMap);
      // Mark all as touched
      const allTouched: Record<string, boolean> = {};
      Object.keys(schema.properties).forEach((name) => {
        allTouched[name] = true;
      });
      setTouched(allTouched);
      return;
    }

    onSubmit(formData);
  };

  // Get field order from uiSchema or use default
  const fieldOrder = uiSchema?.['ui:order'] || Object.keys(schema.properties);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {schema.title && (
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {schema.title}
        </h3>
      )}
      {schema.description && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {schema.description}
        </p>
      )}

      {fieldOrder.map((fieldName) => {
        if (fieldName === 'ui:order') return null;
        const fieldSchema = schema.properties[fieldName];
        if (!fieldSchema) return null;

        const fieldUi = uiSchema?.[fieldName] as Record<string, unknown> | undefined;
        const isHidden = fieldUi?.['ui:hidden'];
        if (isHidden) return null;

        const isRequired = (schema.required || []).includes(fieldName);
        const error = touched[fieldName] ? errors[fieldName] : undefined;

        return (
          <FormField
            key={fieldName}
            name={fieldName}
            schema={fieldSchema}
            uiSchema={fieldUi}
            value={formData[fieldName]}
            error={error}
            required={isRequired}
            disabled={readOnly || fieldUi?.['ui:disabled'] as boolean}
            onChange={(value) => handleChange(fieldName, value)}
            onBlur={() => handleBlur(fieldName)}
          />
        );
      })}

      {!readOnly && (
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
          >
            {submitLabel}
          </button>
        </div>
      )}
    </form>
  );
}

interface FormFieldProps {
  name: string;
  schema: FormFieldSchema;
  uiSchema?: Record<string, unknown>;
  value: unknown;
  error?: string;
  required: boolean;
  disabled: boolean;
  onChange: (value: unknown) => void;
  onBlur: () => void;
}

function FormField({
  name,
  schema,
  uiSchema,
  value,
  error,
  required,
  disabled,
  onChange,
  onBlur,
}: FormFieldProps) {
  const label = schema.title || name;
  const help = uiSchema?.['ui:help'] as string | undefined;
  const placeholder = uiSchema?.['ui:placeholder'] as string | undefined;
  const widget = uiSchema?.['ui:widget'] as string | undefined;

  const baseInputClass = `w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors ${
    error
      ? 'border-red-300 dark:border-red-700'
      : 'border-gray-300 dark:border-gray-600'
  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;

  // Render based on type and format
  let input: React.ReactNode;

  if (schema.enum) {
    // Select or radio
    if (widget === 'radio') {
      input = (
        <div className="space-y-2">
          {schema.enum.map((option, idx) => (
            <label key={idx} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={name}
                value={String(option)}
                checked={value === option}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                disabled={disabled}
                className="text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {schema.enumNames?.[idx] || String(option)}
              </span>
            </label>
          ))}
        </div>
      );
    } else {
      input = (
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          className={baseInputClass}
        >
          <option value="">{placeholder || 'Выберите...'}</option>
          {schema.enum.map((option, idx) => (
            <option key={idx} value={String(option)}>
              {schema.enumNames?.[idx] || String(option)}
            </option>
          ))}
        </select>
      );
    }
  } else if (schema.type === 'boolean') {
    input = (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          onBlur={onBlur}
          disabled={disabled}
          className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      </label>
    );
  } else if (schema.type === 'number') {
    input = (
      <input
        type="number"
        value={value !== undefined ? String(value) : ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
        min={schema.minimum}
        max={schema.maximum}
        className={baseInputClass}
      />
    );
  } else if (schema.format === 'textarea' || widget === 'textarea') {
    const rows = (uiSchema?.['ui:options'] as Record<string, unknown>)?.rows as number | undefined;
    input = (
      <textarea
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
        rows={rows || 4}
        maxLength={schema.maxLength}
        className={baseInputClass}
      />
    );
  } else if (schema.format === 'date') {
    input = (
      <input
        type="date"
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        className={baseInputClass}
      />
    );
  } else if (schema.format === 'date-time') {
    input = (
      <input
        type="datetime-local"
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        className={baseInputClass}
      />
    );
  } else if (schema.format === 'email') {
    input = (
      <input
        type="email"
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder || 'email@example.com'}
        className={baseInputClass}
      />
    );
  } else {
    // Default text input
    input = (
      <input
        type="text"
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={schema.maxLength}
        className={baseInputClass}
      />
    );
  }

  // For boolean, label is inline
  if (schema.type === 'boolean') {
    return (
      <div>
        {input}
        {help && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{help}</p>
        )}
        {error && (
          <p className="mt-1 text-xs text-red-500">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {schema.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          {schema.description}
        </p>
      )}
      {input}
      {help && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{help}</p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}

export default DynamicForm;
