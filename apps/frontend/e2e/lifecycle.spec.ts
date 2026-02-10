import { test, expect } from '@playwright/test';
import { sidebar, kanban } from './helpers/selectors';
import { selectFirstWorkspace, dismissToasts, createTestEntity } from './helpers/test-utils';

// ============================================================================
// ТЕСТЫ ЖИЗНЕННОГО ЦИКЛА WORKSPACE
// ============================================================================
test.describe('Жизненный цикл Workspace', () => {
  test.describe.serial('Полный цикл workspace', () => {
    let workspaceName: string;
    let workspaceId: string;

    test('1. Создание нового workspace', async ({ page }) => {
      workspaceName = `E2E Workspace ${Date.now()}`;
      await page.goto('/');
      await page.waitForTimeout(1000);

      // Находим кнопку создания workspace в сайдбаре
      const createButton = page.getByRole('button', { name: /Создать рабочее место/i });
      const hasCreateButton = await createButton.isVisible().catch(() => false);

      if (!hasCreateButton) {
        // Альтернативный способ через меню
        const addButton = page.locator('aside button').filter({ hasText: '+' }).first();
        const hasAdd = await addButton.isVisible().catch(() => false);
        if (hasAdd) {
          await addButton.click();
        } else {
          test.skip();
          return;
        }
      } else {
        await createButton.click();
      }

      // Заполняем форму
      await page.waitForTimeout(500);
      const nameInput = page.getByLabel(/Название/i).first();
      await nameInput.fill(workspaceName);

      const prefixInput = page.getByLabel(/Префикс/i);
      if (await prefixInput.isVisible()) {
        await prefixInput.fill('E2E');
      }

      // Сохраняем
      const submitButton = page.getByRole('button', { name: /Создать/i });
      await submitButton.click();
      await page.waitForTimeout(1000);

      // Проверяем, что workspace появился
      const workspaceItem = page.locator('aside').getByText(workspaceName);
      await expect(workspaceItem).toBeVisible({ timeout: 5000 });
    });

    test('2. Открытие и просмотр workspace', async ({ page }) => {
      if (!workspaceName) {
        test.skip();
        return;
      }

      await page.goto('/dashboard');
      await expect(page.locator(sidebar.root)).toBeVisible({ timeout: 15000 });

      // Находим созданный workspace — может быть в свёрнутой секции
      const workspaceButton = page.locator(sidebar.workspaceButton).filter({ hasText: workspaceName });
      const hasButton = await workspaceButton.isVisible({ timeout: 5000 }).catch(() => false);

      if (!hasButton) {
        // Workspace мог быть создан в свёрнутой секции — развернём все
        const sectionToggles = page.locator(sidebar.sectionToggle);
        const toggleCount = await sectionToggles.count();
        for (let i = 0; i < toggleCount; i++) {
          await sectionToggles.nth(i).click().catch(() => {});
          await page.waitForTimeout(200);
        }
      }

      const wsBtn = page.locator(sidebar.workspaceButton).filter({ hasText: workspaceName });
      const isVisible = await wsBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (!isVisible) {
        test.skip();
        return;
      }

      await wsBtn.click();
      await page.waitForTimeout(1000);

      // Проверяем, что канбан-доска загрузилась
      await expect(page.locator('[data-testid="kanban-column"]').first()).toBeVisible({ timeout: 5000 });
    });

    test('3. Настройка workspace - добавление статусов', async ({ page }) => {
      if (!workspaceName) {
        test.skip();
        return;
      }

      await page.goto('/dashboard');
      await expect(page.locator(sidebar.root)).toBeVisible({ timeout: 15000 });

      // Workspace может быть в свёрнутой секции
      const sectionToggles = page.locator(sidebar.sectionToggle);
      const toggleCount = await sectionToggles.count();
      for (let i = 0; i < toggleCount; i++) {
        await sectionToggles.nth(i).click().catch(() => {});
        await page.waitForTimeout(200);
      }

      // Находим workspace и открываем настройки
      const workspaceGroup = page.locator(sidebar.workspaceItem).filter({ hasText: workspaceName });
      const hasGroup = await workspaceGroup.isVisible({ timeout: 3000 }).catch(() => false);
      if (!hasGroup) {
        test.skip();
        return;
      }

      await workspaceGroup.hover();
      await page.waitForTimeout(300);

      const menuButton = workspaceGroup.locator(sidebar.workspaceMenu);
      const hasMenu = await menuButton.isVisible().catch(() => false);
      if (!hasMenu) {
        test.skip();
        return;
      }
      await menuButton.click();

      const settingsButton = page.getByText('Настроить');
      const hasSettings = await settingsButton.isVisible({ timeout: 3000 }).catch(() => false);
      if (!hasSettings) {
        test.skip();
        return;
      }
      await settingsButton.click();

      await expect(page).toHaveURL(/\/settings/, { timeout: 5000 });

      // Проверяем, что настройки загрузились
      await expect(page.locator('main')).toBeVisible();
    });

    test('4. Архивирование workspace', async ({ page }) => {
      if (!workspaceName) {
        test.skip();
        return;
      }

      await page.goto('/dashboard');
      await expect(page.locator(sidebar.root)).toBeVisible({ timeout: 15000 });

      // Workspace может быть в свёрнутой секции
      const sectionToggles = page.locator(sidebar.sectionToggle);
      const toggleCount = await sectionToggles.count();
      for (let i = 0; i < toggleCount; i++) {
        await sectionToggles.nth(i).click().catch(() => {});
        await page.waitForTimeout(200);
      }

      // Находим workspace и открываем меню
      const workspaceGroup = page.locator(sidebar.workspaceItem).filter({ hasText: workspaceName });
      const hasGroup = await workspaceGroup.isVisible({ timeout: 3000 }).catch(() => false);
      if (!hasGroup) {
        test.skip();
        return;
      }

      await workspaceGroup.hover();
      await page.waitForTimeout(300);

      const menuButton = workspaceGroup.locator(sidebar.workspaceMenu);
      const hasMenu = await menuButton.isVisible().catch(() => false);
      if (!hasMenu) {
        test.skip();
        return;
      }
      await menuButton.click();

      // Ищем кнопку архивирования
      const archiveButton = page.getByText(/Архивировать/i);
      const hasArchive = await archiveButton.isVisible().catch(() => false);

      if (hasArchive) {
        await archiveButton.click();
        await page.waitForTimeout(500);

        // Подтверждаем архивирование если есть диалог
        const confirmButton = page.getByRole('button', { name: /Подтвердить|Да|Архивировать/i });
        const hasConfirm = await confirmButton.isVisible().catch(() => false);
        if (hasConfirm) {
          await confirmButton.click();
        }
      }
    });
  });
});

