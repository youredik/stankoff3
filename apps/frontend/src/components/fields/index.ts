import type { FieldType } from '@/types';
import type { FieldRenderer } from './types';
import { textFieldRenderer } from './TextField';
import { textareaFieldRenderer } from './TextareaField';
import { numberFieldRenderer } from './NumberField';
import { dateFieldRenderer } from './DateField';
import { selectFieldRenderer } from './SelectField';
import { userFieldRenderer } from './UserField';
import { fileFieldRenderer } from './FileField';
import { relationFieldRenderer } from './RelationField';
import { checkboxFieldRenderer } from './CheckboxField';
import { urlFieldRenderer } from './UrlField';
import { geolocationFieldRenderer } from './GeolocationField';
import { clientFieldRenderer } from './ClientField';

// Status использует тот же renderer что и select (options с цветами)
const statusFieldRenderer = selectFieldRenderer;

export const fieldRegistry: Record<FieldType, FieldRenderer> = {
  text: textFieldRenderer,
  textarea: textareaFieldRenderer,
  number: numberFieldRenderer,
  date: dateFieldRenderer,
  select: selectFieldRenderer,
  status: statusFieldRenderer,
  user: userFieldRenderer,
  file: fileFieldRenderer,
  relation: relationFieldRenderer,
  checkbox: checkboxFieldRenderer,
  url: urlFieldRenderer,
  geolocation: geolocationFieldRenderer,
  client: clientFieldRenderer,
};

export type { FieldRenderer, FieldRendererProps, FieldFormRendererProps, FieldFilterRendererProps } from './types';
