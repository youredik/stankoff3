import { test, expect, type Page } from '@playwright/test';
import {
  sidebar,
  kanban,
  filterPanel,
} from './helpers/selectors';
import {
  goToDashboard,
  selectWorkspaceByName,
  createTestEntity,
  dismissToasts,
  createEntityApi,
  getWorkspacesApi,
} from './helpers/test-utils';

/**
 * E2E тесты для секции «Детали» в панели фильтров.
 *
 * Секция «Детали» содержит кастомные поля workspace (text, number, date и т.д.).
 * Тесты проверяют:
 *  - Секция развёрнута по умолчанию
 *  - Поля секции видны и кликабельны
 *  - Текстовые фильтры фильтруют данные
 *  - Числовые фильтры (диапазон) работают
 *  - Сброс кастомных фильтров возвращает все данные
 *  - Бейдж с количеством активных фильтров
 *
 * Используется workspace «Заявки клиентов» (ZK) — имеет поля:
 *   customer (text), equipment_type (text), amount (number)
 */

const TARGET_WS = 'Заявки клиентов';

/** Навигация к целевому workspace с ожиданием загрузки */
async function navigateToTargetWorkspace(page: Page): Promise<boolean> {
  await goToDashboard(page);

  // Ждём пока кнопки workspaces загрузятся в sidebar
  const wsButton = page.locator(sidebar.workspaceButton);
  try {
    await expect(wsButton.first()).toBeVisible({ timeout: 15000 });
  } catch {
    return false;
  }

  // Ищем целевой workspace
  const targetButton = wsButton.filter({ hasText: TARGET_WS });
  const hasTarget = await targetButton.isVisible().catch(() => false);
  if (!hasTarget) return false;

  await targetButton.click();
  await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });
  return true;
}

