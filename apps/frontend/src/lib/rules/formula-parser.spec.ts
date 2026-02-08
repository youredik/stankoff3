import { evaluateFormula, validateFormula, extractFieldRefs, FormulaError } from './formula-parser';

describe('formula-parser', () => {
  describe('evaluateFormula', () => {
    describe('арифметика', () => {
      it('сложение', () => {
        expect(evaluateFormula('2 + 3', {})).toBe(5);
      });

      it('вычитание', () => {
        expect(evaluateFormula('10 - 4', {})).toBe(6);
      });

      it('умножение', () => {
        expect(evaluateFormula('3 * 7', {})).toBe(21);
      });

      it('деление', () => {
        expect(evaluateFormula('20 / 4', {})).toBe(5);
      });

      it('деление на ноль возвращает null', () => {
        expect(evaluateFormula('10 / 0', {})).toBeNull();
      });

      it('приоритет операций (* перед +)', () => {
        expect(evaluateFormula('2 + 3 * 4', {})).toBe(14);
      });

      it('скобки меняют приоритет', () => {
        expect(evaluateFormula('(2 + 3) * 4', {})).toBe(20);
      });

      it('вложенные скобки', () => {
        expect(evaluateFormula('((2 + 3) * (4 - 1))', {})).toBe(15);
      });

      it('унарный минус', () => {
        expect(evaluateFormula('-5', {})).toBe(-5);
      });

      it('унарный минус с выражением', () => {
        expect(evaluateFormula('-(3 + 2)', {})).toBe(-5);
      });

      it('десятичные числа', () => {
        expect(evaluateFormula('3.14 * 2', {})).toBeCloseTo(6.28);
      });
    });

    describe('ссылки на поля', () => {
      it('подстановка значения поля', () => {
        expect(evaluateFormula('{price} * {quantity}', { price: 100, quantity: 5 })).toBe(500);
      });

      it('null при отсутствующем поле', () => {
        expect(evaluateFormula('{missing}', {})).toBeNull();
      });

      it('null при пустом значении', () => {
        expect(evaluateFormula('{empty}', { empty: '' })).toBeNull();
      });

      it('null при null значении', () => {
        expect(evaluateFormula('{field}', { field: null })).toBeNull();
      });

      it('null пропагируется через операции', () => {
        expect(evaluateFormula('{a} + {b}', { a: 5 })).toBeNull();
      });

      it('строковое значение поля', () => {
        expect(evaluateFormula('{name}', { name: 'hello' })).toBe('hello');
      });

      it('числовая строка конвертируется в число', () => {
        expect(evaluateFormula('{price} * 2', { price: '50' })).toBe(100);
      });
    });

    describe('строковая конкатенация', () => {
      it('строка + строка', () => {
        expect(evaluateFormula('"hello" + " " + "world"', {})).toBe('hello world');
      });

      it('строка + число', () => {
        expect(evaluateFormula('"Итого: " + {total}', { total: 500 })).toBe('Итого: 500');
      });

      it('поле + строка + поле', () => {
        expect(evaluateFormula('{first} + " " + {last}', { first: 'Иван', last: 'Иванов' })).toBe('Иван Иванов');
      });

      it('одинарные кавычки', () => {
        expect(evaluateFormula("'hello'", {})).toBe('hello');
      });
    });

    describe('функции', () => {
      it('round без аргумента precision', () => {
        expect(evaluateFormula('round(3.7)', {})).toBe(4);
      });

      it('round с precision', () => {
        expect(evaluateFormula('round(3.14159, 2)', {})).toBe(3.14);
      });

      it('ceil', () => {
        expect(evaluateFormula('ceil(3.1)', {})).toBe(4);
      });

      it('floor', () => {
        expect(evaluateFormula('floor(3.9)', {})).toBe(3);
      });

      it('abs', () => {
        expect(evaluateFormula('abs(-5)', {})).toBe(5);
      });

      it('min', () => {
        expect(evaluateFormula('min(3, 1, 5, 2)', {})).toBe(1);
      });

      it('max', () => {
        expect(evaluateFormula('max(3, 1, 5, 2)', {})).toBe(5);
      });

      it('sum', () => {
        expect(evaluateFormula('sum(10, 20, 30)', {})).toBe(60);
      });

      it('min/max/sum пропускают null', () => {
        expect(evaluateFormula('sum({a}, {b}, {c})', { a: 10, c: 30 })).toBe(40);
      });

      it('min/max/sum возвращают null если все null', () => {
        expect(evaluateFormula('sum({a}, {b})', {})).toBeNull();
      });

      it('вложенные функции', () => {
        expect(evaluateFormula('round(abs(-3.7))', {})).toBe(4);
      });

      it('функция с выражением-аргументом', () => {
        expect(evaluateFormula('round({price} * 1.2, 2)', { price: 99.99 })).toBe(119.99);
      });
    });

    describe('комплексные формулы', () => {
      it('расчёт итога с наценкой', () => {
        const data = { price: 1000, quantity: 3, discount: 10 };
        const result = evaluateFormula('{price} * {quantity} * (1 - {discount} / 100)', data);
        expect(result).toBe(2700);
      });

      it('среднее значение', () => {
        expect(evaluateFormula('({a} + {b} + {c}) / 3', { a: 10, b: 20, c: 30 })).toBe(20);
      });
    });

    describe('пустая формула', () => {
      it('пустая строка → null', () => {
        expect(evaluateFormula('', {})).toBeNull();
      });

      it('пробелы → null', () => {
        expect(evaluateFormula('   ', {})).toBeNull();
      });
    });

    describe('ошибки', () => {
      it('неизвестная функция', () => {
        expect(() => evaluateFormula('unknown(1)', {})).toThrow(FormulaError);
      });

      it('неожиданный символ', () => {
        expect(() => evaluateFormula('2 & 3', {})).toThrow(FormulaError);
      });

      it('незакрытая скобка', () => {
        expect(() => evaluateFormula('(2 + 3', {})).toThrow(FormulaError);
      });
    });
  });

  describe('validateFormula', () => {
    it('корректная формула → null', () => {
      expect(validateFormula('{price} * {quantity}')).toBeNull();
    });

    it('пустая формула → ошибка', () => {
      expect(validateFormula('')).toBe('Формула не может быть пустой');
    });

    it('некорректная формула → строка ошибки', () => {
      expect(validateFormula('2 & 3')).toBeTruthy();
    });
  });

  describe('extractFieldRefs', () => {
    it('извлекает ссылки на поля', () => {
      expect(extractFieldRefs('{price} * {quantity} + {tax}')).toEqual(['price', 'quantity', 'tax']);
    });

    it('пустая формула → пустой массив', () => {
      expect(extractFieldRefs('')).toEqual([]);
    });

    it('формула без ссылок → пустой массив', () => {
      expect(extractFieldRefs('2 + 3')).toEqual([]);
    });

    it('обрезает пробелы', () => {
      expect(extractFieldRefs('{ field_name }')).toEqual(['field_name']);
    });
  });
});
