import { Injectable, BadRequestException } from '@nestjs/common';

interface FieldRule {
  id: string;
  type: string; // 'visibility' | 'required_if' | 'computed'
  condition?: any;
  action?: any;
}

interface FieldDefinition {
  id: string;
  name: string;
  type: string;
  required?: boolean;
  options?: { id: string; label: string }[];
  config?: Record<string, any>;
  rules?: FieldRule[];
}

interface WorkspaceSections {
  fields: FieldDefinition[];
}

interface ValidationError {
  fieldId: string;
  fieldName: string;
  message: string;
}

@Injectable()
export class FieldValidationService {
  /**
   * Валидирует data по полям workspace.
   * Бросает BadRequestException если есть ошибки.
   */
  validateEntityData(
    data: Record<string, any>,
    sections: WorkspaceSections[],
  ): void {
    const fields = sections.flatMap((s) => s.fields);
    const errors = this.validate(data, fields);

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Field validation failed',
        errors,
      });
    }
  }

  /**
   * Возвращает список ошибок валидации (без throw).
   */
  validate(
    data: Record<string, any>,
    fields: FieldDefinition[],
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const field of fields) {
      const value = data[field.id];
      const fieldErrors = this.validateField(field, value);
      errors.push(...fieldErrors);
    }

    return errors;
  }

  private isComputed(field: FieldDefinition): boolean {
    return (field.rules || []).some((r) => r.type === 'computed');
  }

  private validateField(field: FieldDefinition, value: any): ValidationError[] {
    const errors: ValidationError[] = [];
    const config = field.config || {};

    // Computed поля заполняются автоматически — не валидируем required
    const computed = this.isComputed(field);

    // Required check (пропускаем для computed полей)
    if (!computed && field.required && this.isEmpty(value, field.type)) {
      errors.push({
        fieldId: field.id,
        fieldName: field.name,
        message: `Поле "${field.name}" обязательно для заполнения`,
      });
      return errors; // Не продолжаем проверку если пусто
    }

    // Пропускаем валидацию пустых полей (необязательных или computed)
    if (this.isEmpty(value, field.type)) {
      return errors;
    }

    switch (field.type) {
      case 'text':
        if (typeof value !== 'string') {
          errors.push(this.err(field, 'Значение должно быть строкой'));
        } else {
          if (config.maxLength && value.length > config.maxLength) {
            errors.push(this.err(field, `Максимальная длина: ${config.maxLength} символов`));
          }
        }
        break;

      case 'textarea':
        if (typeof value !== 'string') {
          errors.push(this.err(field, 'Значение должно быть строкой'));
        }
        break;

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push(this.err(field, 'Значение должно быть числом'));
        } else {
          if (config.min !== undefined && value < config.min) {
            errors.push(this.err(field, `Минимальное значение: ${config.min}`));
          }
          if (config.max !== undefined && value > config.max) {
            errors.push(this.err(field, `Максимальное значение: ${config.max}`));
          }
        }
        break;

      case 'date':
        if (typeof value !== 'string' || isNaN(Date.parse(value))) {
          errors.push(this.err(field, 'Некорректная дата'));
        }
        break;

      case 'select':
      case 'status': {
        const options = field.options || [];
        const validIds = options.map((o) => o.id);
        const isMulti = config.multiSelect;

        if (isMulti) {
          if (!Array.isArray(value)) {
            errors.push(this.err(field, 'Значение должно быть массивом'));
          } else {
            for (const v of value) {
              if (!validIds.includes(v)) {
                errors.push(this.err(field, `Недопустимый вариант: ${v}`));
              }
            }
          }
        } else {
          if (typeof value !== 'string' || !validIds.includes(value)) {
            errors.push(this.err(field, 'Выбран недопустимый вариант'));
          }
        }
        break;
      }

      case 'user':
        if (config.multiSelect) {
          if (!Array.isArray(value)) {
            errors.push(this.err(field, 'Значение должно быть массивом'));
          } else if (!value.every((v: any) => typeof v === 'string')) {
            errors.push(this.err(field, 'Все ID пользователей должны быть строками'));
          }
        } else {
          if (typeof value !== 'string') {
            errors.push(this.err(field, 'ID пользователя должен быть строкой'));
          }
        }
        break;

      case 'checkbox':
        if (typeof value !== 'boolean') {
          errors.push(this.err(field, 'Значение должно быть true/false'));
        }
        break;

      case 'url':
        if (typeof value !== 'string') {
          errors.push(this.err(field, 'Значение должно быть строкой'));
        } else {
          try {
            const parsed = new URL(value);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
              errors.push(this.err(field, 'URL должен начинаться с http:// или https://'));
            }
          } catch {
            errors.push(this.err(field, 'Некорректный URL'));
          }
        }
        break;

      case 'geolocation':
        if (typeof value !== 'object' || value === null) {
          errors.push(this.err(field, 'Значение должно быть объектом'));
        } else {
          if (typeof value.lat !== 'number' || typeof value.lng !== 'number') {
            errors.push(this.err(field, 'Координаты (lat, lng) должны быть числами'));
          }
        }
        break;

      case 'client':
        if (typeof value !== 'object' || value === null) {
          errors.push(this.err(field, 'Значение должно быть объектом'));
        }
        break;
    }

    return errors;
  }

  private isEmpty(value: any, type: string): boolean {
    if (value === undefined || value === null) return true;
    if (type === 'checkbox') return false; // false — валидное значение
    if (value === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  }

  private err(field: FieldDefinition, message: string): ValidationError {
    return { fieldId: field.id, fieldName: field.name, message };
  }
}
