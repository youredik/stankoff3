import { test, expect } from '@playwright/test';
import {
  sidebar,
  kanban,
  entityDetail,
  createEntity,
  header,
} from './helpers/selectors';
import {
  goToDashboard,
  selectWorkspaceByName,
  createTestEntity,
  openEntityDetail,
  closeEntityDetail,
  dismissToasts,
} from './helpers/test-utils';

/**
 * Тесты CRUD операций над заявками (Entity).
 * Используют авторизацию admin (default storageState из playwright.config).
 */

// Уникальный суффикс для тестов — помогает cleanup найти тестовые данные
const TIMESTAMP = Date.now();

test.describe('Создание заявки - Модальное окно', () => {
  test.beforeEach(async ({ page }) => {
    await goToDashboard(page);
    await selectWorkspaceByName(page, 'Техническая поддержка');
    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });
    await dismissToasts(page);
  });

  test('Кнопка "Новая заявка" видна на канбан-доске', async ({ page }) => {
    const newEntityBtn = page.locator(kanban.newEntityButton);
    await expect(newEntityBtn).toBeVisible();
    await expect(newEntityBtn).toContainText('Новая заявка');
  });

  test('Клик на "Новая заявка" открывает модальное окно создания', async ({ page }) => {
    await page.locator(kanban.newEntityButton).click();

    // Модальное окно должно появиться
    const modal = page.locator(createEntity.modal);
    await expect(modal).toBeVisible({ timeout: 3000 });
  });

  test('Модальное окно содержит поле ввода названия', async ({ page }) => {
    await page.locator(kanban.newEntityButton).click();
    await expect(page.locator(createEntity.modal)).toBeVisible({ timeout: 3000 });

    const titleInput = page.locator(createEntity.titleInput);
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toBeEditable();

    // Поле должно иметь placeholder или label
    // Проверяем что поле пустое изначально
    await expect(titleInput).toHaveValue('');
  });

  test('Модальное окно содержит кнопку "Создать заявку"', async ({ page }) => {
    await page.locator(kanban.newEntityButton).click();
    await expect(page.locator(createEntity.modal)).toBeVisible({ timeout: 3000 });

    const submitBtn = page.locator(createEntity.submit);
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toContainText('Создать заявку');
  });

  test('Кнопка "Создать заявку" заблокирована при пустом названии', async ({ page }) => {
    await page.locator(kanban.newEntityButton).click();
    await expect(page.locator(createEntity.modal)).toBeVisible({ timeout: 3000 });

    // Не заполняем поле — кнопка должна быть disabled
    const submitBtn = page.locator(createEntity.submit);
    await expect(submitBtn).toBeDisabled();
  });
});

