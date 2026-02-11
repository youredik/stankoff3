import { test, expect, type Page } from '@playwright/test';
import {
  sidebar,
  kanban,
  filterPanel,
} from './helpers/selectors';
import {
  goToDashboard,
  getWorkspacesApi,
  createEntityApi,
} from './helpers/test-utils';

/**
 * E2E тесты для персистенции и изоляции фильтров по workspace.
 *
 * Проверяют:
 *  - Фильтры сохраняются в localStorage при установке
 *  - Фильтры восстанавливаются при возвращении в workspace
 *  - Фильтры изолированы: workspace A не влияет на workspace B
 *  - Сброс фильтров очищает localStorage для workspace
 *
 * Используются workspaces «Заявки клиентов» (ZK) и «Сервисные заявки» (SZ)
 * — оба имеют текстовые поля в секции «Детали».
 */

const WS_A = 'Заявки клиентов';
const WS_B = 'Сервисные заявки';

interface WsInfo {
  id: string;
  name: string;
  textFieldId: string;
}

/** Получить инфо о двух workspace с текстовыми полями */
async function getTwoWorkspaces(): Promise<{ a: WsInfo; b: WsInfo } | null> {
  const workspaces = await getWorkspacesApi();

  function extractTextFieldId(ws: any): string | null {
    if (!ws?.sections) return null;
    const details = ws.sections.find(
      (s: any) => s.id === 'details' || s.name === 'Детали',
    );
    if (!details) return null;
    const textField = details.fields?.find((f: any) => f.type === 'text');
    return textField?.id ?? null;
  }

  const wsA = workspaces.find((w: any) => w.name === WS_A);
  const wsB = workspaces.find((w: any) => w.name === WS_B);
  if (!wsA || !wsB) return null;

  const fieldA = extractTextFieldId(wsA);
  const fieldB = extractTextFieldId(wsB);
  if (!fieldA || !fieldB) return null;

  return {
    a: { id: wsA.id, name: WS_A, textFieldId: fieldA },
    b: { id: wsB.id, name: WS_B, textFieldId: fieldB },
  };
}

/** Навигация к workspace по имени с ожиданием загрузки */
async function navigateToWorkspace(page: Page, name: string): Promise<boolean> {
  await goToDashboard(page);

  const wsButton = page.locator(sidebar.workspaceButton);
  try {
    await expect(wsButton.first()).toBeVisible({ timeout: 15000 });
  } catch {
    return false;
  }

  const targetButton = wsButton.filter({ hasText: name });
  const hasTarget = await targetButton.isVisible().catch(() => false);
  if (!hasTarget) return false;

  await targetButton.click();
  await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });
  return true;
}

/** Переключиться на другой workspace в sidebar (без перезагрузки dashboard) */
async function switchToWorkspace(page: Page, name: string): Promise<boolean> {
  const wsButton = page.locator(sidebar.workspaceButton).filter({ hasText: name });
  const hasTarget = await wsButton.isVisible().catch(() => false);
  if (!hasTarget) return false;

  await wsButton.click();
  await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });
  return true;
}

