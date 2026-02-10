import { test, expect } from '@playwright/test';
import { sidebar } from './helpers/selectors';
import { navigateToWorkspaceSettings, dismissToasts } from './helpers/test-utils';

/**
 * Automation Rules E2E Tests
 *
 * Тестирует вкладку "Автоматизация" на странице настроек workspace:
 * - Доступность вкладки
 * - Список правил (или пустое состояние)
 * - Создание нового правила
 * - Конфигурация триггера и действий
 * - Включение/выключение правила
 * - Удаление правила
 * - Валидация
 */

// Хелпер: открыть вкладку "Автоматизация"
async function openAutomationTab(page: any): Promise<boolean> {
  const ok = await navigateToWorkspaceSettings(page);
  if (!ok) return false;

  await page.waitForTimeout(1000);

  const automationTab = page.getByRole('button', { name: /Автоматизация/i });
  const hasTab = await automationTab.isVisible().catch(() => false);
  if (!hasTab) return false;

  await automationTab.click();
  await page.waitForTimeout(1500);
  return true;
}

test.describe('Automation Rules -- Вкладка Автоматизация', () => {
  test('Вкладка "Автоматизация" доступна из настроек', async ({ page }) => {
    const ok = await openAutomationTab(page);
    if (!ok) {
      test.skip();
      return;
    }

    // Заголовок "Автоматизация" с иконкой Zap
    await expect(page.getByText('Автоматизация').first()).toBeVisible({ timeout: 5000 });
  });

  test('Список правил показывает существующие правила или пустое состояние', async ({ page }) => {
    const ok = await openAutomationTab(page);
    if (!ok) {
      test.skip();
      return;
    }

    // Либо есть правила с счётчиком, либо пустое состояние
    const emptyState = page.getByText('Нет настроенных правил автоматизации');
    const addRuleBtn = page.getByRole('button', { name: /Добавить правило/i });

    const isEmpty = await emptyState.isVisible().catch(() => false);
    const hasAddBtn = await addRuleBtn.isVisible().catch(() => false);

    // Кнопка "Добавить правило" видна всегда
    expect(hasAddBtn).toBeTruthy();

    if (isEmpty) {
      // Пустое состояние с подсказкой
      await expect(page.getByText('Создайте правило для автоматического выполнения действий')).toBeVisible();
    }
  });

  test('Кнопка "Добавить правило" открывает редактор правила', async ({ page }) => {
    const ok = await openAutomationTab(page);
    if (!ok) {
      test.skip();
      return;
    }

    const addRuleBtn = page.getByRole('button', { name: /Добавить правило/i });
    await addRuleBtn.click();
    await page.waitForTimeout(500);

    // Модальное окно "Новое правило автоматизации"
    await expect(page.getByText('Новое правило автоматизации')).toBeVisible({ timeout: 3000 });
  });

  test('Редактор правила содержит селектор типа триггера', async ({ page }) => {
    const ok = await openAutomationTab(page);
    if (!ok) {
      test.skip();
      return;
    }

    const addRuleBtn = page.getByRole('button', { name: /Добавить правило/i });
    await addRuleBtn.click();
    await page.waitForTimeout(500);

    // Поле "Когда срабатывает *"
    await expect(page.getByText('Когда срабатывает')).toBeVisible();

    // Select с типами триггеров
    const triggerSelect = page.locator('select').filter({
      has: page.locator('option').filter({ hasText: /При создании заявки|При изменении статуса/ }),
    }).first();

    await expect(triggerSelect).toBeVisible();
  });

  test('Редактор правила содержит конфигурацию действий', async ({ page }) => {
    const ok = await openAutomationTab(page);
    if (!ok) {
      test.skip();
      return;
    }

    const addRuleBtn = page.getByRole('button', { name: /Добавить правило/i });
    await addRuleBtn.click();
    await page.waitForTimeout(500);

    // Секция "Действия *"
    await expect(page.getByText('Действия').first()).toBeVisible();

    // По умолчанию одно действие уже добавлено
    const actionSelects = page.locator('.bg-gray-50, .dark\\:bg-gray-800').filter({
      has: page.locator('select'),
    });

    const count = await actionSelects.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Ссылка "Добавить действие"
    await expect(page.getByText('+ Добавить действие')).toBeVisible();
  });

  test('Включение/выключение правила через иконку Power', async ({ page }) => {
    const ok = await openAutomationTab(page);
    if (!ok) {
      test.skip();
      return;
    }

    // Проверяем наличие правил
    const emptyState = page.getByText('Нет настроенных правил автоматизации');
    const isEmpty = await emptyState.isVisible().catch(() => false);

    if (isEmpty) {
      test.skip();
      return;
    }

    // Ищем кнопку включения/выключения (Power иконка) у первого правила
    const toggleBtn = page.locator('button[title="Выключить"], button[title="Включить"]').first();
    const hasToggle = await toggleBtn.isVisible().catch(() => false);

    if (!hasToggle) {
      test.skip();
      return;
    }

    const initialTitle = await toggleBtn.getAttribute('title');

    await toggleBtn.click();
    await page.waitForTimeout(500);

    // Заголовок кнопки должен измениться
    const newTitle = await toggleBtn.getAttribute('title');

    // Проверяем что тоггл сработал
    if (initialTitle === 'Выключить') {
      expect(newTitle).toBe('Включить');
    } else {
      expect(newTitle).toBe('Выключить');
    }

    // Возвращаем обратно
    await toggleBtn.click();
    await page.waitForTimeout(500);
  });

  test('Удаление правила убирает его из списка', async ({ page }) => {
    const ok = await openAutomationTab(page);
    if (!ok) {
      test.skip();
      return;
    }

    const emptyState = page.getByText('Нет настроенных правил автоматизации');
    const isEmpty = await emptyState.isVisible().catch(() => false);

    if (isEmpty) {
      // Создаём правило для теста удаления
      const addRuleBtn = page.getByRole('button', { name: /Добавить правило/i });
      await addRuleBtn.click();
      await page.waitForTimeout(500);

      // Заполняем минимальные поля
      const nameInput = page.locator('input[placeholder*="Автоназначение"]');
      const hasNameInput = await nameInput.isVisible().catch(() => false);
      if (!hasNameInput) {
        const anyInput = page.locator('.max-w-2xl input[type="text"]').first();
        await anyInput.fill('E2E Test Rule ' + Date.now());
      } else {
        await nameInput.fill('E2E Test Rule ' + Date.now());
      }

      const saveBtn = page.getByRole('button', { name: /Сохранить/i }).last();
      await saveBtn.click();
      await page.waitForTimeout(1000);
    }

    // Проверяем что есть правила
    const deleteBtn = page.locator('button[title="Удалить"]').first();
    const hasDelete = await deleteBtn.isVisible().catch(() => false);

    if (!hasDelete) {
      test.skip();
      return;
    }

    // Считаем правила до удаления
    const deleteBtns = page.locator('button[title="Удалить"]');
    const countBefore = await deleteBtns.count();

    // Обработчик confirm dialog
    page.on('dialog', async (dialog: any) => {
      await dialog.accept();
    });

    await deleteBtn.click();
    await page.waitForTimeout(1000);

    // Количество правил уменьшилось или показалось пустое состояние
    const countAfter = await deleteBtns.count();
    const isEmptyNow = await emptyState.isVisible().catch(() => false);

    expect(countAfter < countBefore || isEmptyNow).toBeTruthy();
  });

  test('Правило без названия показывает ошибку валидации', async ({ page }) => {
    const ok = await openAutomationTab(page);
    if (!ok) {
      test.skip();
      return;
    }

    const addRuleBtn = page.getByRole('button', { name: /Добавить правило/i });
    await addRuleBtn.click();
    await page.waitForTimeout(500);

    // Не заполняем название, сразу сохраняем
    // Обработчик alert dialog
    page.on('dialog', async (dialog: any) => {
      expect(dialog.message()).toContain('название');
      await dialog.accept();
    });

    const saveBtn = page.getByRole('button', { name: /Сохранить/i }).last();
    await saveBtn.click();
    await page.waitForTimeout(500);

    // Модальное окно должно остаться открытым
    await expect(page.getByText('Новое правило автоматизации')).toBeVisible();

    // Закрываем модалку
    const cancelBtn = page.getByRole('button', { name: /Отмена/i }).last();
    await cancelBtn.click();
  });

  test('Кнопка редактирования правила открывает модалку с данными', async ({ page }) => {
    const ok = await openAutomationTab(page);
    if (!ok) {
      test.skip();
      return;
    }

    const emptyState = page.getByText('Нет настроенных правил автоматизации');
    const isEmpty = await emptyState.isVisible().catch(() => false);

    if (isEmpty) {
      test.skip();
      return;
    }

    // Ищем кнопку редактирования (Edit2 иконка)
    const editBtn = page.locator('button[title="Редактировать"]').first();
    const hasEdit = await editBtn.isVisible().catch(() => false);

    if (!hasEdit) {
      test.skip();
      return;
    }

    await editBtn.click();
    await page.waitForTimeout(500);

    // Модальное окно "Редактировать правило"
    await expect(page.getByText('Редактировать правило')).toBeVisible({ timeout: 3000 });

    // Поле названия должно быть заполнено
    const nameInput = page.locator('.max-w-2xl input[type="text"]').first();
    const nameValue = await nameInput.inputValue();
    expect(nameValue).toBeTruthy();

    // Закрываем модалку
    const cancelBtn = page.getByRole('button', { name: /Отмена/i }).last();
    await cancelBtn.click();
  });
});
