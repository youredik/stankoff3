import type { Field, FieldRule, FieldRuleOperator } from '@/types';
import { evaluateFormula } from './rules/formula-parser';

/**
 * Вычисляет, должно ли поле быть видимым на основании правил.
 * Если нет правил visibility — поле видимо по умолчанию.
 */
export function evaluateVisibility(
  field: Field,
  allFields: Field[],
  data: Record<string, any>,
): boolean {
  const visibilityRules = (field.rules || []).filter((r) => r.type === 'visibility');
  if (visibilityRules.length === 0) return true;

  // Если хотя бы одно visibility правило активно → применяем action.visible
  for (const rule of visibilityRules) {
    const match = evaluateCondition(rule.condition, allFields, data);
    if (match) {
      return rule.action.visible ?? true;
    }
  }

  // Если ни одно visibility правило не сработало — показываем поле
  return true;
}

/**
 * Вычисляет, обязательно ли поле на основании правил required_if.
 * Базовое required из field.required всегда учитывается.
 */
export function evaluateRequired(
  field: Field,
  allFields: Field[],
  data: Record<string, any>,
): boolean {
  if (field.required) return true;

  const requiredRules = (field.rules || []).filter((r) => r.type === 'required_if');
  for (const rule of requiredRules) {
    if (evaluateCondition(rule.condition, allFields, data)) {
      return rule.action.required ?? true;
    }
  }

  return false;
}

/**
 * Вычисляет condition правила.
 */
export function evaluateCondition(
  condition: { fieldId: string; operator: FieldRuleOperator; value?: any },
  allFields: Field[],
  data: Record<string, any>,
): boolean {
  const fieldValue = data[condition.fieldId];
  const compareValue = condition.value;

  return evaluateOperator(condition.operator, fieldValue, compareValue);
}

function evaluateOperator(
  operator: FieldRuleOperator,
  fieldValue: any,
  compareValue: any,
): boolean {
  switch (operator) {
    case 'eq':
      return fieldValue == compareValue;
    case 'neq':
      return fieldValue != compareValue;
    case 'gt':
      return Number(fieldValue) > Number(compareValue);
    case 'lt':
      return Number(fieldValue) < Number(compareValue);
    case 'gte':
      return Number(fieldValue) >= Number(compareValue);
    case 'lte':
      return Number(fieldValue) <= Number(compareValue);
    case 'in':
      if (Array.isArray(compareValue)) {
        return compareValue.includes(fieldValue);
      }
      return false;
    case 'not_in':
      if (Array.isArray(compareValue)) {
        return !compareValue.includes(fieldValue);
      }
      return true;
    case 'is_empty':
      return fieldValue === null || fieldValue === undefined || fieldValue === '' ||
        (Array.isArray(fieldValue) && fieldValue.length === 0);
    case 'is_not_empty':
      return fieldValue !== null && fieldValue !== undefined && fieldValue !== '' &&
        !(Array.isArray(fieldValue) && fieldValue.length === 0);
    case 'contains':
      if (typeof fieldValue === 'string' && typeof compareValue === 'string') {
        return fieldValue.toLowerCase().includes(compareValue.toLowerCase());
      }
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(compareValue);
      }
      return false;
    default:
      return false;
  }
}

/**
 * Вычисляет значение computed-поля на основании правил.
 * Если нет computed правил — возвращает undefined (не вычисляемое поле).
 * Если condition задано (fieldId не пустой) — проверяет условие перед вычислением.
 */
export function evaluateComputed(
  field: Field,
  allFields: Field[],
  data: Record<string, any>,
): { value: number | string | null; isComputed: true } | undefined {
  const computedRules = (field.rules || []).filter((r) => r.type === 'computed');
  if (computedRules.length === 0) return undefined;

  for (const rule of computedRules) {
    // Если condition задано — проверяем
    if (rule.condition?.fieldId) {
      const match = evaluateCondition(rule.condition, allFields, data);
      if (!match) continue;
    }

    // Вычисляем формулу
    const formula = rule.action.formula;
    if (!formula) continue;

    try {
      const result = evaluateFormula(formula, data);
      return { value: result, isComputed: true };
    } catch {
      return { value: null, isComputed: true };
    }
  }

  // Ни одно computed правило не сработало (все condition ложные)
  return { value: null, isComputed: true };
}

/**
 * Хелпер: получить все видимые поля с учётом правил.
 */
export function getVisibleFields(
  fields: Field[],
  data: Record<string, any>,
): Field[] {
  return fields.filter((field) => evaluateVisibility(field, fields, data));
}
