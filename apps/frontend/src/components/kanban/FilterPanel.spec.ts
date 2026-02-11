import { describe, it, expect } from 'vitest';
import { isFilterActive, createEmptyFilters, applyFilters } from './FilterPanel';
import type { FilterState } from './FilterPanel';

describe('FilterPanel helpers', () => {
  // ─── isFilterActive ──────────────────────────────────────────────

  describe('isFilterActive', () => {
    it('null/undefined → false', () => {
      expect(isFilterActive(null)).toBe(false);
      expect(isFilterActive(undefined)).toBe(false);
    });

    it('boolean true → active', () => {
      expect(isFilterActive(true)).toBe(true);
    });

    it('boolean false → active (false is a deliberate filter choice)', () => {
      expect(isFilterActive(false)).toBe(true);
    });

    it('non-empty array → active', () => {
      expect(isFilterActive(['a'])).toBe(true);
    });

    it('empty array → inactive', () => {
      expect(isFilterActive([])).toBe(false);
    });

    it('non-empty string → active', () => {
      expect(isFilterActive('test')).toBe(true);
    });

    it('empty/whitespace string → inactive', () => {
      expect(isFilterActive('')).toBe(false);
      expect(isFilterActive('   ')).toBe(false);
    });

    it('object with defined values → active', () => {
      expect(isFilterActive({ min: 5 })).toBe(true);
      expect(isFilterActive({ from: '2024-01-01' })).toBe(true);
    });

    it('object with all null/empty values → inactive', () => {
      expect(isFilterActive({ min: null, max: null })).toBe(false);
      expect(isFilterActive({ from: '', to: '' })).toBe(false);
    });

    it('number → inactive (not a supported filter value type)', () => {
      expect(isFilterActive(42)).toBe(false);
    });
  });

  // ─── createEmptyFilters ──────────────────────────────────────────

  describe('createEmptyFilters', () => {
    it('возвращает пустое состояние фильтров', () => {
      const filters = createEmptyFilters();
      expect(filters).toEqual({
        search: '',
        assigneeIds: [],
        priorities: [],
        dateFrom: '',
        dateTo: '',
        customFilters: {},
      });
    });

    it('каждый вызов возвращает новый объект', () => {
      const a = createEmptyFilters();
      const b = createEmptyFilters();
      expect(a).not.toBe(b);
      expect(a.assigneeIds).not.toBe(b.assigneeIds);
    });
  });

  // ─── applyFilters ────────────────────────────────────────────────

  describe('applyFilters', () => {
    const entities = [
      {
        id: '1',
        title: 'Заявка на ремонт',
        customId: 'REQ-001',
        assigneeId: 'user-1',
        priority: 'high',
        createdAt: '2024-06-15T10:00:00Z',
        data: { amount: 5000, category: 'repair', notes: 'Срочно' },
      },
      {
        id: '2',
        title: 'Запрос на поставку',
        customId: 'REQ-002',
        assigneeId: 'user-2',
        priority: 'low',
        createdAt: '2024-07-20T14:00:00Z',
        data: { amount: 12000, category: 'supply', notes: '' },
      },
      {
        id: '3',
        title: 'Техническое обслуживание',
        customId: 'REQ-003',
        assigneeId: 'user-1',
        priority: 'medium',
        createdAt: '2024-08-01T09:00:00Z',
        data: { amount: 800, checked: true },
      },
    ];

    const empty: FilterState = createEmptyFilters();

    it('без фильтров возвращает все сущности', () => {
      expect(applyFilters(entities, empty)).toHaveLength(3);
    });

    // Search
    it('фильтрует по названию (search)', () => {
      const f: FilterState = { ...empty, search: 'ремонт' };
      const result = applyFilters(entities, f);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('фильтрует по customId (search)', () => {
      const f: FilterState = { ...empty, search: 'REQ-003' };
      const result = applyFilters(entities, f);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('3');
    });

    it('поиск регистронезависимый', () => {
      const f: FilterState = { ...empty, search: 'ЗАЯВКА' };
      expect(applyFilters(entities, f)).toHaveLength(1);
    });

    // Assignee
    it('фильтрует по assignee', () => {
      const f: FilterState = { ...empty, assigneeIds: ['user-1'] };
      const result = applyFilters(entities, f);
      expect(result).toHaveLength(2);
      expect(result.map((e) => e.id)).toEqual(['1', '3']);
    });

    it('фильтрует по нескольким assignee', () => {
      const f: FilterState = { ...empty, assigneeIds: ['user-1', 'user-2'] };
      expect(applyFilters(entities, f)).toHaveLength(3);
    });

    // Priority
    it('фильтрует по приоритету', () => {
      const f: FilterState = { ...empty, priorities: ['high'] };
      const result = applyFilters(entities, f);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('фильтрует по нескольким приоритетам', () => {
      const f: FilterState = { ...empty, priorities: ['high', 'low'] };
      expect(applyFilters(entities, f)).toHaveLength(2);
    });

    // Date range
    it('фильтрует по dateFrom', () => {
      const f: FilterState = { ...empty, dateFrom: '2024-07-01' };
      const result = applyFilters(entities, f);
      expect(result).toHaveLength(2);
      expect(result.map((e) => e.id)).toEqual(['2', '3']);
    });

    it('фильтрует по dateTo', () => {
      const f: FilterState = { ...empty, dateTo: '2024-07-01' };
      const result = applyFilters(entities, f);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('фильтрует по dateFrom + dateTo', () => {
      const f: FilterState = {
        ...empty,
        dateFrom: '2024-07-01',
        dateTo: '2024-07-31',
      };
      const result = applyFilters(entities, f);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    // Custom filters: number range
    it('фильтрует по числовому диапазону (min)', () => {
      const f: FilterState = {
        ...empty,
        customFilters: { amount: { min: 1000 } },
      };
      const result = applyFilters(entities, f);
      expect(result).toHaveLength(2);
      expect(result.map((e) => e.id)).toEqual(['1', '2']);
    });

    it('фильтрует по числовому диапазону (max)', () => {
      const f: FilterState = {
        ...empty,
        customFilters: { amount: { max: 5000 } },
      };
      const result = applyFilters(entities, f);
      expect(result).toHaveLength(2);
      expect(result.map((e) => e.id)).toEqual(['1', '3']);
    });

    it('фильтрует по числовому диапазону (min + max)', () => {
      const f: FilterState = {
        ...empty,
        customFilters: { amount: { min: 1000, max: 10000 } },
      };
      const result = applyFilters(entities, f);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('числовой фильтр исключает сущности без значения', () => {
      const entitiesWithMissing = [
        ...entities,
        { id: '4', title: 'Без суммы', data: {} },
      ];
      const f: FilterState = {
        ...empty,
        customFilters: { amount: { min: 0 } },
      };
      const result = applyFilters(entitiesWithMissing as any, f);
      expect(result.map((e) => e.id)).not.toContain('4');
    });

    // Custom filters: select (array)
    it('фильтрует по select (мультивыбор)', () => {
      const f: FilterState = {
        ...empty,
        customFilters: { category: ['repair'] },
      };
      const result = applyFilters(entities, f);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('фильтрует по нескольким select значениям', () => {
      const f: FilterState = {
        ...empty,
        customFilters: { category: ['repair', 'supply'] },
      };
      expect(applyFilters(entities, f)).toHaveLength(2);
    });

    // Custom filters: text (string)
    it('фильтрует по текстовому полю (substring)', () => {
      const f: FilterState = {
        ...empty,
        customFilters: { notes: 'срочно' },
      };
      const result = applyFilters(entities, f);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    // Custom filters: checkbox (boolean)
    it('фильтрует по checkbox (true)', () => {
      const f: FilterState = {
        ...empty,
        customFilters: { checked: true },
      };
      const result = applyFilters(entities, f);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('3');
    });

    it('фильтрует по checkbox (false)', () => {
      const f: FilterState = {
        ...empty,
        customFilters: { checked: false },
      };
      const result = applyFilters(entities, f);
      // entities 1 and 2 don't have checked=true, so Boolean(undefined) === false
      expect(result).toHaveLength(2);
    });

    // Custom filters: date range
    it('фильтрует по кастомному date range', () => {
      const entitiesWithDate = [
        { id: 'a', title: 'A', data: { deadline: '2024-03-15' } },
        { id: 'b', title: 'B', data: { deadline: '2024-06-15' } },
        { id: 'c', title: 'C', data: { deadline: '2024-09-15' } },
      ];
      const f: FilterState = {
        ...empty,
        customFilters: { deadline: { from: '2024-04-01', to: '2024-08-01' } },
      };
      const result = applyFilters(entitiesWithDate as any, f);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('b');
    });

    // Combined filters
    it('комбинирует несколько фильтров (AND)', () => {
      const f: FilterState = {
        ...empty,
        assigneeIds: ['user-1'],
        priorities: ['high'],
      };
      const result = applyFilters(entities, f);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('пустая коллекция возвращает пустой массив', () => {
      expect(applyFilters([], empty)).toEqual([]);
    });

    // Custom filter: client field (object with multiple string values)
    it('фильтрует по клиентскому полю (объект)', () => {
      const entitiesWithClient = [
        { id: '1', title: 'A', data: { client: { name: 'Иванов', phone: '+7900', email: 'ivan@test.ru' } } },
        { id: '2', title: 'B', data: { client: { name: 'Петров', phone: '+7911', email: 'petrov@test.ru' } } },
      ];
      const f: FilterState = {
        ...empty,
        customFilters: { client: 'иванов' },
      };
      const result = applyFilters(entitiesWithClient as any, f);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    // Multi-select entity values (array in entity data)
    it('фильтрует когда значение сущности — массив (multi-select)', () => {
      const entitiesWithArray = [
        { id: '1', title: 'A', data: { tags: ['frontend', 'backend'] } },
        { id: '2', title: 'B', data: { tags: ['devops'] } },
      ];
      const f: FilterState = {
        ...empty,
        customFilters: { tags: ['frontend'] },
      };
      const result = applyFilters(entitiesWithArray as any, f);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });
  });
});
