import type { Field, User } from '@/types';

// Props для рендеринга поля в EntityDetailPanel (view/edit mode)
export interface FieldRendererProps {
  field: Field;
  value: any;
  users: User[];
  canEdit: boolean;
  onUpdate: (value: any) => void;
  allData?: Record<string, any>;
}

// Props для рендеринга поля в CreateEntityModal
export interface FieldFormRendererProps {
  field: Field;
  value: any;
  users: User[];
  onChange: (value: any) => void;
  allData?: Record<string, any>;
}

// Props для рендеринга фильтра в FilterPanel
export interface FieldFilterRendererProps {
  field: Field;
  filterValue: any;
  users: User[];
  onChange: (value: any) => void;
  toggleMultiSelect: (optionId: string) => void;
  inputClass: string;
  allFields?: Field[];
  allFilterValues?: Record<string, any>;
}

// Интерфейс рендерера поля — каждый тип реализует этот интерфейс
export interface FieldRenderer {
  Renderer: React.FC<FieldRendererProps>;
  Form: React.FC<FieldFormRendererProps>;
  Filter?: React.FC<FieldFilterRendererProps>;
}
