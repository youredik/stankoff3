import { useState, useMemo } from 'react';

const DEFAULT_THRESHOLD = 6;
const DEFAULT_VISIBLE_COUNT = 5;

interface UseFilterableListOptions<T> {
  /** Full list of items */
  items: T[];
  /** IDs of currently selected items */
  selectedIds: string[];
  /** Extract searchable text from an item */
  getSearchText: (item: T) => string;
  /** Extract unique ID from an item */
  getId: (item: T) => string;
  /** Show search + collapse only when items exceed this count (default: 6) */
  threshold?: number;
  /** How many unselected items to show in collapsed state (default: 5) */
  visibleCount?: number;
}

interface UseFilterableListResult<T> {
  /** Current search query */
  searchQuery: string;
  /** Update search query */
  setSearchQuery: (q: string) => void;
  /** Selected items (always visible, sorted to top) */
  selectedItems: T[];
  /** Unselected visible items (limited by collapse state) */
  unselectedItems: T[];
  /** Whether search/collapse UI should be shown */
  needsControls: boolean;
  /** Whether there are hidden items behind "show more" */
  hasMore: boolean;
  /** Count of hidden items */
  hiddenCount: number;
  /** Whether list is fully expanded */
  showAll: boolean;
  /** Toggle expand/collapse */
  toggleShowAll: () => void;
  /** Total matching unselected after search */
  totalFilteredUnselected: number;
}

export function useFilterableList<T>({
  items,
  selectedIds,
  getSearchText,
  getId,
  threshold = DEFAULT_THRESHOLD,
  visibleCount = DEFAULT_VISIBLE_COUNT,
}: UseFilterableListOptions<T>): UseFilterableListResult<T> {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const needsControls = items.length > threshold;
  const queryLower = searchQuery.toLowerCase().trim();

  const { selectedItems, filteredUnselected } = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    const selected: T[] = [];
    const unselected: T[] = [];

    for (const item of items) {
      if (selectedSet.has(getId(item))) {
        selected.push(item);
      } else {
        if (!queryLower || getSearchText(item).toLowerCase().includes(queryLower)) {
          unselected.push(item);
        }
      }
    }

    return { selectedItems: selected, filteredUnselected: unselected };
  }, [items, selectedIds, queryLower, getId, getSearchText]);

  const unselectedItems = useMemo(() => {
    if (!needsControls || showAll || queryLower) {
      return filteredUnselected;
    }
    return filteredUnselected.slice(0, visibleCount);
  }, [filteredUnselected, needsControls, showAll, queryLower, visibleCount]);

  const hiddenCount = filteredUnselected.length - unselectedItems.length;

  return {
    searchQuery,
    setSearchQuery,
    selectedItems,
    unselectedItems,
    needsControls,
    hasMore: hiddenCount > 0,
    hiddenCount,
    showAll,
    toggleShowAll: () => setShowAll((v) => !v),
    totalFilteredUnselected: filteredUnselected.length,
  };
}
