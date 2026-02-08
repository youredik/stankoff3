import { FormulaEvaluatorService } from './formula-evaluator.service';

describe('FormulaEvaluatorService', () => {
  let service: FormulaEvaluatorService;

  beforeEach(() => {
    service = new FormulaEvaluatorService();
  });

  describe('evaluateFormula', () => {
    it('должен вычислять простую арифметику', () => {
      expect(service.evaluateFormula('2 + 3', {})).toBe(5);
      expect(service.evaluateFormula('10 - 4', {})).toBe(6);
      expect(service.evaluateFormula('3 * 7', {})).toBe(21);
      expect(service.evaluateFormula('20 / 4', {})).toBe(5);
    });

    it('должен соблюдать приоритет операций', () => {
      expect(service.evaluateFormula('2 + 3 * 4', {})).toBe(14);
      expect(service.evaluateFormula('(2 + 3) * 4', {})).toBe(20);
    });

    it('должен подставлять значения полей', () => {
      expect(service.evaluateFormula('{price} * {quantity}', { price: 100, quantity: 5 })).toBe(500);
    });

    it('должен возвращать null если поле отсутствует', () => {
      expect(service.evaluateFormula('{price} * {quantity}', {})).toBeNull();
    });

    it('должен обрабатывать деление на ноль', () => {
      expect(service.evaluateFormula('10 / 0', {})).toBeNull();
    });

    it('должен поддерживать строковую конкатенацию', () => {
      expect(service.evaluateFormula('{first} + " " + {last}', { first: 'Иван', last: 'Иванов' }))
        .toBe('Иван Иванов');
    });

    it('должен поддерживать унарный минус', () => {
      expect(service.evaluateFormula('-5', {})).toBe(-5);
      expect(service.evaluateFormula('-{x}', { x: 10 })).toBe(-10);
    });

    it('должен поддерживать функцию round', () => {
      expect(service.evaluateFormula('round(3.7)', {})).toBe(4);
      expect(service.evaluateFormula('round(3.456, 2)', {})).toBe(3.46);
    });

    it('должен поддерживать функции ceil и floor', () => {
      expect(service.evaluateFormula('ceil(3.1)', {})).toBe(4);
      expect(service.evaluateFormula('floor(3.9)', {})).toBe(3);
    });

    it('должен поддерживать функцию abs', () => {
      expect(service.evaluateFormula('abs(-5)', {})).toBe(5);
      expect(service.evaluateFormula('abs(5)', {})).toBe(5);
    });

    it('должен поддерживать min и max', () => {
      expect(service.evaluateFormula('min(1, 2, 3)', {})).toBe(1);
      expect(service.evaluateFormula('max(1, 2, 3)', {})).toBe(3);
    });

    it('должен поддерживать sum', () => {
      expect(service.evaluateFormula('sum(10, 20, 30)', {})).toBe(60);
    });

    it('должен возвращать null для пустой формулы', () => {
      expect(service.evaluateFormula('', {})).toBeNull();
      expect(service.evaluateFormula('   ', {})).toBeNull();
    });

    it('должен бросать ошибку при некорректной формуле', () => {
      expect(() => service.evaluateFormula('2 & 3', {})).toThrow();
    });

    it('должен обрабатывать вложенные функции', () => {
      expect(service.evaluateFormula('round({price} * {qty} * 0.13, 2)', { price: 99.99, qty: 3 }))
        .toBe(39);
    });
  });

  describe('computeFields', () => {
    it('должен вычислять computed поле', () => {
      const sections = [{
        fields: [
          { id: 'price', name: 'Цена', type: 'number' },
          { id: 'qty', name: 'Количество', type: 'number' },
          {
            id: 'total',
            name: 'Итого',
            type: 'number',
            rules: [{
              id: 'r1',
              type: 'computed',
              action: { formula: '{price} * {qty}' },
            }],
          },
        ],
      }];

      const data = { price: 100, qty: 5 };
      const result = service.computeFields(data, sections);
      expect(result.total).toBe(500);
      expect(result.price).toBe(100);
      expect(result.qty).toBe(5);
    });

    it('не должен менять data если нет computed полей', () => {
      const sections = [{
        fields: [
          { id: 'name', name: 'Имя', type: 'text' },
        ],
      }];

      const data = { name: 'Тест' };
      const result = service.computeFields(data, sections);
      expect(result).toEqual(data);
    });

    it('должен вычислять формулу только при совпадении condition', () => {
      const sections = [{
        fields: [
          { id: 'type', name: 'Тип', type: 'select' },
          { id: 'total', name: 'Итого', type: 'number' },
          {
            id: 'bonus',
            name: 'Бонус',
            type: 'number',
            rules: [{
              id: 'r1',
              type: 'computed',
              condition: { fieldId: 'type', operator: 'eq', value: 'vip' },
              action: { formula: '{total} * 0.1' },
            }],
          },
        ],
      }];

      // Условие совпадает
      const result1 = service.computeFields({ type: 'vip', total: 1000 }, sections);
      expect(result1.bonus).toBe(100);

      // Условие не совпадает — поле не вычисляется
      const result2 = service.computeFields({ type: 'regular', total: 1000 }, sections);
      expect(result2.bonus).toBeUndefined();
    });

    it('должен обрабатывать ошибки формулы gracefully', () => {
      const sections = [{
        fields: [{
          id: 'f1',
          name: 'Поле',
          type: 'number',
          rules: [{
            id: 'r1',
            type: 'computed',
            action: { formula: '2 & 3' }, // невалидная формула
          }],
        }],
      }];

      // Не должен падать, просто пропустит
      const result = service.computeFields({}, sections);
      expect(result.f1).toBeUndefined();
    });

    it('должен пересчитывать несколько computed полей', () => {
      const sections = [{
        fields: [
          { id: 'a', name: 'A', type: 'number' },
          { id: 'b', name: 'B', type: 'number' },
          {
            id: 'sum_ab',
            name: 'Сумма',
            type: 'number',
            rules: [{ id: 'r1', type: 'computed', action: { formula: '{a} + {b}' } }],
          },
          {
            id: 'product_ab',
            name: 'Произведение',
            type: 'number',
            rules: [{ id: 'r2', type: 'computed', action: { formula: '{a} * {b}' } }],
          },
        ],
      }];

      const result = service.computeFields({ a: 3, b: 7 }, sections);
      expect(result.sum_ab).toBe(10);
      expect(result.product_ab).toBe(21);
    });

    it('не должен считать поля с visibility/required_if правилами за computed', () => {
      const sections = [{
        fields: [{
          id: 'f1',
          name: 'Поле',
          type: 'text',
          rules: [
            { id: 'r1', type: 'visibility', action: { visible: false } },
            { id: 'r2', type: 'required_if', action: { required: true } },
          ],
        }],
      }];

      const data = { f1: 'hello' };
      const result = service.computeFields(data, sections);
      expect(result.f1).toBe('hello');
    });

    it('должен обрабатывать computed поля из нескольких секций', () => {
      const sections = [
        {
          fields: [
            { id: 'price', name: 'Цена', type: 'number' },
            {
              id: 'tax',
              name: 'Налог',
              type: 'number',
              rules: [{ id: 'r1', type: 'computed', action: { formula: '{price} * 0.2' } }],
            },
          ],
        },
        {
          fields: [{
            id: 'total',
            name: 'Итого',
            type: 'number',
            rules: [{ id: 'r2', type: 'computed', action: { formula: '{price} + {tax}' } }],
          }],
        },
      ];

      const result = service.computeFields({ price: 100 }, sections);
      expect(result.tax).toBe(20);
      expect(result.total).toBe(120);
    });
  });
});