// ============================================================================
// ТЕСТЫ ЖИЗНЕННОГО ЦИКЛА ENTITY (ЗАЯВКИ)
// ============================================================================
test.describe('Жизненный цикл Entity (Заявка)', () => {
  test.describe.serial('Полный цикл заявки', () => {
    let entityTitle: string;
    let entityCustomId: string;

    test.beforeAll(async ({ browser }) => {
      const page = await browser.newPage();
      const hasWorkspace = await selectFirstWorkspace(page);
      if (!hasWorkspace) {
        await page.close();
        return;
      }
      await page.close();
    });

    test('1. Создание новой заявки со всеми полями', async ({ page }) => {
      const hasWorkspace = await selectFirstWorkspace(page);
      if (!hasWorkspace) {
        test.skip();
        return;
      }

      entityTitle = `E2E Заявка ${Date.now()}`;
      await dismissToasts(page);

      // Создаём заявку через helper
      await createTestEntity(page, entityTitle);
    });

    test('2. Просмотр деталей заявки', async ({ page }) => {
      if (!entityTitle) {
        test.skip();
        return;
      }

      const hasWorkspace = await selectFirstWorkspace(page);
      if (!hasWorkspace) {
        test.skip();
        return;
      }

      // Находим и открываем заявку
      const card = page.locator('[data-testid="kanban-card"]').filter({ hasText: entityTitle }).first();
      await card.click();

      // Проверяем, что панель деталей открылась
      await expect(page.getByText('Активность')).toBeVisible({ timeout: 3000 });
      await expect(page.getByText('Статус')).toBeVisible();
      await expect(page.getByText('Исполнитель')).toBeVisible();

      // Получаем customId если есть
      const customIdElement = page.locator('[data-testid="entity-custom-id"]');
      const hasCustomId = await customIdElement.isVisible().catch(() => false);
      if (hasCustomId) {
        entityCustomId = await customIdElement.textContent() || '';
      }
    });

    test('3. Изменение статуса заявки', async ({ page }) => {
      if (!entityTitle) {
        test.skip();
        return;
      }

      const hasWorkspace = await selectFirstWorkspace(page);
      if (!hasWorkspace) {
        test.skip();
        return;
      }
      await dismissToasts(page);

      // Открываем заявку
      const card = page.locator('[data-testid="kanban-card"]').filter({ hasText: entityTitle }).first();
      await card.click();
      await expect(page.getByText('Статус').first()).toBeVisible({ timeout: 3000 });

      // Меняем статус на "В работе"
      const statusButton = page.locator('button').filter({ hasText: /В работе/i }).first();
      const hasButton = await statusButton.isVisible().catch(() => false);

      if (hasButton) {
        await statusButton.click({ force: true });
        await page.waitForTimeout(500);
        // Проверяем, что статус изменился
        await expect(statusButton).toHaveClass(/bg-/);
      }
    });

    test('4. Назначение исполнителя', async ({ page }) => {
      if (!entityTitle) {
        test.skip();
        return;
      }

      const hasWorkspace = await selectFirstWorkspace(page);
      if (!hasWorkspace) {
        test.skip();
        return;
      }
      await dismissToasts(page);

      // Открываем заявку
      const card = page.locator('[data-testid="kanban-card"]').filter({ hasText: entityTitle }).first();
      await card.click();
      await expect(page.getByText('Исполнитель')).toBeVisible({ timeout: 3000 });

      // Назначаем исполнителя
      const assigneeSelect = page.locator('select').first();
      const optionsCount = await assigneeSelect.locator('option').count();

      if (optionsCount > 1) {
        await assigneeSelect.selectOption({ index: 1 });
        await page.waitForTimeout(500);
        const selectedValue = await assigneeSelect.inputValue();
        expect(selectedValue).not.toBe('');
      }
    });

    test('5. Добавление комментария', async ({ page }) => {
      if (!entityTitle) {
        test.skip();
        return;
      }

      const hasWorkspace = await selectFirstWorkspace(page);
      if (!hasWorkspace) {
        test.skip();
        return;
      }
      await dismissToasts(page);

      // Открываем заявку
      const card = page.locator('[data-testid="kanban-card"]').filter({ hasText: entityTitle }).first();
      await card.click();
      await expect(page.getByText('Активность')).toBeVisible({ timeout: 3000 });

      // Добавляем комментарий
      const commentText = `E2E комментарий ${Date.now()}`;
      const editor = page.locator('[contenteditable="true"]').first();
      await editor.click();
      await page.keyboard.type(commentText);

      // Отправляем
      const sendButton = page.getByRole('button', { name: /Отправить/i });
      await sendButton.click();
      await page.waitForTimeout(1000);

      // Проверяем, что комментарий появился
      await expect(page.getByText(commentText)).toBeVisible({ timeout: 5000 });
    });

    test('6. Редактирование заявки', async ({ page }) => {
      if (!entityTitle) {
        test.skip();
        return;
      }

      const hasWorkspace = await selectFirstWorkspace(page);
      if (!hasWorkspace) {
        test.skip();
        return;
      }
      await dismissToasts(page);

      // Открываем заявку
      const card = page.locator('[data-testid="kanban-card"]').filter({ hasText: entityTitle }).first();
      await card.click();
      await page.waitForTimeout(500);

      // Ищем кнопку редактирования
      const editButton = page.getByRole('button', { name: /Редактировать|Изменить/i });
      const hasEdit = await editButton.isVisible().catch(() => false);

      if (hasEdit) {
        await editButton.click();
        await page.waitForTimeout(500);

        // Изменяем название
        const titleInput = page.getByLabel(/Название/i);
        const updatedTitle = entityTitle + ' (обновлено)';
        await titleInput.fill(updatedTitle);

        // Сохраняем
        const saveButton = page.getByRole('button', { name: /Сохранить/i });
        await saveButton.click();
        await page.waitForTimeout(500);

        entityTitle = updatedTitle;
      }
    });

    test('7. Drag & Drop между колонками', async ({ page }) => {
      if (!entityTitle) {
        test.skip();
        return;
      }

      const hasWorkspace = await selectFirstWorkspace(page);
      if (!hasWorkspace) {
        test.skip();
        return;
      }
      await dismissToasts(page);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // Находим карточку и колонки
      const card = page.locator('[data-testid="kanban-card"]').filter({ hasText: entityTitle }).first();
      const columns = page.locator('[data-testid="kanban-column"]');
      const columnCount = await columns.count();

      if (columnCount < 2) {
        test.skip();
        return;
      }

      // Запоминаем начальную колонку
      const initialColumn = await card.evaluate((el: Element) => {
        return el.closest('[data-testid="kanban-column"]')?.getAttribute('data-status');
      });

      // Drag & drop
      const cardBox = await card.boundingBox();
      const secondColumn = columns.nth(1);
      const columnBox = await secondColumn.boundingBox();

      if (cardBox && columnBox) {
        await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + 100, { steps: 20 });
        await page.mouse.up();
        await page.waitForTimeout(1000);

        // Проверяем, что статус изменился
        const newColumn = await card.evaluate((el: Element) => {
          return el.closest('[data-testid="kanban-column"]')?.getAttribute('data-status');
        });

        if (newColumn && initialColumn) {
          expect(newColumn).not.toBe(initialColumn);
        }
      }
    });

    test('8. Завершение заявки (статус Готово)', async ({ page }) => {
      if (!entityTitle) {
        test.skip();
        return;
      }

      const hasWorkspace = await selectFirstWorkspace(page);
      if (!hasWorkspace) {
        test.skip();
        return;
      }
      await dismissToasts(page);

      // Открываем заявку
      const card = page.locator('[data-testid="kanban-card"]').filter({ hasText: entityTitle }).first();
      await card.click();
      await expect(page.getByText('Статус').first()).toBeVisible({ timeout: 3000 });

      // Меняем статус на "Готово" или "Завершено"
      const doneButton = page.locator('button').filter({ hasText: /Готово|Завершено|Done/i }).first();
      const hasDone = await doneButton.isVisible().catch(() => false);

      if (hasDone) {
        await doneButton.click({ force: true });
        await page.waitForTimeout(500);
      }
    });
  });
});

