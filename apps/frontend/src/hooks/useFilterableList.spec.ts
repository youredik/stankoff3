import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFilterableList } from './useFilterableList';

interface Item {
  id: string;
  name: string;
}

const makeItems = (count: number): Item[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `id-${i}`,
    name: `Item ${i}`,
  }));

const defaults = {
  getSearchText: (item: Item) => item.name,
  getId: (item: Item) => item.id,
};

describe('useFilterableList', () => {
  // ─── Small lists (≤ threshold) ────────────────────────────────

  it('показывает все элементы если их ≤ threshold', () => {
    const items = makeItems(5);
    const { result } = renderHook(() =>
      useFilterableList({ items, selectedIds: [], ...defaults }),
    );

    expect(result.current.needsControls).toBe(false);
    expect(result.current.selectedItems).toHaveLength(0);
    expect(result.current.unselectedItems).toHaveLength(5);
    expect(result.current.hasMore).toBe(false);
  });

  it('показывает все элементы если их ровно threshold (6)', () => {
    const items = makeItems(6);
    const { result } = renderHook(() =>
      useFilterableList({ items, selectedIds: [], ...defaults }),
    );

    expect(result.current.needsControls).toBe(false);
    expect(result.current.unselectedItems).toHaveLength(6);
  });

  // ─── Large lists (> threshold) ────────────────────────────────

  it('ограничивает видимые элементы до visibleCount (5) когда > threshold', () => {
    const items = makeItems(20);
    const { result } = renderHook(() =>
      useFilterableList({ items, selectedIds: [], ...defaults }),
    );

    expect(result.current.needsControls).toBe(true);
    expect(result.current.unselectedItems).toHaveLength(5);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.hiddenCount).toBe(15);
  });

  it('custom threshold работает', () => {
    const items = makeItems(10);
    const { result } = renderHook(() =>
      useFilterableList({ items, selectedIds: [], ...defaults, threshold: 3 }),
    );

    expect(result.current.needsControls).toBe(true);
    expect(result.current.unselectedItems).toHaveLength(5);
  });

  it('custom visibleCount работает', () => {
    const items = makeItems(20);
    const { result } = renderHook(() =>
      useFilterableList({ items, selectedIds: [], ...defaults, visibleCount: 3 }),
    );

    expect(result.current.unselectedItems).toHaveLength(3);
    expect(result.current.hiddenCount).toBe(17);
  });

  // ─── toggleShowAll ────────────────────────────────────────────

  it('toggleShowAll раскрывает весь список', () => {
    const items = makeItems(20);
    const { result } = renderHook(() =>
      useFilterableList({ items, selectedIds: [], ...defaults }),
    );

    expect(result.current.unselectedItems).toHaveLength(5);

    act(() => result.current.toggleShowAll());

    expect(result.current.showAll).toBe(true);
    expect(result.current.unselectedItems).toHaveLength(20);
    expect(result.current.hasMore).toBe(false);
  });

  it('toggleShowAll можно переключить обратно', () => {
    const items = makeItems(20);
    const { result } = renderHook(() =>
      useFilterableList({ items, selectedIds: [], ...defaults }),
    );

    act(() => result.current.toggleShowAll()); // expand
    act(() => result.current.toggleShowAll()); // collapse

    expect(result.current.showAll).toBe(false);
    expect(result.current.unselectedItems).toHaveLength(5);
  });

  // ─── Selected items ──────────────────────────────────────────

  it('выбранные элементы всегда в selectedItems', () => {
    const items = makeItems(20);
    const { result } = renderHook(() =>
      useFilterableList({ items, selectedIds: ['id-15', 'id-3'], ...defaults }),
    );

    expect(result.current.selectedItems).toHaveLength(2);
    expect(result.current.selectedItems.map((i) => i.id)).toEqual(['id-3', 'id-15']);
  });

  it('выбранные элементы НЕ входят в unselectedItems', () => {
    const items = makeItems(10);
    const { result } = renderHook(() =>
      useFilterableList({ items, selectedIds: ['id-0', 'id-1'], ...defaults }),
    );

    const unselectedIds = result.current.unselectedItems.map((i) => i.id);
    expect(unselectedIds).not.toContain('id-0');
    expect(unselectedIds).not.toContain('id-1');
  });

  it('выбранные элементы не считаются в visibleCount', () => {
    const items = makeItems(20);
    const { result } = renderHook(() =>
      useFilterableList({
        items,
        selectedIds: ['id-0', 'id-1', 'id-2'],
        ...defaults,
      }),
    );

    // 3 selected + 5 unselected visible
    expect(result.current.selectedItems).toHaveLength(3);
    expect(result.current.unselectedItems).toHaveLength(5);
    expect(result.current.hiddenCount).toBe(12); // 20 - 3 selected - 5 visible
  });

  // ─── Search ──────────────────────────────────────────────────

  it('поиск фильтрует невыбранные элементы', () => {
    const items = [
      { id: '1', name: 'Иванов Пётр' },
      { id: '2', name: 'Петрова Мария' },
      { id: '3', name: 'Сидоров Иван' },
      { id: '4', name: 'Козлов Алексей' },
      { id: '5', name: 'Иванова Анна' },
      { id: '6', name: 'Петров Дмитрий' },
      { id: '7', name: 'Смирнова Ольга' },
    ];
    const { result } = renderHook(() =>
      useFilterableList({ items, selectedIds: [], ...defaults }),
    );

    act(() => result.current.setSearchQuery('иван'));

    // «Иванов Пётр», «Сидоров Иван», «Иванова Анна»
    expect(result.current.unselectedItems).toHaveLength(3);
  });

  it('при поиске показывает все совпадения (без collapse)', () => {
    const items = makeItems(100);
    const { result } = renderHook(() =>
      useFilterableList({ items, selectedIds: [], ...defaults }),
    );

    // Without search: 5 visible
    expect(result.current.unselectedItems).toHaveLength(5);

    // With search: all matching shown (no collapse during search)
    act(() => result.current.setSearchQuery('Item 1'));

    // Matches: Item 1, Item 10..19 = 11 items
    expect(result.current.unselectedItems.length).toBe(11);
  });

  it('выбранные элементы видны даже если не совпадают с поиском', () => {
    const items = [
      { id: '1', name: 'Алиса' },
      { id: '2', name: 'Борис' },
      { id: '3', name: 'Виктор' },
      { id: '4', name: 'Галина' },
      { id: '5', name: 'Дмитрий' },
      { id: '6', name: 'Елена' },
      { id: '7', name: 'Жанна' },
    ];
    const { result } = renderHook(() =>
      useFilterableList({ items, selectedIds: ['2'], ...defaults }),
    );

    act(() => result.current.setSearchQuery('алис'));

    // Борис selected (always visible) + Алиса matches search
    expect(result.current.selectedItems).toHaveLength(1);
    expect(result.current.selectedItems[0].name).toBe('Борис');
    expect(result.current.unselectedItems).toHaveLength(1);
    expect(result.current.unselectedItems[0].name).toBe('Алиса');
  });

  it('поиск регистронезависимый', () => {
    const items = [
      { id: '1', name: 'UPPERCASE' },
      { id: '2', name: 'lowercase' },
      { id: '3', name: 'Other' },
      { id: '4', name: 'A' },
      { id: '5', name: 'B' },
      { id: '6', name: 'C' },
      { id: '7', name: 'D' },
    ];
    const { result } = renderHook(() =>
      useFilterableList({ items, selectedIds: [], ...defaults }),
    );

    act(() => result.current.setSearchQuery('upper'));
    expect(result.current.unselectedItems).toHaveLength(1);
    expect(result.current.unselectedItems[0].id).toBe('1');
  });

  // ─── Edge cases ──────────────────────────────────────────────

  it('пустой список', () => {
    const { result } = renderHook(() =>
      useFilterableList({ items: [], selectedIds: [], ...defaults }),
    );

    expect(result.current.needsControls).toBe(false);
    expect(result.current.selectedItems).toHaveLength(0);
    expect(result.current.unselectedItems).toHaveLength(0);
  });

  it('все элементы выбраны — unselectedItems пуст', () => {
    const items = makeItems(3);
    const { result } = renderHook(() =>
      useFilterableList({
        items,
        selectedIds: ['id-0', 'id-1', 'id-2'],
        ...defaults,
      }),
    );

    expect(result.current.selectedItems).toHaveLength(3);
    expect(result.current.unselectedItems).toHaveLength(0);
  });

  it('totalFilteredUnselected корректен', () => {
    const items = makeItems(20);
    const { result } = renderHook(() =>
      useFilterableList({ items, selectedIds: ['id-0'], ...defaults }),
    );

    expect(result.current.totalFilteredUnselected).toBe(19); // 20 - 1 selected
  });
});
