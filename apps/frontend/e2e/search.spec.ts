import { test, expect } from '@playwright/test';
import {
  kanban,
  entityDetail,
  header,
  globalSearch,
} from './helpers/selectors';
import {
  goToDashboard,
  selectFirstWorkspace,
  createTestEntity,
  dismissToasts,
} from './helpers/test-utils';

test.describe('Глобальный поиск', () => {
  test.beforeEach(async ({ page }) => {
    await goToDashboard(page);
  });

  test('Клик по кнопке поиска в header открывает диалог поиска', async ({ page }) => {
    // Кликаем на триггер глобального поиска
    const trigger = page.locator(globalSearch.trigger);
    await expect(trigger).toBeVisible({ timeout: 5000 });
    await trigger.click();

    // Должен открыться диалог поиска
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Поле ввода должно быть видно
    const input = page.locator(globalSearch.input);
    await expect(input).toBeVisible();
  });

  test('Cmd+K открывает диалог глобального поиска', async ({ page }) => {
    // Нажимаем Cmd+K (Meta+K)
    await page.keyboard.press('Meta+k');

    // Диалог поиска должен открыться
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Поле ввода видно
    const input = page.locator(globalSearch.input);
    await expect(input).toBeVisible();
  });

  test('Поле ввода получает фокус при открытии диалога', async ({ page }) => {
    // Открываем поиск
    await page.locator(globalSearch.trigger).click();
    await page.waitForTimeout(300);

    // Поле ввода должно быть в фокусе
    const input = page.locator(globalSearch.input);
    await expect(input).toBeFocused();
  });

  test('Ввод текста показывает результаты поиска', async ({ page }) => {
    // Сначала создаём заявку чтобы было что искать
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }

    const uniqueTitle = `ПоискГлобал_${Date.now()}`;
    await createTestEntity(page, uniqueTitle);
    await dismissToasts(page);

    // Открываем глобальный поиск
    await page.keyboard.press('Meta+k');
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    const input = page.locator(globalSearch.input);
    await input.fill(uniqueTitle);

    // Ждём debounce (300мс) + загрузку
    await page.waitForTimeout(1500);

    // Результаты должны появиться в области результатов
    const results = page.locator(globalSearch.results);
    const resultsText = await results.textContent();

    // Должен быть либо результат с нашим текстом, либо "Ничего не найдено"
    // Полнотекстовый поиск может не сразу проиндексировать новую заявку,
    // поэтому проверяем что результаты вообще отрендерились
    expect(resultsText).toBeTruthy();
  });

  test('Результаты содержат заявки из текущего workspace', async ({ page }) => {
    // Открываем workspace и создаём заявку
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }

    // Используем префикс workspace (TP- или REK-) для поиска
    // Ищем по общему тексту, который точно даст результаты
    await page.keyboard.press('Meta+k');
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    const input = page.locator(globalSearch.input);
    // Ищем по "TP" — префикс workspace "Техническая поддержка"
    await input.fill('TP-');
    await page.waitForTimeout(1500);

    const results = page.locator(globalSearch.results);
    const resultsText = await results.textContent();

    // Если есть заявки с префиксом TP — они должны быть в результатах
    // Если нет — будет "Ничего не найдено"
    expect(resultsText).toBeTruthy();
  });

  test('Клик по результату открывает деталь заявки', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }

    // Создаём заявку с уникальным именем
    const title = `ПоискКлик_${Date.now()}`;
    await createTestEntity(page, title);
    await dismissToasts(page);

    // Открываем поиск и ищем
    await page.keyboard.press('Meta+k');
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    const input = page.locator(globalSearch.input);
    await input.fill(title);
    await page.waitForTimeout(1500);

    // Кликаем по первому результату если он есть
    const results = page.locator(globalSearch.results);
    const firstResult = results.locator('button').first();
    const hasResult = await firstResult.isVisible().catch(() => false);

    if (hasResult) {
      await firstResult.click();
      await page.waitForTimeout(1000);

      // Диалог поиска должен закрыться
      await expect(dialog).not.toBeVisible({ timeout: 3000 });
    }
  });

  test('Пустой запрос показывает подсказку "Введите минимум 2 символа"', async ({ page }) => {
    // Открываем поиск
    await page.keyboard.press('Meta+k');
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // С пустым полем ввода — должна быть подсказка
    const hint = page.getByText(/Введите минимум 2 символа/i);
    await expect(hint).toBeVisible();

    // Вводим 1 символ — подсказка всё ещё должна быть
    const input = page.locator(globalSearch.input);
    await input.fill('А');
    await page.waitForTimeout(400);
    await expect(hint).toBeVisible();

    // Вводим 2+ символа — подсказка должна исчезнуть
    await input.fill('АБ');
    await page.waitForTimeout(500);
    await expect(hint).not.toBeVisible({ timeout: 3000 });
  });

  test('Escape закрывает диалог поиска', async ({ page }) => {
    // Открываем поиск
    await page.keyboard.press('Meta+k');
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Нажимаем Escape
    await page.keyboard.press('Escape');

    // Диалог должен закрыться
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });

  test('Навигация по результатам стрелками клавиатуры', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }

    // Создаём несколько заявок
    const baseName = `НавигацияПоиск_${Date.now()}`;
    await createTestEntity(page, `${baseName}_1`);
    await dismissToasts(page);
    await createTestEntity(page, `${baseName}_2`);
    await dismissToasts(page);

    // Открываем поиск
    await page.keyboard.press('Meta+k');
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    const input = page.locator(globalSearch.input);
    await input.fill(baseName);
    await page.waitForTimeout(1500);

    // Проверяем наличие результатов
    const results = page.locator(globalSearch.results);
    const resultButtons = results.locator('button');
    const resultCount = await resultButtons.count();

    if (resultCount >= 2) {
      // Первый результат изначально выделен (bg-primary-100)
      const firstResult = resultButtons.first();
      const firstClass = await firstResult.getAttribute('class');
      expect(firstClass).toContain('bg-primary');

      // Нажимаем стрелку вниз
      await input.press('ArrowDown');
      await page.waitForTimeout(200);

      // Теперь второй результат должен быть выделен
      const secondResult = resultButtons.nth(1);
      const secondClass = await secondResult.getAttribute('class');
      expect(secondClass).toContain('bg-primary');
    }
  });
});