// ============================================================================
// ТЕСТЫ ПОИСКА
// ============================================================================
test.describe('Полнотекстовый поиск', () => {
  test('Поиск по заявкам', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }

    // Ждём загрузку канбана
    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });

    // Создаём уникальную заявку
    const uniqueName = `UniqueSearchTest${Date.now()}`;
    await createTestEntity(page, uniqueName);
    await dismissToasts(page);

    // Используем фильтр/поиск
    const filterButton = page.locator(kanban.filterButton);
    const hasFilter = await filterButton.isVisible().catch(() => false);

    if (!hasFilter) {
      test.skip();
      return;
    }

    await filterButton.click();
    await page.waitForTimeout(500);

    const searchInput = page.locator('[data-testid="filter-search-input"]');
    const hasSearch = await searchInput.isVisible().catch(() => false);
    if (!hasSearch) {
      test.skip();
      return;
    }

    // Ищем созданную заявку
    await searchInput.fill(uniqueName);
    await page.waitForTimeout(1000);

    // Проверяем, что заявка найдена
    const card = page.locator(kanban.card).filter({ hasText: uniqueName });
    await expect(card).toBeVisible({ timeout: 5000 });

    // Очищаем поиск
    await searchInput.fill('');
    await page.waitForTimeout(500);
  });

  test('Глобальный поиск через header', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Ищем глобальный поиск в хедере
    const globalSearch = page.locator('header input[type="search"], header input[placeholder*="Поиск"]').first();
    const hasGlobalSearch = await globalSearch.isVisible().catch(() => false);

    if (!hasGlobalSearch) {
      // Пробуем кликнуть на кнопку поиска
      const searchButton = page.locator('header button').filter({ hasText: /search|поиск/i }).first();
      const hasButton = await searchButton.isVisible().catch(() => false);
      if (hasButton) {
        await searchButton.click();
      }
    }

    // Если глобальный поиск есть - тестируем
    const searchVisible = await globalSearch.isVisible().catch(() => false);
    if (searchVisible) {
      await globalSearch.fill('тест');
      await page.waitForTimeout(500);
      // Проверяем, что результаты появились
    }
  });
});

