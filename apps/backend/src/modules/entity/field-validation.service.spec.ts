import { BadRequestException } from '@nestjs/common';
import { FieldValidationService } from './field-validation.service';

describe('FieldValidationService', () => {
  let service: FieldValidationService;

  beforeEach(() => {
    service = new FieldValidationService();
  });

  const section = (fields: any[]) => [{ fields }];

  describe('required fields', () => {
    it('должен проверять обязательные поля', () => {
      const fields = section([
        { id: 'f1', name: 'Имя', type: 'text', required: true },
      ]);

      expect(() => service.validateEntityData({}, fields)).toThrow(BadRequestException);
    });

    it('должен пропускать пустые необязательные поля', () => {
      const fields = section([
        { id: 'f1', name: 'Имя', type: 'text', required: false },
      ]);

      expect(() => service.validateEntityData({}, fields)).not.toThrow();
    });

    it('должен считать пустую строку за пустое значение', () => {
      const fields = section([
        { id: 'f1', name: 'Имя', type: 'text', required: true },
      ]);

      expect(() => service.validateEntityData({ f1: '' }, fields)).toThrow(BadRequestException);
    });

    it('не должен считать false за пустое для checkbox', () => {
      const fields = section([
        { id: 'f1', name: 'Согласие', type: 'checkbox', required: true },
      ]);

      expect(() => service.validateEntityData({ f1: false }, fields)).not.toThrow();
    });
  });

  describe('text validation', () => {
    it('должен проверять maxLength', () => {
      const fields = section([
        { id: 'f1', name: 'Код', type: 'text', config: { maxLength: 5 } },
      ]);

      expect(() => service.validateEntityData({ f1: '123456' }, fields)).toThrow();
      expect(() => service.validateEntityData({ f1: '12345' }, fields)).not.toThrow();
    });

    it('должен проверять тип строки', () => {
      const fields = section([
        { id: 'f1', name: 'Имя', type: 'text' },
      ]);

      expect(() => service.validateEntityData({ f1: 123 }, fields)).toThrow();
    });
  });

  describe('number validation', () => {
    it('должен проверять тип числа', () => {
      const fields = section([
        { id: 'f1', name: 'Сумма', type: 'number' },
      ]);

      expect(() => service.validateEntityData({ f1: 'abc' }, fields)).toThrow();
      expect(() => service.validateEntityData({ f1: 42 }, fields)).not.toThrow();
    });

    it('должен проверять min/max', () => {
      const fields = section([
        { id: 'f1', name: 'Процент', type: 'number', config: { min: 0, max: 100 } },
      ]);

      expect(() => service.validateEntityData({ f1: -1 }, fields)).toThrow();
      expect(() => service.validateEntityData({ f1: 101 }, fields)).toThrow();
      expect(() => service.validateEntityData({ f1: 50 }, fields)).not.toThrow();
    });

    it('должен отклонять NaN', () => {
      const fields = section([
        { id: 'f1', name: 'Число', type: 'number' },
      ]);

      expect(() => service.validateEntityData({ f1: NaN }, fields)).toThrow();
    });
  });

  describe('date validation', () => {
    it('должен принимать валидную дату', () => {
      const fields = section([
        { id: 'f1', name: 'Дата', type: 'date' },
      ]);

      expect(() => service.validateEntityData({ f1: '2024-01-15' }, fields)).not.toThrow();
      expect(() => service.validateEntityData({ f1: '2024-01-15T10:30' }, fields)).not.toThrow();
    });

    it('должен отклонять невалидную дату', () => {
      const fields = section([
        { id: 'f1', name: 'Дата', type: 'date' },
      ]);

      expect(() => service.validateEntityData({ f1: 'not-a-date' }, fields)).toThrow();
    });
  });

  describe('select validation', () => {
    const options = [
      { id: 'opt-1', label: 'A' },
      { id: 'opt-2', label: 'B' },
    ];

    it('должен принимать валидный вариант', () => {
      const fields = section([
        { id: 'f1', name: 'Статус', type: 'select', options },
      ]);

      expect(() => service.validateEntityData({ f1: 'opt-1' }, fields)).not.toThrow();
    });

    it('должен отклонять невалидный вариант', () => {
      const fields = section([
        { id: 'f1', name: 'Статус', type: 'select', options },
      ]);

      expect(() => service.validateEntityData({ f1: 'opt-999' }, fields)).toThrow();
    });

    it('должен поддерживать multi-select', () => {
      const fields = section([
        { id: 'f1', name: 'Теги', type: 'select', options, config: { multiSelect: true } },
      ]);

      expect(() => service.validateEntityData({ f1: ['opt-1', 'opt-2'] }, fields)).not.toThrow();
      expect(() => service.validateEntityData({ f1: ['opt-1', 'opt-999'] }, fields)).toThrow();
      expect(() => service.validateEntityData({ f1: 'opt-1' }, fields)).toThrow(); // не массив
    });
  });

  describe('user validation', () => {
    it('должен принимать строковый ID', () => {
      const fields = section([
        { id: 'f1', name: 'Исполнитель', type: 'user' },
      ]);

      expect(() => service.validateEntityData({ f1: 'user-123' }, fields)).not.toThrow();
    });

    it('должен поддерживать multi-select', () => {
      const fields = section([
        { id: 'f1', name: 'Команда', type: 'user', config: { multiSelect: true } },
      ]);

      expect(() => service.validateEntityData({ f1: ['u1', 'u2'] }, fields)).not.toThrow();
      expect(() => service.validateEntityData({ f1: 'u1' }, fields)).toThrow(); // не массив
    });
  });

  describe('checkbox validation', () => {
    it('должен принимать boolean', () => {
      const fields = section([
        { id: 'f1', name: 'Активно', type: 'checkbox' },
      ]);

      expect(() => service.validateEntityData({ f1: true }, fields)).not.toThrow();
      expect(() => service.validateEntityData({ f1: false }, fields)).not.toThrow();
    });

    it('должен отклонять не-boolean', () => {
      const fields = section([
        { id: 'f1', name: 'Активно', type: 'checkbox' },
      ]);

      expect(() => service.validateEntityData({ f1: 'yes' }, fields)).toThrow();
    });
  });

  describe('url validation', () => {
    it('должен принимать http/https URL', () => {
      const fields = section([
        { id: 'f1', name: 'Сайт', type: 'url' },
      ]);

      expect(() => service.validateEntityData({ f1: 'https://example.com' }, fields)).not.toThrow();
      expect(() => service.validateEntityData({ f1: 'http://test.ru/path?q=1' }, fields)).not.toThrow();
    });

    it('должен отклонять невалидный URL', () => {
      const fields = section([
        { id: 'f1', name: 'Сайт', type: 'url' },
      ]);

      expect(() => service.validateEntityData({ f1: 'not-a-url' }, fields)).toThrow();
    });

    it('должен отклонять ftp://', () => {
      const fields = section([
        { id: 'f1', name: 'Сайт', type: 'url' },
      ]);

      expect(() => service.validateEntityData({ f1: 'ftp://files.com' }, fields)).toThrow();
    });
  });

  describe('geolocation validation', () => {
    it('должен принимать валидный объект координат', () => {
      const fields = section([
        { id: 'f1', name: 'Адрес', type: 'geolocation' },
      ]);

      expect(() =>
        service.validateEntityData({ f1: { address: 'Москва', lat: 55.75, lng: 37.61 } }, fields)
      ).not.toThrow();
    });

    it('должен отклонять объект без координат', () => {
      const fields = section([
        { id: 'f1', name: 'Адрес', type: 'geolocation' },
      ]);

      expect(() =>
        service.validateEntityData({ f1: { address: 'Москва' } }, fields)
      ).toThrow();
    });
  });

  describe('client validation', () => {
    it('должен принимать объект', () => {
      const fields = section([
        { id: 'f1', name: 'Клиент', type: 'client' },
      ]);

      expect(() =>
        service.validateEntityData({ f1: { name: 'Иванов', phone: '+79001234567' } }, fields)
      ).not.toThrow();
    });

    it('должен отклонять не-объект', () => {
      const fields = section([
        { id: 'f1', name: 'Клиент', type: 'client' },
      ]);

      expect(() => service.validateEntityData({ f1: 'Иванов' }, fields)).toThrow();
    });
  });

  describe('computed fields', () => {
    it('не должен проверять required на computed полях', () => {
      const fields = section([
        {
          id: 'total',
          name: 'Итого',
          type: 'number',
          required: true,
          rules: [{ id: 'r1', type: 'computed', action: { formula: '{price} * {qty}' } }],
        },
      ]);

      // Computed поле пустое — не должно быть ошибки
      expect(() => service.validateEntityData({}, fields)).not.toThrow();
    });

    it('должен валидировать тип computed поля если значение передано', () => {
      const fields = section([
        {
          id: 'total',
          name: 'Итого',
          type: 'number',
          rules: [{ id: 'r1', type: 'computed', action: { formula: '{price} * {qty}' } }],
        },
      ]);

      // Если значение передано — проверяем тип
      expect(() => service.validateEntityData({ total: 'not-a-number' }, fields)).toThrow();
      expect(() => service.validateEntityData({ total: 500 }, fields)).not.toThrow();
    });

    it('должен проверять required на обычных полях (не computed)', () => {
      const fields = section([
        {
          id: 'name',
          name: 'Имя',
          type: 'text',
          required: true,
          rules: [{ id: 'r1', type: 'visibility', condition: { fieldId: 'x', operator: 'eq', value: '' } }],
        },
      ]);

      // Обычное правило visibility — required должен работать
      expect(() => service.validateEntityData({}, fields)).toThrow(BadRequestException);
    });

    it('не должен проверять required если есть хотя бы одно computed правило', () => {
      const fields = section([
        {
          id: 'f1',
          name: 'Поле',
          type: 'text',
          required: true,
          rules: [
            { id: 'r1', type: 'visibility', condition: {} },
            { id: 'r2', type: 'computed', action: { formula: '"test"' } },
          ],
        },
      ]);

      expect(() => service.validateEntityData({}, fields)).not.toThrow();
    });
  });

  describe('validateEntityData', () => {
    it('должен собирать ошибки из нескольких секций', () => {
      const sections = [
        { fields: [{ id: 'f1', name: 'Имя', type: 'text', required: true }] },
        { fields: [{ id: 'f2', name: 'Сумма', type: 'number', required: true }] },
      ];

      expect(() => service.validateEntityData({}, sections)).toThrow(BadRequestException);
    });

    it('должен проходить при корректных данных', () => {
      const sections = [
        { fields: [{ id: 'f1', name: 'Имя', type: 'text', required: true }] },
        { fields: [{ id: 'f2', name: 'Сумма', type: 'number' }] },
      ];

      expect(() => service.validateEntityData({ f1: 'Тест', f2: 100 }, sections)).not.toThrow();
    });
  });
});