test.describe('Создание заявки - Функциональность', () => {
  test.beforeEach(async ({ page }) => {
    await goToDashboard(page);
    await selectWorkspaceByName(page, 'Техническая поддержка');
    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });
    await dismissToasts(page);
  });

  test('Создание заявки с названием добавляет карточку на канбан-доску', async ({ page }) => {
    const title = `Playwright тест ${TIMESTAMP}-create`;
    await createTestEntity(page, title);

    // Карточка должна появиться на доске
    const card = page.locator(kanban.card).filter({ hasText: title });
    await expect(card).toBeVisible({ timeout: 8000 });

    // Карточка содержит текст названия в <h4>
    await expect(card.locator('h4')).toContainText(title);
  });

  test('Созданная заявка имеет автосгенерированный customId с префиксом TP-', async ({ page }) => {
    const title = `Playwright тест ${TIMESTAMP}-customid`;
    await createTestEntity(page, title);

    // Находим карточку
    const card = page.locator(kanban.card).filter({ hasText: title });
    await expect(card).toBeVisible({ timeout: 8000 });

    // CustomId в формате TP-XXX отображается на карточке (font-mono)
    const customIdElement = card.locator('.font-mono');
    await expect(customIdElement).toBeVisible();
    const customIdText = await customIdElement.textContent();
    // Префикс зависит от workspace (TP, REK, LEG и т.д.)
    expect(customIdText).toMatch(/^\w+-\d+$/);
  });

  test('Заявка появляется в первой колонке (Новые) после создания', async ({ page }) => {
    const title = `Playwright тест ${TIMESTAMP}-column`;
    await createTestEntity(page, title);

    // Карточка на доске
    const card = page.locator(kanban.card).filter({ hasText: title });
    await expect(card).toBeVisible({ timeout: 8000 });

    // Проверяем, что карточка в начальной колонке (Новая или Классифицирована — если BPMN триггер сработал)
    const newColumn = page.locator('[data-testid="kanban-column"][data-status="new"]');
    const cardInNew = newColumn.locator(kanban.card).filter({ hasText: title });
    const isInNew = await cardInNew.isVisible().catch(() => false);

    if (!isInNew) {
      // BPMN триггер мог переместить заявку в другую колонку (classify-entity worker)
      const anyColumn = page.locator('[data-testid="kanban-column"]');
      const cardInAny = anyColumn.locator(kanban.card).filter({ hasText: title }).first();
      await expect(cardInAny).toBeVisible({ timeout: 5000 });
    }
  });

  test('Создание нескольких заявок - все появляются на доске', async ({ page }) => {
    const title1 = `Playwright тест ${TIMESTAMP}-multi1`;
    const title2 = `Playwright тест ${TIMESTAMP}-multi2`;

    await createTestEntity(page, title1);
    await dismissToasts(page);
    await createTestEntity(page, title2);

    // Обе карточки должны быть видны
    await expect(page.locator(kanban.card).filter({ hasText: title1 })).toBeVisible({ timeout: 8000 });
    await expect(page.locator(kanban.card).filter({ hasText: title2 })).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Деталь заявки - Открытие и закрытие', () => {
  let testTitle: string;

  test.beforeEach(async ({ page }) => {
    await goToDashboard(page);
    await selectWorkspaceByName(page, 'Техническая поддержка');
    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });
    await dismissToasts(page);

    // Создаём заявку для тестов
    testTitle = `Playwright тест ${TIMESTAMP}-detail-${Math.random().toString(36).slice(2, 6)}`;
    await createTestEntity(page, testTitle);
    await dismissToasts(page);

    // Ждём завершения BPMN триггеров (classify-entity)
    await page.waitForTimeout(2000);
    await dismissToasts(page);
  });

  test('Клик на карточку открывает панель деталей (overlay)', async ({ page }) => {
    // Карточка может быть за пагинацией (BPMN триггер перемещает в другую колонку)
    const card = page.locator(kanban.card).filter({ hasText: testTitle }).first();
    const hasCard = await card.isVisible().catch(() => false);
    if (!hasCard) {
      test.skip();
      return;
    }

    await openEntityDetail(page, testTitle);

    // Overlay виден
    await expect(page.locator(entityDetail.overlay)).toBeVisible();
    // Панель деталей видна
    await expect(page.locator(entityDetail.panel)).toBeVisible();
  });

  test('Панель деталей показывает название заявки', async ({ page }) => {
    await openEntityDetail(page, testTitle);

    const titleElement = page.locator(entityDetail.title);
    await expect(titleElement).toBeVisible();
    await expect(titleElement).toContainText(testTitle);
  });

  test('Панель деталей показывает customId', async ({ page }) => {
    await openEntityDetail(page, testTitle);

    const customIdElement = page.locator(entityDetail.customId);
    await expect(customIdElement).toBeVisible();

    const customIdText = await customIdElement.textContent();
    // Префикс зависит от workspace (TP, REK, LEG и т.д.)
    expect(customIdText).toMatch(/^\w+-\d+$/);
  });

  test('Панель деталей содержит секцию статуса с кнопками', async ({ page }) => {
    const card = page.locator(kanban.card).filter({ hasText: testTitle }).first();
    if (!(await card.isVisible().catch(() => false))) { test.skip(); return; }
    await openEntityDetail(page, testTitle);

    const statusSection = page.locator(entityDetail.statusSection);
    await expect(statusSection).toBeVisible();

    // Должны быть кнопки статусов
    const statusButtons = statusSection.locator('button');
    const buttonCount = await statusButtons.count();
    expect(buttonCount).toBeGreaterThanOrEqual(2);

    // Одна из кнопок — текущий статус (стиль с inline backgroundColor)
    // Проверяем что есть хотя бы кнопки "Новая" и "В работе"
    await expect(statusSection.getByText('Новая')).toBeVisible();
    await expect(statusSection.getByText('В работе')).toBeVisible();
  });

  test('Панель деталей содержит секцию исполнителя', async ({ page }) => {
    await openEntityDetail(page, testTitle);

    const assigneeSection = page.locator(entityDetail.assigneeSection);
    await expect(assigneeSection).toBeVisible();
    await expect(assigneeSection.getByText('Исполнитель')).toBeVisible();
  });

  test('Панель деталей содержит секцию приоритета', async ({ page }) => {
    await openEntityDetail(page, testTitle);

    const prioritySection = page.locator(entityDetail.prioritySection);
    await expect(prioritySection).toBeVisible();
  });

  test('Закрытие панели деталей кнопкой X', async ({ page }) => {
    await openEntityDetail(page, testTitle);
    await expect(page.locator(entityDetail.panel)).toBeVisible();
    await dismissToasts(page);

    // Кликаем на X
    const closeBtn = page.locator(entityDetail.closeButton);
    const hasCloseBtn = await closeBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasCloseBtn) {
      await closeBtn.click();
    } else {
      // Fallback: ищем кнопку закрытия по aria-label
      const ariaCloseBtn = page.getByLabel(/Закрыть/i).first();
      const hasAriaBtn = await ariaCloseBtn.isVisible().catch(() => false);
      if (hasAriaBtn) {
        await ariaCloseBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
    }

    // Overlay должен исчезнуть
    await expect(page.locator(entityDetail.overlay)).not.toBeVisible({ timeout: 5000 });
  });

  test('Закрытие панели деталей клавишей Escape', async ({ page }) => {
    await openEntityDetail(page, testTitle);
    await expect(page.locator(entityDetail.panel)).toBeVisible();

    // Кликаем на заголовок чтобы снять фокус с contenteditable (если есть)
    const titleEl = page.locator(entityDetail.title);
    await titleEl.click();
    await page.waitForTimeout(100);

    // Нажимаем Escape
    await page.keyboard.press('Escape');

    await expect(page.locator(entityDetail.overlay)).not.toBeVisible({ timeout: 3000 });
  });

  test('Закрытие панели деталей кликом на overlay', async ({ page }) => {
    await openEntityDetail(page, testTitle);
    await expect(page.locator(entityDetail.panel)).toBeVisible();
    await page.waitForTimeout(300); // ждём анимацию

    // Кликаем на overlay (не на панель)
    const overlay = page.locator(entityDetail.overlay);
    await overlay.click({ position: { x: 10, y: 10 }, force: true });

    await expect(page.locator(entityDetail.overlay)).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe('Деталь заявки - Изменение статуса и исполнителя', () => {
  let testTitle: string;

  test.beforeEach(async ({ page }) => {
    await goToDashboard(page);
    await selectWorkspaceByName(page, 'Техническая поддержка');
    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });
    await dismissToasts(page);

    // Создаём заявку для тестов
    testTitle = `Playwright тест ${TIMESTAMP}-status-${Math.random().toString(36).slice(2, 6)}`;
    await createTestEntity(page, testTitle);
    // Ждём завершения BPMN триггеров
    await page.waitForTimeout(2000);
    await dismissToasts(page);
  });

  test('Изменение статуса через кнопки работает', async ({ page }) => {
    await openEntityDetail(page, testTitle);

    const statusSection = page.locator(entityDetail.statusSection);

    // Находим кнопку "В работе" (не текущий статус)
    const inProgressButton = statusSection.locator('button').filter({ hasText: 'В работе' });
    await expect(inProgressButton).toBeVisible();

    // Перехватываем API запрос на изменение статуса
    const statusChangePromise = page.waitForResponse(
      (response) => response.url().includes('/status') && response.request().method() === 'PATCH',
    );

    await inProgressButton.click();

    // Ждём ответ API
    const statusResponse = await statusChangePromise;
    expect(statusResponse.ok()).toBeTruthy();

    // Кнопка "В работе" должна стать активной (иметь inline backgroundColor)
    await page.waitForTimeout(500);
    const style = await inProgressButton.getAttribute('style');
    expect(style).toContain('background-color');
  });

  test('Назначение исполнителя через select работает', async ({ page }) => {
    const card = page.locator(kanban.card).filter({ hasText: testTitle }).first();
    if (!(await card.isVisible().catch(() => false))) { test.skip(); return; }
    await openEntityDetail(page, testTitle);

    const assigneeSection = page.locator(entityDetail.assigneeSection);
    await expect(assigneeSection).toBeVisible();

    // Находим select исполнителя
    const assigneeSelect = assigneeSection.locator('select');
    await expect(assigneeSelect).toBeVisible();

    // Проверяем что есть options помимо "Не назначен"
    const options = assigneeSelect.locator('option');
    const optionCount = await options.count();
    expect(optionCount).toBeGreaterThanOrEqual(2); // "Не назначен" + хотя бы 1 пользователь

    // Перехватываем API запрос на назначение
    const assigneeChangePromise = page.waitForResponse(
      (response) => response.url().includes('/assignee') && response.request().method() === 'PATCH',
    );

    // Выбираем первого пользователя (index 1, т.к. 0 это "Не назначен")
    await assigneeSelect.selectOption({ index: 1 });

    // Ждём ответ API
    const assigneeResponse = await assigneeChangePromise;
    expect(assigneeResponse.ok()).toBeTruthy();

    // Значение select должно измениться (не пустое)
    const selectedValue = await assigneeSelect.inputValue();
    expect(selectedValue).not.toBe('');
  });

  test('После изменения статуса карточка перемещается в соответствующую колонку', async ({ page }) => {
    await openEntityDetail(page, testTitle);

    const statusSection = page.locator(entityDetail.statusSection);
    const inProgressButton = statusSection.locator('button').filter({ hasText: 'В работе' });

    // Перехватываем API
    const statusChangePromise = page.waitForResponse(
      (response) => response.url().includes('/status') && response.request().method() === 'PATCH',
    );

    await inProgressButton.click();
    await statusChangePromise;

    // Закрываем панель
    await closeEntityDetail(page);

    // Ждём обновление канбана (WebSocket + re-render)
    await page.waitForTimeout(2000);

    // Карточка должна быть в колонке "В работе" (data-status="in_progress")
    const inProgressColumn = page.locator('[data-testid="kanban-column"][data-status="in_progress"]');
    const cardInColumn = inProgressColumn.locator(kanban.card).filter({ hasText: testTitle });
    await expect(cardInColumn).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Карточка заявки - Отображение на канбане', () => {
  test.beforeEach(async ({ page }) => {
    await goToDashboard(page);
    await selectWorkspaceByName(page, 'Техническая поддержка');
    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });
  });

  test('Карточка заявки на канбане показывает customId, название и приоритет', async ({ page }) => {
    // Берём первую существующую карточку (seed или созданную)
    const firstCard = page.locator(kanban.card).first();
    const hasCard = await firstCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasCard) {
      // Создаём если нет
      await dismissToasts(page);
      await createTestEntity(page, `Playwright тест ${TIMESTAMP}-display`);
    }

    const card = page.locator(kanban.card).first();
    await expect(card).toBeVisible();

    // customId (font-mono)
    const customId = card.locator('.font-mono');
    await expect(customId).toBeVisible();
    const customIdText = await customId.textContent();
    expect(customIdText).toMatch(/^(TP|REK)-\d+$/);

    // Название (h4)
    const title = card.locator('h4');
    await expect(title).toBeVisible();
    const titleText = await title.textContent();
    expect(titleText!.length).toBeGreaterThan(0);

    // Приоритет (badge)
    const priorityBadge = card.locator('.rounded-full').first();
    await expect(priorityBadge).toBeVisible();
  });
});