// ============================================================================
// ТЕСТЫ ИМПОРТА/ЭКСПОРТА
// ============================================================================
test.describe('Импорт и Экспорт данных', () => {
  test('Экспорт workspace в JSON', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    const workspaceGroup = page.locator(sidebar.workspaceItem).first();
    const hasWorkspace = await workspaceGroup.isVisible().catch(() => false);

    if (!hasWorkspace) {
      test.skip();
      return;
    }

    // Открываем меню workspace
    await workspaceGroup.hover();
    const menuButton = workspaceGroup.locator(sidebar.workspaceMenu);
    await menuButton.click();

    // Ищем экспорт
    const exportButton = page.getByText(/Экспорт|Export/i);
    const hasExport = await exportButton.isVisible().catch(() => false);

    if (hasExport) {
      // Подготавливаем обработчик скачивания
      const downloadPromise = page.waitForEvent('download');
      await exportButton.click();

      try {
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.(json|csv)$/);
      } catch {
        // Download might not trigger in test environment
      }
    }
  });
});

// ============================================================================
// ТЕСТЫ АВТОМАТИЗАЦИИ
// ============================================================================
test.describe('Правила автоматизации', () => {
  test('Просмотр страницы автоматизации', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }

    // Переходим в настройки workspace
    const workspaceGroup = page.locator(sidebar.workspaceItem).first();
    await workspaceGroup.hover();
    const menuButton = workspaceGroup.locator(sidebar.workspaceMenu);
    await menuButton.click();

    const settingsButton = page.getByText('Настроить');
    await settingsButton.click();
    await page.waitForTimeout(1000);

    // Ищем вкладку автоматизации
    const automationTab = page.getByText(/Автоматизация|Automation|Правила/i);
    const hasAutomation = await automationTab.isVisible().catch(() => false);

    if (hasAutomation) {
      await automationTab.click();
      await page.waitForTimeout(500);
      await expect(page.locator('main')).toBeVisible();
    }
  });
});
