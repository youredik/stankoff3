// Type declarations for @bpmn-io/form-js

// Re-export types from the library
declare module '@bpmn-io/form-js' {
  export interface FormSchema {
    type: string;
    id?: string;
    components?: FormComponent[];
    [key: string]: unknown;
  }

  export interface FormComponent {
    type: string;
    id?: string;
    key?: string;
    label?: string;
    description?: string;
    validate?: {
      required?: boolean;
      minLength?: number;
      maxLength?: number;
      pattern?: string;
      min?: number;
      max?: number;
    };
    [key: string]: unknown;
  }

  export interface FormData {
    [key: string]: unknown;
  }

  export interface FormErrors {
    [key: string]: string[];
  }

  export interface FormSubmitResult {
    data: FormData;
    errors: FormErrors;
    files: Map<string, File[]>;
  }

  export interface FormOptions {
    container?: HTMLElement | string;
    schema?: FormSchema;
    data?: FormData;
    properties?: FormProperties;
    additionalModules?: unknown[];
  }

  export interface FormProperties {
    readOnly?: boolean;
    disabled?: boolean;
  }

  export interface FormImportResult {
    warnings: string[];
  }

  export class Form {
    constructor(options?: FormOptions);
    importSchema(schema: FormSchema, data?: FormData): Promise<FormImportResult>;
    submit(): FormSubmitResult;
    reset(): void;
    validate(): FormErrors;
    attachTo(parentNode: Element | string): void;
    detach(): void;
    destroy(): void;
    setProperty(property: string, value: unknown): void;
    on(event: string, callback: (...args: unknown[]) => void): void;
    off(event: string, callback?: (...args: unknown[]) => void): void;
  }

  export interface FormEditorOptions {
    container?: HTMLElement | string;
    schema?: FormSchema;
    additionalModules?: unknown[];
  }

  export interface FormEditorImportResult {
    warnings: string[];
  }

  export interface CommandStack {
    canUndo(): boolean;
    canRedo(): boolean;
    undo(): void;
    redo(): void;
  }

  export class FormEditor {
    constructor(options?: FormEditorOptions);
    importSchema(schema: FormSchema): Promise<FormEditorImportResult>;
    saveSchema(): FormSchema;
    getSchema(): FormSchema;
    attachTo(parentNode: Element | string): void;
    detach(): void;
    destroy(): void;
    setProperty(property: string, value: unknown): void;
    on(event: string, callback: (...args: unknown[]) => void): void;
    off(event: string, callback?: (...args: unknown[]) => void): void;
    get<T = unknown>(name: string): T | undefined;
  }

  export function createForm(options: FormOptions): Promise<Form>;
  export function createFormEditor(options: FormEditorOptions): Promise<FormEditor>;

  export const schemaVersion: number;
}

// CSS modules
declare module '@bpmn-io/form-js/dist/assets/form-js.css';
declare module '@bpmn-io/form-js/dist/assets/form-js-base.css';
declare module '@bpmn-io/form-js/dist/assets/form-js-editor.css';
declare module '@bpmn-io/form-js/dist/assets/form-js-editor-base.css';
declare module '@bpmn-io/form-js/dist/assets/properties-panel.css';
declare module '@bpmn-io/form-js/dist/assets/flatpickr/light.css';
