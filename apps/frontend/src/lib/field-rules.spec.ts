import { evaluateVisibility, evaluateRequired, evaluateCondition, getVisibleFields, evaluateComputed } from './field-rules';
import type { Field, FieldRule } from '@/types';

const makeField = (id: string, overrides?: Partial<Field>): Field => ({
  id,
  name: `Field ${id}`,
  type: 'text',
  required: false,
  ...overrides,
});

const visibilityRule = (fieldId: string, operator: any, value: any, visible: boolean): FieldRule => ({
  id: `rule-${Date.now()}`,
  type: 'visibility',
  condition: { fieldId, operator, value },
  action: { visible },
});

const requiredIfRule = (fieldId: string, operator: any, value: any): FieldRule => ({
  id: `rule-${Date.now()}`,
  type: 'required_if',
  condition: { fieldId, operator, value },
  action: { required: true },
});

describe('field-rules', () => {
  describe('evaluateVisibility', () => {
    it('должен показывать поле без правил', () => {
      const field = makeField('f1');
      expect(evaluateVisibility(field, [], {})).toBe(true);
    });

    it('должен скрывать поле при совпадении условия hide', () => {
      const field = makeField('f1', {
        rules: [visibilityRule('status', 'eq', 'closed', false)],
      });
      expect(evaluateVisibility(field, [], { status: 'closed' })).toBe(false);
    });

    it('должен показывать поле когда условие hide не совпадает', () => {
      const field = makeField('f1', {
        rules: [visibilityRule('status', 'eq', 'closed', false)],
      });
      expect(evaluateVisibility(field, [], { status: 'open' })).toBe(true);
    });

    it('должен показывать поле при совпадении условия show', () => {
      const field = makeField('f1', {
        rules: [visibilityRule('type', 'eq', 'special', true)],
      });
      expect(evaluateVisibility(field, [], { type: 'special' })).toBe(true);
    });
  });

  describe('evaluateRequired', () => {
    it('должен возвращать true если field.required = true', () => {
      const field = makeField('f1', { required: true });
      expect(evaluateRequired(field, [], {})).toBe(true);
    });

    it('должен возвращать false без правил и required=false', () => {
      const field = makeField('f1');
      expect(evaluateRequired(field, [], {})).toBe(false);
    });

    it('должен возвращать true при совпадении required_if условия', () => {
      const field = makeField('f1', {
        rules: [requiredIfRule('category', 'eq', 'urgent')],
      });
      expect(evaluateRequired(field, [], { category: 'urgent' })).toBe(true);
    });

    it('должен возвращать false когда required_if условие не совпадает', () => {
      const field = makeField('f1', {
        rules: [requiredIfRule('category', 'eq', 'urgent')],
      });
      expect(evaluateRequired(field, [], { category: 'normal' })).toBe(false);
    });
  });

  describe('evaluateCondition', () => {
    const allFields: Field[] = [];

    it('eq — должен сравнивать нестрого', () => {
      expect(evaluateCondition({ fieldId: 'f1', operator: 'eq', value: '5' }, allFields, { f1: 5 })).toBe(true);
      expect(evaluateCondition({ fieldId: 'f1', operator: 'eq', value: 'abc' }, allFields, { f1: 'abc' })).toBe(true);
      expect(evaluateCondition({ fieldId: 'f1', operator: 'eq', value: 'abc' }, allFields, { f1: 'xyz' })).toBe(false);
    });

    it('neq — не равно', () => {
      expect(evaluateCondition({ fieldId: 'f1', operator: 'neq', value: 'abc' }, allFields, { f1: 'xyz' })).toBe(true);
      expect(evaluateCondition({ fieldId: 'f1', operator: 'neq', value: 'abc' }, allFields, { f1: 'abc' })).toBe(false);
    });

    it('gt — больше', () => {
      expect(evaluateCondition({ fieldId: 'f1', operator: 'gt', value: 10 }, allFields, { f1: 15 })).toBe(true);
      expect(evaluateCondition({ fieldId: 'f1', operator: 'gt', value: 10 }, allFields, { f1: 5 })).toBe(false);
    });

    it('lt — меньше', () => {
      expect(evaluateCondition({ fieldId: 'f1', operator: 'lt', value: 10 }, allFields, { f1: 5 })).toBe(true);
      expect(evaluateCondition({ fieldId: 'f1', operator: 'lt', value: 10 }, allFields, { f1: 15 })).toBe(false);
    });

    it('gte — больше или равно', () => {
      expect(evaluateCondition({ fieldId: 'f1', operator: 'gte', value: 10 }, allFields, { f1: 10 })).toBe(true);
      expect(evaluateCondition({ fieldId: 'f1', operator: 'gte', value: 10 }, allFields, { f1: 9 })).toBe(false);
    });

    it('lte — меньше или равно', () => {
      expect(evaluateCondition({ fieldId: 'f1', operator: 'lte', value: 10 }, allFields, { f1: 10 })).toBe(true);
      expect(evaluateCondition({ fieldId: 'f1', operator: 'lte', value: 10 }, allFields, { f1: 11 })).toBe(false);
    });

    it('in — одно из массива', () => {
      expect(evaluateCondition({ fieldId: 'f1', operator: 'in', value: ['a', 'b', 'c'] }, allFields, { f1: 'b' })).toBe(true);
      expect(evaluateCondition({ fieldId: 'f1', operator: 'in', value: ['a', 'b', 'c'] }, allFields, { f1: 'd' })).toBe(false);
    });

    it('not_in — не одно из массива', () => {
      expect(evaluateCondition({ fieldId: 'f1', operator: 'not_in', value: ['a', 'b'] }, allFields, { f1: 'c' })).toBe(true);
      expect(evaluateCondition({ fieldId: 'f1', operator: 'not_in', value: ['a', 'b'] }, allFields, { f1: 'a' })).toBe(false);
    });

    it('is_empty — пусто', () => {
      expect(evaluateCondition({ fieldId: 'f1', operator: 'is_empty' }, allFields, { f1: null })).toBe(true);
      expect(evaluateCondition({ fieldId: 'f1', operator: 'is_empty' }, allFields, { f1: undefined })).toBe(true);
      expect(evaluateCondition({ fieldId: 'f1', operator: 'is_empty' }, allFields, { f1: '' })).toBe(true);
      expect(evaluateCondition({ fieldId: 'f1', operator: 'is_empty' }, allFields, { f1: [] })).toBe(true);
      expect(evaluateCondition({ fieldId: 'f1', operator: 'is_empty' }, allFields, {})).toBe(true);
      expect(evaluateCondition({ fieldId: 'f1', operator: 'is_empty' }, allFields, { f1: 'text' })).toBe(false);
    });

    it('is_not_empty — не пусто', () => {
      expect(evaluateCondition({ fieldId: 'f1', operator: 'is_not_empty' }, allFields, { f1: 'text' })).toBe(true);
      expect(evaluateCondition({ fieldId: 'f1', operator: 'is_not_empty' }, allFields, { f1: 0 })).toBe(true);
      expect(evaluateCondition({ fieldId: 'f1', operator: 'is_not_empty' }, allFields, { f1: null })).toBe(false);
      expect(evaluateCondition({ fieldId: 'f1', operator: 'is_not_empty' }, allFields, { f1: '' })).toBe(false);
    });

    it('contains — содержит подстроку', () => {
      expect(evaluateCondition({ fieldId: 'f1', operator: 'contains', value: 'ell' }, allFields, { f1: 'Hello' })).toBe(true);
      expect(evaluateCondition({ fieldId: 'f1', operator: 'contains', value: 'xyz' }, allFields, { f1: 'Hello' })).toBe(false);
    });

    it('contains — содержит элемент массива', () => {
      expect(evaluateCondition({ fieldId: 'f1', operator: 'contains', value: 'b' }, allFields, { f1: ['a', 'b', 'c'] })).toBe(true);
      expect(evaluateCondition({ fieldId: 'f1', operator: 'contains', value: 'd' }, allFields, { f1: ['a', 'b', 'c'] })).toBe(false);
    });
  });

  describe('getVisibleFields', () => {
    it('должен фильтровать скрытые поля', () => {
      const fields: Field[] = [
        makeField('f1'),
        makeField('f2', {
          rules: [visibilityRule('f1', 'eq', 'hide-f2', false)],
        }),
        makeField('f3'),
      ];

      const visible = getVisibleFields(fields, { f1: 'hide-f2' });
      expect(visible.map((f) => f.id)).toEqual(['f1', 'f3']);
    });

    it('должен показывать все поля если правила не срабатывают', () => {
      const fields: Field[] = [
        makeField('f1'),
        makeField('f2', {
          rules: [visibilityRule('f1', 'eq', 'hide-f2', false)],
        }),
      ];

      const visible = getVisibleFields(fields, { f1: 'other' });
      expect(visible.map((f) => f.id)).toEqual(['f1', 'f2']);
    });
  });

  describe('evaluateComputed', () => {
    it('должен возвращать undefined для поля без computed правил', () => {
      const field = makeField('f1');
      expect(evaluateComputed(field, [], {})).toBeUndefined();
    });

    it('должен вычислять простую формулу', () => {
      const field = makeField('total', {
        rules: [{
          id: 'r1',
          type: 'computed',
          condition: { fieldId: '', operator: 'eq', value: '' },
          action: { formula: '{price} * {quantity}' },
        }],
      });
      const result = evaluateComputed(field, [], { price: 100, quantity: 5 });
      expect(result).toEqual({ value: 500, isComputed: true });
    });

    it('должен возвращать null при отсутствующих данных', () => {
      const field = makeField('total', {
        rules: [{
          id: 'r1',
          type: 'computed',
          condition: { fieldId: '', operator: 'eq', value: '' },
          action: { formula: '{price} * {quantity}' },
        }],
      });
      const result = evaluateComputed(field, [], {});
      expect(result).toEqual({ value: null, isComputed: true });
    });

    it('должен применять формулу только при совпадении condition', () => {
      const field = makeField('bonus', {
        rules: [{
          id: 'r1',
          type: 'computed',
          condition: { fieldId: 'type', operator: 'eq', value: 'vip' },
          action: { formula: '{total} * 0.1' },
        }],
      });

      // Условие совпадает
      const result1 = evaluateComputed(field, [], { type: 'vip', total: 1000 });
      expect(result1).toEqual({ value: 100, isComputed: true });

      // Условие не совпадает
      const result2 = evaluateComputed(field, [], { type: 'regular', total: 1000 });
      expect(result2).toEqual({ value: null, isComputed: true });
    });

    it('должен обрабатывать ошибки в формуле gracefully', () => {
      const field = makeField('f1', {
        rules: [{
          id: 'r1',
          type: 'computed',
          condition: { fieldId: '', operator: 'eq', value: '' },
          action: { formula: '2 & 3' },
        }],
      });
      const result = evaluateComputed(field, [], {});
      expect(result).toEqual({ value: null, isComputed: true });
    });

    it('должен вычислять строковую конкатенацию', () => {
      const field = makeField('fullname', {
        rules: [{
          id: 'r1',
          type: 'computed',
          condition: { fieldId: '', operator: 'eq', value: '' },
          action: { formula: '{first} + " " + {last}' },
        }],
      });
      const result = evaluateComputed(field, [], { first: 'Иван', last: 'Иванов' });
      expect(result).toEqual({ value: 'Иван Иванов', isComputed: true });
    });

    it('не должен учитывать правила других типов', () => {
      const field = makeField('f1', {
        rules: [
          visibilityRule('status', 'eq', 'open', true),
          requiredIfRule('category', 'eq', 'urgent'),
        ],
      });
      expect(evaluateComputed(field, [], {})).toBeUndefined();
    });
  });
});