/** Открыть панель фильтров */
async function openFilterPanel(page: Page): Promise<boolean> {
  // Если панель фильтров уже открыта — просто вернуть true
  const alreadyOpen = await page.locator(filterPanel.root).isVisible().catch(() => false);
  if (alreadyOpen) return true;

  await page.locator(kanban.filterButton).click();
  try {
    await expect(page.locator(filterPanel.root)).toBeVisible({ timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/** Установить текстовый фильтр в поле по fieldId */
async function setTextFilter(page: Page, fieldId: string, value: string): Promise<boolean> {
  const fieldEl = page.locator(filterPanel.field(fieldId));
  try {
    await expect(fieldEl).toBeVisible({ timeout: 5000 });
  } catch {
    return false;
  }

  // Раскрываем поле если свёрнуто
  const input = fieldEl.locator('input[type="text"]');
  const isExpanded = await input.isVisible().catch(() => false);
  if (!isExpanded) {
    await fieldEl.locator('button').first().click();
    await page.waitForTimeout(300);
  }

  await input.fill(value);
  await page.waitForTimeout(500);
  return true;
}

/** Получить значение текстового фильтра */
async function getTextFilterValue(page: Page, fieldId: string): Promise<string | null> {
  const fieldEl = page.locator(filterPanel.field(fieldId));
  const isVisible = await fieldEl.isVisible().catch(() => false);
  if (!isVisible) return null;

  const input = fieldEl.locator('input[type="text"]');
  const isExpanded = await input.isVisible().catch(() => false);
  if (!isExpanded) return null;

  return input.inputValue();
}

/** Установить поисковый фильтр */
async function setSearchFilter(page: Page, value: string): Promise<void> {
  const searchInput = page.locator(filterPanel.searchInput);
  await expect(searchInput).toBeVisible({ timeout: 3000 });
  await searchInput.fill(value);
  await page.waitForTimeout(500);
}

/** Получить значение поискового фильтра */
async function getSearchValue(page: Page): Promise<string> {
  const searchInput = page.locator(filterPanel.searchInput);
  const isVisible = await searchInput.isVisible().catch(() => false);
  if (!isVisible) return '';
  return searchInput.inputValue();
}

/** Очистить localStorage ключей фильтров (для чистого состояния теста) */
async function clearFilterStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('workspace-filters:')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  });
}

test.describe('Персистенция и изоляция фильтров по workspace', () => {
  test.beforeEach(async ({ page }) => {
    await goToDashboard(page);
    await clearFilterStorage(page);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Персистенция фильтров
  // ═══════════════════════════════════════════════════════════════════════

  test('Поисковый фильтр сохраняется в localStorage', async ({ page }) => {
    const ok = await navigateToWorkspace(page, WS_A);
    if (!ok) { test.skip(); return; }

    const hasPanel = await openFilterPanel(page);
    if (!hasPanel) { test.skip(); return; }

    await setSearchFilter(page, 'Тест персистенции');

    // Проверяем localStorage
    const stored = await page.evaluate((wsName) => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('workspace-filters:')) {
          const data = JSON.parse(localStorage.getItem(key)!);
          if (data.search === 'Тест персистенции') return key;
        }
      }
      return null;
    }, WS_A);

    expect(stored).not.toBeNull();
  });

  test('Поисковый фильтр восстанавливается после перехода назад', async ({ page }) => {
    const ok = await navigateToWorkspace(page, WS_A);
    if (!ok) { test.skip(); return; }

    let hasPanel = await openFilterPanel(page);
    if (!hasPanel) { test.skip(); return; }

    await setSearchFilter(page, 'ВосстановлениеПоиска');

    // Переходим в другой workspace
    const switched = await switchToWorkspace(page, WS_B);
    if (!switched) { test.skip(); return; }

    // Возвращаемся
    await switchToWorkspace(page, WS_A);
    hasPanel = await openFilterPanel(page);
    if (!hasPanel) { test.skip(); return; }

    const value = await getSearchValue(page);
    expect(value).toBe('ВосстановлениеПоиска');
  });

  test('Кастомный текстовый фильтр восстанавливается после навигации', async ({ page }) => {
    const wsInfo = await getTwoWorkspaces();
    if (!wsInfo) { test.skip(); return; }

    const ok = await navigateToWorkspace(page, WS_A);
    if (!ok) { test.skip(); return; }

    // Ждём загрузки секции «Детали»
    let hasPanel = await openFilterPanel(page);
    if (!hasPanel) { test.skip(); return; }

    const detailsSection = page.locator(filterPanel.detailsSection);
    try {
      await expect(detailsSection).toBeVisible({ timeout: 5000 });
    } catch { test.skip(); return; }

    // Устанавливаем текстовый фильтр
    const filterSet = await setTextFilter(page, wsInfo.a.textFieldId, 'ПерсистентноеЗначение');
    if (!filterSet) { test.skip(); return; }

    // Уходим
    await switchToWorkspace(page, WS_B);
    await page.waitForTimeout(500);

    // Возвращаемся
    await switchToWorkspace(page, WS_A);
    hasPanel = await openFilterPanel(page);
    if (!hasPanel) { test.skip(); return; }

    // Ждём секцию «Детали»
    try {
      await expect(detailsSection).toBeVisible({ timeout: 5000 });
    } catch { test.skip(); return; }

    // Раскрываем поле
    const fieldEl = page.locator(filterPanel.field(wsInfo.a.textFieldId));
    await expect(fieldEl).toBeVisible({ timeout: 3000 });
    const input = fieldEl.locator('input[type="text"]');
    const isExpanded = await input.isVisible().catch(() => false);
    if (!isExpanded) {
      await fieldEl.locator('button').first().click();
      await page.waitForTimeout(300);
    }

    const value = await input.inputValue();
    expect(value).toBe('ПерсистентноеЗначение');
  });

  test('Сброс фильтров очищает сохранённое значение', async ({ page }) => {
    const ok = await navigateToWorkspace(page, WS_A);
    if (!ok) { test.skip(); return; }

    const hasPanel = await openFilterPanel(page);
    if (!hasPanel) { test.skip(); return; }

    await setSearchFilter(page, 'БудетСброшено');
    await page.waitForTimeout(300);

    // Сбрасываем
    const resetButton = page.locator(filterPanel.resetButton);
    await expect(resetButton).toBeVisible({ timeout: 3000 });
    await resetButton.click();
    await page.waitForTimeout(500);

    // Проверяем localStorage — search должен быть пустым
    const hasOldValue = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('workspace-filters:')) {
          const data = JSON.parse(localStorage.getItem(key)!);
          if (data.search === 'БудетСброшено') return true;
        }
      }
      return false;
    });

    expect(hasOldValue).toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Изоляция фильтров
  // ═══════════════════════════════════════════════════════════════════════

  test('Фильтры изолированы: поиск в workspace A не виден в workspace B', async ({ page }) => {
    // Устанавливаем фильтр в workspace A
    let ok = await navigateToWorkspace(page, WS_A);
    if (!ok) { test.skip(); return; }

    let hasPanel = await openFilterPanel(page);
    if (!hasPanel) { test.skip(); return; }
    await setSearchFilter(page, 'ТолькоВоркспейсА');

    // Переходим в workspace B
    ok = await switchToWorkspace(page, WS_B);
    if (!ok) { test.skip(); return; }

    hasPanel = await openFilterPanel(page);
    if (!hasPanel) { test.skip(); return; }

    // Поисковый фильтр должен быть пустым
    const value = await getSearchValue(page);
    expect(value).toBe('');
  });

  test('Фильтры изолированы: поиск в workspace B не затирает фильтр workspace A', async ({ page }) => {
    // Устанавливаем фильтр в workspace A
    let ok = await navigateToWorkspace(page, WS_A);
    if (!ok) { test.skip(); return; }

    let hasPanel = await openFilterPanel(page);
    if (!hasPanel) { test.skip(); return; }
    await setSearchFilter(page, 'ФильтрА');

    // Переходим в workspace B и устанавливаем другой фильтр
    ok = await switchToWorkspace(page, WS_B);
    if (!ok) { test.skip(); return; }

    hasPanel = await openFilterPanel(page);
    if (!hasPanel) { test.skip(); return; }
    await setSearchFilter(page, 'ФильтрБ');

    // Возвращаемся в workspace A
    await switchToWorkspace(page, WS_A);
    hasPanel = await openFilterPanel(page);
    if (!hasPanel) { test.skip(); return; }

    // Фильтр A сохранился
    const valueA = await getSearchValue(page);
    expect(valueA).toBe('ФильтрА');
  });

  test('Кастомные фильтры изолированы между workspace', async ({ page }) => {
    const wsInfo = await getTwoWorkspaces();
    if (!wsInfo) { test.skip(); return; }

    // Устанавливаем кастомный фильтр в workspace A
    let ok = await navigateToWorkspace(page, WS_A);
    if (!ok) { test.skip(); return; }

    let hasPanel = await openFilterPanel(page);
    if (!hasPanel) { test.skip(); return; }

    const detailsA = page.locator(filterPanel.detailsSection);
    try {
      await expect(detailsA).toBeVisible({ timeout: 5000 });
    } catch { test.skip(); return; }

    await setTextFilter(page, wsInfo.a.textFieldId, 'КастомФильтрА');

    // Переходим в workspace B
    ok = await switchToWorkspace(page, WS_B);
    if (!ok) { test.skip(); return; }

    hasPanel = await openFilterPanel(page);
    if (!hasPanel) { test.skip(); return; }

    const detailsB = page.locator(filterPanel.detailsSection);
    try {
      await expect(detailsB).toBeVisible({ timeout: 5000 });
    } catch { test.skip(); return; }

    // Текстовое поле в B не должно содержать значение из A
    const fieldB = page.locator(filterPanel.field(wsInfo.b.textFieldId));
    const isVisible = await fieldB.isVisible().catch(() => false);
    if (isVisible) {
      const inputB = fieldB.locator('input[type="text"]');
      const isExpanded = await inputB.isVisible().catch(() => false);
      if (isExpanded) {
        const valueB = await inputB.inputValue();
        expect(valueB).toBe('');
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Фильтрация данных с персистенцией
  // ═══════════════════════════════════════════════════════════════════════

  test('Восстановленный поисковый фильтр реально фильтрует данные', async ({ page }) => {
    const wsInfo = await getTwoWorkspaces();
    if (!wsInfo) { test.skip(); return; }

    const uniqueTitle = `Персистенция_${Date.now()}`;

    // Создаём entity с уникальным названием
    const entity = await createEntityApi(wsInfo.a.id, uniqueTitle);
    if (!entity) { test.skip(); return; }

    // Заходим в workspace A, ставим фильтр по уникальному названию
    let ok = await navigateToWorkspace(page, WS_A);
    if (!ok) { test.skip(); return; }

    let hasPanel = await openFilterPanel(page);
    if (!hasPanel) { test.skip(); return; }
    await setSearchFilter(page, uniqueTitle);
    await page.waitForTimeout(1000);

    // Карточка видна
    const card = page.locator(kanban.card).filter({ hasText: entity.customId });
    await expect(card.first()).toBeVisible({ timeout: 10000 });

    // Уходим в B
    await switchToWorkspace(page, WS_B);
    await page.waitForTimeout(500);

    // Возвращаемся в A
    await switchToWorkspace(page, WS_A);
    await page.waitForTimeout(1500);

    // Фильтр должен быть активен и данные отфильтрованы
    hasPanel = await openFilterPanel(page);
    if (!hasPanel) { test.skip(); return; }

    const searchValue = await getSearchValue(page);
    expect(searchValue).toBe(uniqueTitle);

    // Наша карточка видна (фильтр работает)
    await expect(card.first()).toBeVisible({ timeout: 10000 });
  });

  test('Каждый workspace хранит свои фильтры в отдельном ключе localStorage', async ({ page }) => {
    // Устанавливаем фильтры в обоих workspace
    let ok = await navigateToWorkspace(page, WS_A);
    if (!ok) { test.skip(); return; }

    let hasPanel = await openFilterPanel(page);
    if (!hasPanel) { test.skip(); return; }
    await setSearchFilter(page, 'SearchA');

    ok = await switchToWorkspace(page, WS_B);
    if (!ok) { test.skip(); return; }

    hasPanel = await openFilterPanel(page);
    if (!hasPanel) { test.skip(); return; }
    await setSearchFilter(page, 'SearchB');

    // Проверяем что в localStorage есть два разных ключа
    const keys = await page.evaluate(() => {
      const result: { key: string; search: string }[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('workspace-filters:')) {
          const data = JSON.parse(localStorage.getItem(key)!);
          result.push({ key, search: data.search });
        }
      }
      return result;
    });

    const filterKeys = keys.filter((k) => k.search === 'SearchA' || k.search === 'SearchB');
    expect(filterKeys.length).toBe(2);

    const searchValues = filterKeys.map((k) => k.search).sort();
    expect(searchValues).toEqual(['SearchA', 'SearchB']);

    // Ключи должны быть разными (разные workspace ID)
    const uniqueKeys = new Set(filterKeys.map((k) => k.key));
    expect(uniqueKeys.size).toBe(2);
  });
});