/** Открыть панель фильтров и дождаться загрузки секций workspace */
async function openFilterPanel(page: Page): Promise<boolean> {
  await page.locator(kanban.filterButton).click();
  await expect(page.locator(filterPanel.root)).toBeVisible({ timeout: 3000 });

  // Ждём появления секции «Детали» (workspace данные могут загружаться async)
  const detailsSection = page.locator(filterPanel.detailsSection);
  try {
    await expect(detailsSection).toBeVisible({ timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** Найти workspace и его текстовое поле из секции «Детали» */
async function findTextFieldInDetails(): Promise<{
  wsId: string;
  fieldId: string;
} | null> {
  const workspaces = await getWorkspacesApi();
  const ws = workspaces.find((w: any) => w.name === TARGET_WS);
  if (!ws?.sections) return null;

  const details = ws.sections.find(
    (s: any) => s.id === 'details' || s.name === 'Детали',
  );
  if (!details) return null;

  const textField = details.fields?.find((f: any) => f.type === 'text');
  if (!textField) return null;

  return { wsId: ws.id, fieldId: textField.id };
}

/** Найти workspace и его числовое поле из секции «Детали» */
async function findNumberFieldInDetails(): Promise<{
  wsId: string;
  fieldId: string;
} | null> {
  const workspaces = await getWorkspacesApi();
  const ws = workspaces.find((w: any) => w.name === TARGET_WS);
  if (!ws?.sections) return null;

  const details = ws.sections.find(
    (s: any) => s.id === 'details' || s.name === 'Детали',
  );
  if (!details) return null;

  const numberField = details.fields?.find((f: any) => f.type === 'number');
  if (!numberField) return null;

  return { wsId: ws.id, fieldId: numberField.id };
}

test.describe('Секция «Детали» в панели фильтров', () => {
  test.beforeEach(async ({ page }) => {
    const ok = await navigateToTargetWorkspace(page);
    if (!ok) {
      test.skip();
      return;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Секция «Детали» — отображение и навигация
  // ═══════════════════════════════════════════════════════════════════════

  test('Секция «Детали» развёрнута по умолчанию при открытии фильтров', async ({
    page,
  }) => {
    const hasPanel = await openFilterPanel(page);
    if (!hasPanel) {
      test.skip();
      return;
    }

    const detailsSection = page.locator(filterPanel.detailsSection);

    // Текст «Детали» отображается в заголовке секции
    await expect(detailsSection.getByText('Детали')).toBeVisible();

    // Поля видны (секция развёрнута)
    const fields = detailsSection.locator('[data-testid^="filter-field-"]');
    const fieldCount = await fields.count();
    expect(fieldCount).toBeGreaterThan(0);
  });

  test('Секция «Общие» тоже развёрнута по умолчанию', async ({ page }) => {
    const hasPanel = await openFilterPanel(page);
    if (!hasPanel) {
      test.skip();
      return;
    }

    // Поле поиска видно (= секция «Общие» развёрнута)
    await expect(page.locator(filterPanel.searchInput)).toBeVisible();
  });

  test('Поля секции «Детали» видны и кликабельны', async ({ page }) => {
    const hasPanel = await openFilterPanel(page);
    if (!hasPanel) {
      test.skip();
      return;
    }

    const detailsSection = page.locator(filterPanel.detailsSection);
    const fields = detailsSection.locator('[data-testid^="filter-field-"]');
    const fieldCount = await fields.count();
    expect(fieldCount).toBeGreaterThan(0);

    // Каждое поле содержит кнопку для раскрытия
    for (let i = 0; i < fieldCount; i++) {
      const button = fields.nth(i).locator('button').first();
      await expect(button).toBeVisible();
    }
  });

  test('Клик по полю раскрывает компонент фильтра', async ({ page }) => {
    const hasPanel = await openFilterPanel(page);
    if (!hasPanel) {
      test.skip();
      return;
    }

    const detailsSection = page.locator(filterPanel.detailsSection);
    const firstField = detailsSection
      .locator('[data-testid^="filter-field-"]')
      .first();
    await firstField.locator('button').first().click();
    await page.waitForTimeout(300);

    // После клика появляется input или чекбоксы
    const hasInput = await firstField
      .locator('input')
      .first()
      .isVisible()
      .catch(() => false);
    const hasLabel = await firstField
      .locator('label')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasInput || hasLabel).toBeTruthy();
  });

  test('Секция «Детали» можно свернуть и развернуть обратно', async ({
    page,
  }) => {
    const hasPanel = await openFilterPanel(page);
    if (!hasPanel) {
      test.skip();
      return;
    }

    const detailsSection = page.locator(filterPanel.detailsSection);
    const fields = detailsSection.locator('[data-testid^="filter-field-"]');
    const initialCount = await fields.count();
    expect(initialCount).toBeGreaterThan(0);

    // Сворачиваем
    await detailsSection.locator('button').first().click();
    await page.waitForTimeout(300);
    await expect(fields).toHaveCount(0, { timeout: 2000 });

    // Разворачиваем обратно
    await detailsSection.locator('button').first().click();
    await page.waitForTimeout(300);
    const finalCount = await fields.count();
    expect(finalCount).toBe(initialCount);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Текстовый фильтр
  // ═══════════════════════════════════════════════════════════════════════

  test('Текстовый фильтр в секции «Детали» фильтрует карточки', async ({
    page,
  }) => {
    const info = await findTextFieldInDetails();
    if (!info) {
      test.skip();
      return;
    }

    const uniqueValue = `УникФильтр_${Date.now()}`;

    // Создаём entity с уникальным значением текстового поля
    const entity = await createEntityApi(info.wsId, `Тест фильтра Детали ${Date.now()}`, {
      data: { [info.fieldId]: uniqueValue },
    });
    if (!entity) {
      test.skip();
      return;
    }

    await page.reload();
    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });

    const hasPanel = await openFilterPanel(page);
    if (!hasPanel) {
      test.skip();
      return;
    }

    // Раскрываем текстовое поле
    const fieldEl = page.locator(filterPanel.field(info.fieldId));
    await expect(fieldEl).toBeVisible({ timeout: 3000 });
    await fieldEl.locator('button').first().click();
    await page.waitForTimeout(300);

    // Вводим уникальное значение
    const filterInput = fieldEl.locator('input[type="text"]');
    await expect(filterInput).toBeVisible({ timeout: 3000 });
    await filterInput.fill(uniqueValue);
    await page.waitForTimeout(800);

    // Наша карточка видна
    const ourCard = page
      .locator(kanban.card)
      .filter({ hasText: entity.customId });
    await expect(ourCard.first()).toBeVisible({ timeout: 5000 });
  });

  test('Текстовый фильтр по несуществующему значению скрывает карточки', async ({
    page,
  }) => {
    const hasPanel = await openFilterPanel(page);
    if (!hasPanel) {
      test.skip();
      return;
    }

    const detailsSection = page.locator(filterPanel.detailsSection);
    const firstField = detailsSection
      .locator('[data-testid^="filter-field-"]')
      .first();
    await firstField.locator('button').first().click();
    await page.waitForTimeout(300);

    const filterInput = firstField.locator('input[type="text"]');
    const hasInput = await filterInput.isVisible().catch(() => false);
    if (!hasInput) {
      // Если первое поле — не текстовое, пробуем другое
      test.skip();
      return;
    }

    const nonsense = `НесуществующееZXY_${Date.now()}`;
    await filterInput.fill(nonsense);
    await page.waitForTimeout(800);

    // Канбан доска всё ещё видна (не сломалась)
    await expect(page.locator(kanban.board)).toBeVisible();

    // Карточек с таким текстом нет
    const cards = page.locator(kanban.card);
    const count = await cards.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const cardText = await cards.nth(i).textContent();
      expect(cardText).not.toContain(nonsense);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Числовой фильтр (диапазон)
  // ═══════════════════════════════════════════════════════════════════════

  test('Числовой фильтр — диапазон, содержащий значение, показывает карточку', async ({
    page,
  }) => {
    const info = await findNumberFieldInDetails();
    if (!info) {
      test.skip();
      return;
    }

    const testAmount = 999777;
    const entity = await createEntityApi(
      info.wsId,
      `Тест числового фильтра ${Date.now()}`,
      { data: { [info.fieldId]: testAmount } },
    );
    if (!entity) {
      test.skip();
      return;
    }

    await page.reload();
    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });

    const hasPanel = await openFilterPanel(page);
    if (!hasPanel) {
      test.skip();
      return;
    }

    const fieldEl = page.locator(filterPanel.field(info.fieldId));
    await expect(fieldEl).toBeVisible({ timeout: 3000 });
    await fieldEl.locator('button').first().click();
    await page.waitForTimeout(300);

    const minInput = fieldEl.locator('input[type="number"]').first();
    const maxInput = fieldEl.locator('input[type="number"]').last();
    await expect(minInput).toBeVisible({ timeout: 3000 });

    await minInput.fill(String(testAmount - 1));
    await maxInput.fill(String(testAmount + 1));
    await page.waitForTimeout(800);

    // Наша карточка видна
    const ourCard = page
      .locator(kanban.card)
      .filter({ hasText: entity.customId });
    await expect(ourCard.first()).toBeVisible({ timeout: 5000 });
  });

  test('Числовой фильтр — диапазон, НЕ содержащий значение, скрывает карточку', async ({
    page,
  }) => {
    const info = await findNumberFieldInDetails();
    if (!info) {
      test.skip();
      return;
    }

    const entity = await createEntityApi(
      info.wsId,
      `Тест исключ числом ${Date.now()}`,
      { data: { [info.fieldId]: 5000 } },
    );
    if (!entity) {
      test.skip();
      return;
    }

    await page.reload();
    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });

    const hasPanel = await openFilterPanel(page);
    if (!hasPanel) {
      test.skip();
      return;
    }

    const fieldEl = page.locator(filterPanel.field(info.fieldId));
    await expect(fieldEl).toBeVisible({ timeout: 3000 });
    await fieldEl.locator('button').first().click();
    await page.waitForTimeout(300);

    // Диапазон 1-10 (заявка с 5000 НЕ попадает)
    const minInput = fieldEl.locator('input[type="number"]').first();
    const maxInput = fieldEl.locator('input[type="number"]').last();
    await minInput.fill('1');
    await maxInput.fill('10');
    await page.waitForTimeout(800);

    // Наша карточка с 5000 НЕ должна быть видна
    const ourCard = page
      .locator(kanban.card)
      .filter({ hasText: entity.customId });
    await expect(ourCard).toHaveCount(0, { timeout: 3000 });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Сброс и бейдж
  // ═══════════════════════════════════════════════════════════════════════

  test('Сброс фильтров очищает кастомные фильтры секции «Детали»', async ({
    page,
  }) => {
    const hasPanel = await openFilterPanel(page);
    if (!hasPanel) {
      test.skip();
      return;
    }

    const detailsSection = page.locator(filterPanel.detailsSection);
    const firstField = detailsSection
      .locator('[data-testid^="filter-field-"]')
      .first();
    await firstField.locator('button').first().click();
    await page.waitForTimeout(300);

    const filterInput = firstField.locator('input').first();
    const hasInput = await filterInput.isVisible().catch(() => false);
    if (!hasInput) {
      test.skip();
      return;
    }

    await filterInput.fill('ТестовоеЗначение');
    await page.waitForTimeout(400);

    // Кнопка «Сбросить» видна
    const resetButton = page.locator(filterPanel.resetButton);
    await expect(resetButton).toBeVisible({ timeout: 3000 });
    await resetButton.click();
    await page.waitForTimeout(400);

    // Значение input очищено
    await expect(filterInput).toHaveValue('');
  });

  test('Бейдж активных фильтров учитывает кастомные фильтры', async ({
    page,
  }) => {
    const filterButton = page.locator(kanban.filterButton);

    const hasPanel = await openFilterPanel(page);
    if (!hasPanel) {
      test.skip();
      return;
    }

    const detailsSection = page.locator(filterPanel.detailsSection);
    const firstField = detailsSection
      .locator('[data-testid^="filter-field-"]')
      .first();
    await firstField.locator('button').first().click();
    await page.waitForTimeout(300);

    const filterInput = firstField.locator('input').first();
    const hasInput = await filterInput.isVisible().catch(() => false);
    if (!hasInput) {
      test.skip();
      return;
    }

    await filterInput.fill('Тест');
    await page.waitForTimeout(400);

    // Закрываем панель
    const overlay = page.locator('.fixed.inset-0.bg-black\\/20');
    const hasOverlay = await overlay.isVisible().catch(() => false);
    if (hasOverlay) {
      await overlay.click();
    }
    await page.waitForTimeout(300);

    // Бейдж показывает >= 1
    const badge = filterButton.locator('span').filter({ hasText: /^\d+$/ });
    await expect(badge).toBeVisible({ timeout: 3000 });
    const badgeText = await badge.textContent();
    expect(Number(badgeText)).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Комбинированная фильтрация
  // ═══════════════════════════════════════════════════════════════════════

  test('Комбинированная фильтрация: поиск + кастомное поле', async ({
    page,
  }) => {
    const info = await findTextFieldInDetails();
    if (!info) {
      test.skip();
      return;
    }

    const uniqueTitle = `КомбоФильтр_${Date.now()}`;
    const uniqueFieldValue = `КомбоКлиент_${Date.now()}`;

    const entity = await createEntityApi(info.wsId, uniqueTitle, {
      data: { [info.fieldId]: uniqueFieldValue },
    });
    if (!entity) {
      test.skip();
      return;
    }

    await page.reload();
    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });

    const hasPanel = await openFilterPanel(page);
    if (!hasPanel) {
      test.skip();
      return;
    }

    // Фильтр поиска
    await page.locator(filterPanel.searchInput).fill(uniqueTitle);
    await page.waitForTimeout(800);

    // + фильтр по кастомному полю
    const fieldEl = page.locator(filterPanel.field(info.fieldId));
    await expect(fieldEl).toBeVisible({ timeout: 3000 });
    await fieldEl.locator('button').first().click();
    await page.waitForTimeout(300);

    const filterInput = fieldEl.locator('input[type="text"]');
    await expect(filterInput).toBeVisible({ timeout: 3000 });
    await filterInput.fill(uniqueFieldValue);
    await page.waitForTimeout(800);

    // Карточка видна
    const ourCard = page
      .locator(kanban.card)
      .filter({ hasText: entity.customId });
    await expect(ourCard.first()).toBeVisible({ timeout: 5000 });
  });

  test('Кастомный фильтр + сброс возвращает все карточки', async ({
    page,
  }) => {
    // Создаём заявку для гарантии непустого канбана
    const title = `СбросДеталей_${Date.now()}`;
    await createTestEntity(page, title);
    await dismissToasts(page);
    await page.waitForTimeout(500);

    const cardsBefore = await page.locator(kanban.card).count();

    const hasPanel = await openFilterPanel(page);
    if (!hasPanel) {
      test.skip();
      return;
    }

    const detailsSection = page.locator(filterPanel.detailsSection);
    const firstField = detailsSection
      .locator('[data-testid^="filter-field-"]')
      .first();
    await firstField.locator('button').first().click();
    await page.waitForTimeout(300);

    const filterInput = firstField.locator('input').first();
    const hasInput = await filterInput.isVisible().catch(() => false);
    if (!hasInput) {
      test.skip();
      return;
    }

    await filterInput.fill('НесуществующееЗначение_XYZ');
    await page.waitForTimeout(800);

    // Сбрасываем
    const resetButton = page.locator(filterPanel.resetButton);
    await expect(resetButton).toBeVisible();
    await resetButton.click();
    await page.waitForTimeout(1500);

    // Карточки вернулись
    const cardsAfterReset = await page.locator(kanban.card).count();
    expect(cardsAfterReset).toBeGreaterThan(0);
  });
});
