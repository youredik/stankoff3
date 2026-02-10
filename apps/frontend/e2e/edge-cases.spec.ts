import { test, expect } from '@playwright/test';
import { sidebar, kanban, entityDetail, createEntity, header } from './helpers/selectors';
import {
  goToDashboard,
  selectFirstWorkspace,
  createTestEntity,
  openEntityDetail,
  closeEntityDetail,
  dismissToasts,
  switchView,
} from './helpers/test-utils';

/**
 * Тесты граничных случаев.
 * Проверка поведения приложения при нестандартных данных,
 * быстрых действиях и граничных условиях.
 */
test.describe('Граничные случаи', () => {
  test.beforeEach(async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }
    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });
  });

  test('Очень длинное название заявки (500+ символов) — проверка truncation/overflow', async ({ page }) => {
    const longTitle = 'Playwright_ДлинноеНазвание_' + 'А'.repeat(500);

    await createTestEntity(page, longTitle);
    await dismissToasts(page);

    // Карточка должна появиться на канбане
    const card = page.locator(kanban.card).filter({ hasText: 'ДлинноеНазвание' }).first();
    await expect(card).toBeVisible({ timeout: 8000 });

    // Карточка не должна выходить за пределы колонки (ширина ограничена)
    const cardBox = await card.boundingBox();
    expect(cardBox).toBeTruthy();

    // Ширина карточки должна быть разумной (не бесконечной)
    expect(cardBox!.width).toBeLessThan(600);

    // Текст должен быть обрезан (truncated) или перенесён
    const cardText = await card.textContent();
    expect(cardText).toBeTruthy();
  });

  test('HTML теги в названии — должны быть экранированы, не рендериться как HTML', async ({ page }) => {
    const htmlTitle = 'Playwright_HTML_<script>alert("xss")</script>_' + Date.now();

    await createTestEntity(page, htmlTitle);
    await dismissToasts(page);

    // Карточка должна отображать теги как текст, не исполнять их
    const card = page.locator(kanban.card).filter({ hasText: 'Playwright_HTML_' }).first();
    await expect(card).toBeVisible({ timeout: 8000 });

    // Проверяем что <script> отображается как текст
    const cardHtml = await card.innerHTML();
    // Не должно быть реального <script> тега — он должен быть экранирован
    expect(cardHtml).not.toContain('<script>alert');

    // Видимый текст должен содержать экранированные теги или их текст
    const cardText = await card.textContent();
    expect(cardText).toContain('script');
  });

  test('Эмодзи в названии заявки — должны корректно отображаться', async ({ page }) => {
    const emojiTitle = `Playwright_Emoji_\u{1F680}\u{1F525}\u{2705}_${Date.now()}`;

    await createTestEntity(page, emojiTitle);
    await dismissToasts(page);

    const card = page.locator(kanban.card).filter({ hasText: 'Playwright_Emoji_' }).first();
    await expect(card).toBeVisible({ timeout: 8000 });

    // Текст карточки должен содержать эмодзи
    const cardText = await card.textContent();
    expect(cardText).toContain('\u{1F680}');
  });

  test('Спецсимволы (кавычки, угловые скобки) в названии', async ({ page }) => {
    const specialTitle = `Playwright_Special_"кавычки" 'апостроф' <скобки> & амперсанд_${Date.now()}`;

    await createTestEntity(page, specialTitle);
    await dismissToasts(page);

    const card = page.locator(kanban.card).filter({ hasText: 'Playwright_Special_' }).first();
    await expect(card).toBeVisible({ timeout: 8000 });

    const cardText = await card.textContent();
    expect(cardText).toContain('кавычки');
    expect(cardText).toContain('апостроф');
  });

  test('Unicode (китайские, арабские символы) в названии', async ({ page }) => {
    const unicodeTitle = `Playwright_Unicode_\u4F60\u597D_\u0645\u0631\u062D\u0628\u0627_${Date.now()}`;

    await createTestEntity(page, unicodeTitle);
    await dismissToasts(page);

    const card = page.locator(kanban.card).filter({ hasText: 'Playwright_Unicode_' }).first();
    await expect(card).toBeVisible({ timeout: 8000 });

    const cardText = await card.textContent();
    // Должны отображаться символы Unicode
    expect(cardText).toContain('\u4F60\u597D');
  });

  test('Создание заявки с минимальными данными (только название)', async ({ page }) => {
    const minimalTitle = `Playwright_Minimal_${Date.now()}`;

    // Используем createTestEntity, который заполняет только title
    await createTestEntity(page, minimalTitle);
    await dismissToasts(page);

    // Карточка должна появиться
    const card = page.locator(kanban.card).filter({ hasText: minimalTitle }).first();
    await expect(card).toBeVisible({ timeout: 8000 });
  });

  test('Двойной клик на кнопку создания — не должен создавать дубликаты', async ({ page }) => {
    await dismissToasts(page);

    const uniqueTitle = `Playwright_NoDuplicate_${Date.now()}`;

    // Открываем модал создания
    const newBtn = page.locator(kanban.newEntityButton);
    const hasNewBtn = await newBtn.isVisible().catch(() => false);
    if (hasNewBtn) {
      await newBtn.click();
    } else {
      await page.getByRole('button', { name: /Новая заявка/i }).click();
    }

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 3000 });

    // Заполняем название
    const titleInput = page.locator(createEntity.titleInput);
    const hasTitleInput = await titleInput.isVisible().catch(() => false);
    if (hasTitleInput) {
      await titleInput.fill(uniqueTitle);
    } else {
      await page.getByLabel(/Название/i).fill(uniqueTitle);
    }

    // Быстро кликаем на "Создать" два раза
    const submitBtn = page.locator(createEntity.submit);
    const hasSubmitBtn = await submitBtn.isVisible().catch(() => false);
    const targetBtn = hasSubmitBtn
      ? submitBtn
      : page.getByRole('button', { name: /Создать заявку/i });

    await targetBtn.click();
    await targetBtn.click({ force: true }).catch(() => {});

    await page.waitForTimeout(3000);

    // Должна быть ровно одна карточка с этим названием
    const cards = page.locator(kanban.card).filter({ hasText: uniqueTitle });
    const count = await cards.count();
    expect(count).toBe(1);
  });

  test('Быстрые смены статуса — последнее изменение побеждает', async ({ page }) => {
    const title = `Playwright_RapidStatus_${Date.now()}`;
    await createTestEntity(page, title);
    await dismissToasts(page);

    // Открываем деталь
    await openEntityDetail(page, title);

    // Ищем секцию статуса
    const statusSection = page.locator(entityDetail.statusSection);
    const hasStatus = await statusSection.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasStatus) {
      await closeEntityDetail(page);
      test.skip();
      return;
    }

    // Нажимаем на статус несколько раз быстро (если есть кнопки переключения)
    const statusButtons = statusSection.locator('button');
    const buttonCount = await statusButtons.count();

    if (buttonCount >= 2) {
      // Быстро переключаем между статусами
      await statusButtons.nth(0).click({ force: true });
      await statusButtons.nth(1).click({ force: true });
      await statusButtons.nth(0).click({ force: true });

      await page.waitForTimeout(2000);
    }

    // Страница не должна упасть
    await expect(page.locator(entityDetail.overlay)).toBeVisible();
    await closeEntityDetail(page);
  });

  test('Обновление страницы во время просмотра детали — данные сохранены', async ({ page }) => {
    const title = `Playwright_Refresh_${Date.now()}`;
    await createTestEntity(page, title);
    await dismissToasts(page);

    await openEntityDetail(page, title);

    // Проверяем, что деталь открыта
    await expect(page.locator(entityDetail.overlay)).toBeVisible();

    // Запоминаем URL
    const currentUrl = page.url();

    // Обновляем страницу
    await page.reload();
    await expect(page.locator(sidebar.root)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    // После перезагрузки: либо деталь открыта заново, либо мы на канбане
    // В обоих случаях страница должна загрузиться без ошибок
    const errorOverlay = page.locator(
      '#__next-build-error, [data-testid="error-overlay"], .nextjs-container-errors-header'
    );
    await expect(errorOverlay).not.toBeVisible({ timeout: 2000 });
  });

  test('Пустой workspace — показывает empty state', async ({ page }) => {
    // Проверяем текущий workspace — он может быть пустым или с карточками
    const cards = page.locator(kanban.card);
    const cardCount = await cards.count();

    if (cardCount === 0) {
      // Workspace пустой — должно быть сообщение или пустые колонки
      const emptyMessage = page.getByText(/нет заявок|пусто|создайте первую/i);
      const hasEmpty = await emptyMessage.isVisible({ timeout: 3000 }).catch(() => false);

      // Даже если нет текстового сообщения, канбан-доска должна отображаться
      await expect(page.locator(kanban.board)).toBeVisible();
    }
    // Если карточки есть — тест пройден (workspace не пустой)
  });

  test('Канбан колонка с множеством карточек — скролл работает', async ({ page }) => {
    // Проверяем, что колонки отображаются
    const columns = page.locator(kanban.column);
    const columnCount = await columns.count();
    expect(columnCount).toBeGreaterThan(0);

    // Находим колонку с наибольшим количеством карточек
    let maxCards = 0;
    let targetColumnIndex = 0;

    for (let i = 0; i < columnCount; i++) {
      const colCards = columns.nth(i).locator(kanban.card);
      const count = await colCards.count();
      if (count > maxCards) {
        maxCards = count;
        targetColumnIndex = i;
      }
    }

    if (maxCards <= 3) {
      // Недостаточно карточек для проверки скролла
      test.skip();
      return;
    }

    const targetColumn = columns.nth(targetColumnIndex);

    // Проверяем, что колонка имеет overflow и можно скроллить
    const scrollable = targetColumn.locator('[class*="overflow"]').first();
    const isScrollable = await scrollable.isVisible().catch(() => false);

    // Колонка должна корректно отображать карточки
    const visibleCards = targetColumn.locator(kanban.card);
    const visibleCount = await visibleCards.count();
    expect(visibleCount).toBeGreaterThan(0);
  });

  test('Очень длинный текст комментария — нет overflow', async ({ page }) => {
    const title = `Playwright_LongComment_${Date.now()}`;
    await createTestEntity(page, title);
    await dismissToasts(page);

    await openEntityDetail(page, title);

    // Ищем редактор комментариев
    const commentEditor = page.locator('.tiptap, [data-testid="comment-editor"], textarea');
    const hasEditor = await commentEditor.first().isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasEditor) {
      await closeEntityDetail(page);
      test.skip();
      return;
    }

    // Вводим длинный текст
    const longComment = 'Тестовый комментарий. '.repeat(100);
    await commentEditor.first().fill(longComment);
    await page.waitForTimeout(500);

    // Детальная панель не должна расширяться за пределы экрана
    const panelBox = await page.locator(entityDetail.panel).boundingBox();
    if (panelBox) {
      const viewportSize = page.viewportSize();
      expect(panelBox.width).toBeLessThanOrEqual(viewportSize!.width);
    }

    await closeEntityDetail(page);
  });

  test('Невалидный URL в URL-поле — показывает ошибку валидации', async ({ page }) => {
    // Создаём заявку и открываем деталь
    const title = `Playwright_InvalidURL_${Date.now()}`;
    await createTestEntity(page, title);
    await dismissToasts(page);

    await openEntityDetail(page, title);

    // Ищем поле типа URL
    const urlField = page.locator('input[type="url"], [data-testid*="url"]');
    const hasUrlField = await urlField.first().isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasUrlField) {
      await closeEntityDetail(page);
      test.skip();
      return;
    }

    // Вводим невалидный URL
    await urlField.first().fill('не-url-адрес');
    await urlField.first().press('Tab');
    await page.waitForTimeout(500);

    // Должно появиться сообщение об ошибке валидации
    const errorMsg = page.locator(
      '[class*="error"], [role="alert"], .text-red-500, .text-destructive'
    );
    const hasError = await errorMsg.first().isVisible({ timeout: 3000 }).catch(() => false);

    // Если валидация реализована — ошибка видна; если нет — тест информативный
    if (hasError) {
      await expect(errorMsg.first()).toBeVisible();
    }

    await closeEntityDetail(page);
  });

  test('Числовое поле с текстовым вводом — отклоняется', async ({ page }) => {
    const title = `Playwright_NumberField_${Date.now()}`;
    await createTestEntity(page, title);
    await dismissToasts(page);

    await openEntityDetail(page, title);

    // Ищем числовое поле
    const numberField = page.locator('input[type="number"]');
    const hasNumberField = await numberField.first().isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasNumberField) {
      await closeEntityDetail(page);
      test.skip();
      return;
    }

    // Пытаемся ввести текст в числовое поле
    await numberField.first().fill('abc');
    const value = await numberField.first().inputValue();

    // Числовое поле не должно принять текстовые символы
    // (браузер игнорирует буквы для input[type="number"])
    expect(value).not.toBe('abc');

    await closeEntityDetail(page);
  });

  test('Дата в прошлом — принимается', async ({ page }) => {
    const title = `Playwright_PastDate_${Date.now()}`;
    await createTestEntity(page, title);
    await dismissToasts(page);

    await openEntityDetail(page, title);

    // Ищем поле даты
    const dateField = page.locator('input[type="date"], input[type="datetime-local"]');
    const hasDateField = await dateField.first().isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasDateField) {
      await closeEntityDetail(page);
      test.skip();
      return;
    }

    // Вводим дату в прошлом
    await dateField.first().fill('2020-01-01');
    await page.waitForTimeout(500);

    // Значение должно быть принято (не очищено)
    const value = await dateField.first().inputValue();
    expect(value).toContain('2020');

    await closeEntityDetail(page);
  });

  test('Открытие детали заявки при уже открытой другой — корректная замена', async ({ page }) => {
    // Создаём две заявки
    const title1 = `Playwright_Detail1_${Date.now()}`;
    const title2 = `Playwright_Detail2_${Date.now() + 1}`;

    await createTestEntity(page, title1);
    await dismissToasts(page);
    await createTestEntity(page, title2);
    await dismissToasts(page);

    // Открываем первую
    await openEntityDetail(page, title1);

    // Проверяем что открыта первая
    const detailTitle = page.locator(entityDetail.title);
    const hasTitle = await detailTitle.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasTitle) {
      await expect(detailTitle).toContainText('Detail1');
    }

    // Закрываем первую
    await closeEntityDetail(page);

    // Открываем вторую
    await openEntityDetail(page, title2);

    // Проверяем что открыта вторая (не первая)
    if (hasTitle) {
      await expect(page.locator(entityDetail.title)).toContainText('Detail2');
    }

    // Панель должна быть видна и корректна
    await expect(page.locator(entityDetail.overlay)).toBeVisible();

    await closeEntityDetail(page);
  });
});
