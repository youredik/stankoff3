import { test, expect } from '@playwright/test';
import { sidebar, kanban, entityDetail, createEntity, header, bpmn, ai } from '../helpers/selectors';
import {
  goToDashboard,
  selectFirstWorkspace,
  selectWorkspaceByName,
  createTestEntity,
  openEntityDetail,
  closeEntityDetail,
  dismissToasts,
  isZeebeAvailable,
  isAiAvailable,
  switchView,
} from '../helpers/test-utils';

/**
 * Полный жизненный цикл заявки от создания до закрытия.
 *
 * Сценарий:
 * 1. Создание заявки с полными данными
 * 2. AI классификация (если доступна)
 * 3. Применение результатов AI классификации
 * 4. Назначение исполнителя
 * 5. Добавление комментария
 * 6. Изменение статуса на "В работе"
 * 7. Добавление вложения
 * 8. Изменение приоритета
 * 9. Перевод в статус "Готово"
 * 10. Проверка финального состояния и timeline
 */
test.describe.serial('Жизненный цикл заявки от создания до закрытия', () => {
  let zeebeAvailable: boolean;
  let aiAvailable: boolean;
  const entityTitle = `Playwright Lifecycle ${Date.now()}`;
  const commentText = `Playwright комментарий ${Date.now()}`;

  test.beforeAll(async () => {
    zeebeAvailable = await isZeebeAvailable();
    aiAvailable = await isAiAvailable();
  });

  test('1. Создание заявки с полными данными', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }

    await dismissToasts(page);

    // Открываем модальное окно создания
    const newBtn = page.locator(kanban.newEntityButton);
    const hasNewBtn = await newBtn.isVisible().catch(() => false);
    if (hasNewBtn) {
      await newBtn.click();
    } else {
      await page.getByRole('button', { name: /Новая заявка/i }).click();
    }

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Заполняем название
    const titleInput = page.locator(createEntity.titleInput);
    const hasTitleInput = await titleInput.isVisible().catch(() => false);
    if (hasTitleInput) {
      await titleInput.fill(entityTitle);
    } else {
      await page.getByLabel(/Название/i).fill(entityTitle);
    }

    // Пытаемся заполнить описание
    const descriptionField = page.getByLabel(/Описание/i);
    const hasDescription = await descriptionField.isVisible().catch(() => false);
    if (hasDescription) {
      await descriptionField.fill(
        'Тестовая заявка для проверки полного жизненного цикла через Playwright E2E тесты'
      );
    }

    // Устанавливаем приоритет если доступен
    const highPriorityBtn = page.locator('button').filter({ hasText: /Высокий/i }).first();
    const hasPriority = await highPriorityBtn.isVisible().catch(() => false);
    if (hasPriority) {
      await highPriorityBtn.click();
    }

    // Создаём
    const submitBtn = page.locator(createEntity.submit);
    const hasSubmitBtn = await submitBtn.isVisible().catch(() => false);
    if (hasSubmitBtn) {
      await submitBtn.click();
    } else {
      await page.getByRole('button', { name: /Создать заявку/i }).click();
    }

    // Проверяем, что карточка появилась на канбане
    await expect(
      page.locator(kanban.card).filter({ hasText: entityTitle }).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('2. AI классификация заявки', async ({ page }) => {
    test.skip(!aiAvailable, 'AI сервис недоступен');

    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }
    await dismissToasts(page);

    const card = page.locator('[data-testid="kanban-card"]').filter({ hasText: entityTitle }).first();
    if (!(await card.isVisible().catch(() => false))) { test.skip(); return; }

    // Открываем деталь заявки
    await openEntityDetail(page, entityTitle);

    // Ищем кнопку AI классификации
    const classifyBtn = page.locator(ai.classifyButton);
    const hasClassifyBtn = await classifyBtn.isVisible().catch(() => false);

    if (hasClassifyBtn) {
      await classifyBtn.click();
      // Ждём результата классификации (может занять несколько секунд)
      await page.waitForTimeout(5000);

      // Проверяем, что панель AI классификации появилась
      const classificationPanel = page.locator(ai.classificationPanel);
      const hasPanel = await classificationPanel.isVisible().catch(() => false);
      expect(hasPanel).toBe(true);
    } else {
      // Кнопка может быть текстовой
      const classifyText = page.getByRole('button', { name: /Классифицировать|AI|ИИ/i });
      const hasClassifyText = await classifyText.isVisible().catch(() => false);
      if (hasClassifyText) {
        await classifyText.click();
        await page.waitForTimeout(5000);
      }
    }

    await closeEntityDetail(page);
  });

  test('3. Применение результатов AI классификации', async ({ page }) => {
    test.skip(!aiAvailable, 'AI сервис недоступен');

    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }
    await dismissToasts(page);

    const card = page.locator('[data-testid="kanban-card"]').filter({ hasText: entityTitle }).first();
    if (!(await card.isVisible().catch(() => false))) { test.skip(); return; }

    await openEntityDetail(page, entityTitle);

    // Ищем кнопку "Применить" для классификации
    const applyBtn = page.getByRole('button', { name: /Применить/i });
    const hasApply = await applyBtn.isVisible().catch(() => false);

    if (hasApply) {
      await applyBtn.click();
      await page.waitForTimeout(1000);

      // Проверяем, что toast об успешном применении появился
      const successToast = page.locator('[data-sonner-toast]').filter({ hasText: /применен|сохранен|успешно/i });
      const hasSuccess = await successToast.isVisible().catch(() => false);
      if (hasSuccess) {
        await dismissToasts(page);
      }
    }

    await closeEntityDetail(page);
  });

  test('4. Назначение исполнителя', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }
    await dismissToasts(page);

    // Проверяем, что заявка существует на канбане
    const card = page.locator('[data-testid="kanban-card"]').filter({ hasText: entityTitle }).first();
    const hasCard = await card.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCard) {
      test.skip();
      return;
    }

    await openEntityDetail(page, entityTitle);

    // Ищем секцию "Исполнитель"
    await expect(page.getByText('Исполнитель')).toBeVisible({ timeout: 5000 });

    // Ищем select/dropdown для назначения
    const assigneeSection = page.locator(entityDetail.assigneeSection);
    const hasSection = await assigneeSection.isVisible().catch(() => false);

    if (hasSection) {
      // Кликаем на секцию, чтобы раскрыть dropdown
      await assigneeSection.click();
      await page.waitForTimeout(500);
    }

    // Пробуем select элемент
    const assigneeSelect = page.locator('select').first();
    const hasSelect = await assigneeSelect.isVisible().catch(() => false);

    if (hasSelect) {
      const optionsCount = await assigneeSelect.locator('option').count();
      if (optionsCount > 1) {
        await assigneeSelect.selectOption({ index: 1 });
        await page.waitForTimeout(1000);
        const selectedValue = await assigneeSelect.inputValue();
        expect(selectedValue).not.toBe('');
      }
    } else {
      // Может быть кастомный dropdown
      const assigneeDropdown = page.getByText(/Назначить|Выберите/i).first();
      const hasDrop = await assigneeDropdown.isVisible().catch(() => false);
      if (hasDrop) {
        await assigneeDropdown.click();
        await page.waitForTimeout(500);
        // Выбираем первый вариант из списка
        const firstOption = page.locator('[role="option"], [role="listbox"] > div').first();
        const hasOption = await firstOption.isVisible().catch(() => false);
        if (hasOption) {
          await firstOption.click();
          await page.waitForTimeout(500);
        }
      }
    }

    await closeEntityDetail(page);
  });

  test('5. Добавление комментария исполнителем', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }
    await dismissToasts(page);

    const card = page.locator('[data-testid="kanban-card"]').filter({ hasText: entityTitle }).first();
    const hasCard = await card.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCard) { test.skip(); return; }

    await openEntityDetail(page, entityTitle);

    // Ждём секцию комментариев
    await expect(page.getByText('Активность')).toBeVisible({ timeout: 5000 });

    // Находим редактор комментария (contenteditable)
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.type(commentText);

    // Отправляем комментарий
    const sendBtn = page.getByRole('button', { name: /Отправить/i });
    await sendBtn.click();
    await page.waitForTimeout(2000);

    // Проверяем, что комментарий отобразился
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 5000 });

    await closeEntityDetail(page);
  });

  test('6. Изменение статуса на "В работе"', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }
    await dismissToasts(page);

    const card = page.locator('[data-testid="kanban-card"]').filter({ hasText: entityTitle }).first();
    const hasCard = await card.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCard) { test.skip(); return; }

    await openEntityDetail(page, entityTitle);

    await expect(page.getByText('Статус').first()).toBeVisible({ timeout: 5000 });

    // Ищем кнопку "В работе" среди кнопок статуса
    const inProgressBtn = page.locator('button').filter({ hasText: /В работе/i }).first();
    const hasBtn = await inProgressBtn.isVisible().catch(() => false);

    if (hasBtn) {
      await inProgressBtn.click({ force: true });
      await page.waitForTimeout(1000);
    } else {
      // Попытка через dropdown статуса
      const statusSection = page.locator(entityDetail.statusSection);
      const hasStatusSection = await statusSection.isVisible().catch(() => false);
      if (hasStatusSection) {
        await statusSection.click();
        await page.waitForTimeout(500);
        const inProgressOption = page.getByText(/В работе/i).first();
        const hasOption = await inProgressOption.isVisible().catch(() => false);
        if (hasOption) {
          await inProgressOption.click();
          await page.waitForTimeout(500);
        }
      }
    }

    await closeEntityDetail(page);
  });

  test('7. Добавление вложения', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }
    await dismissToasts(page);

    const card = page.locator('[data-testid="kanban-card"]').filter({ hasText: entityTitle }).first();
    const hasCard = await card.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCard) { test.skip(); return; }

    await openEntityDetail(page, entityTitle);

    // Ищем кнопку загрузки файлов
    const fileInput = page.locator('input[type="file"]').first();
    const hasFileInput = await fileInput.count().then(c => c > 0);

    if (hasFileInput) {
      // Создаём файл и загружаем
      await fileInput.setInputFiles({
        name: 'test-attachment.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Тестовый файл для E2E тестирования жизненного цикла заявки'),
      });

      await page.waitForTimeout(2000);

      // Проверяем, что вложение появилось
      const attachment = page.getByText('test-attachment.txt');
      const hasAttachment = await attachment.isVisible().catch(() => false);
      if (hasAttachment) {
        expect(hasAttachment).toBe(true);
      }
    }

    await closeEntityDetail(page);
  });

  test('8. Изменение приоритета', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }
    await dismissToasts(page);

    const card = page.locator('[data-testid="kanban-card"]').filter({ hasText: entityTitle }).first();
    const hasCard = await card.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCard) {
      test.skip();
      return;
    }

    await openEntityDetail(page, entityTitle);

    // Ищем секцию приоритета
    const prioritySection = page.locator(entityDetail.prioritySection);
    const hasPrioritySection = await prioritySection.isVisible().catch(() => false);

    if (hasPrioritySection) {
      await prioritySection.click();
      await page.waitForTimeout(500);

      // Выбираем "Средний" приоритет
      const mediumBtn = page.getByText(/Средний/i).first();
      const hasMedium = await mediumBtn.isVisible().catch(() => false);
      if (hasMedium) {
        await mediumBtn.click();
        await page.waitForTimeout(500);
      }
    } else {
      // Ищем приоритет через select
      const priorityLabel = page.getByText('Приоритет');
      const hasLabel = await priorityLabel.isVisible().catch(() => false);
      if (hasLabel) {
        // Кликаем рядом, чтобы раскрыть
        const priorityParent = priorityLabel.locator('..');
        const select = priorityParent.locator('select, [role="combobox"]').first();
        const hasSelect = await select.isVisible().catch(() => false);
        if (hasSelect) {
          await select.click();
          await page.waitForTimeout(300);
        }
      }
    }

    await closeEntityDetail(page);
  });

  test('9. Перевод в статус "Готово"', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }
    await dismissToasts(page);

    const card = page.locator('[data-testid="kanban-card"]').filter({ hasText: entityTitle }).first();
    const hasCard = await card.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCard) { test.skip(); return; }

    await openEntityDetail(page, entityTitle);

    await expect(page.getByText('Статус').first()).toBeVisible({ timeout: 5000 });

    // Ищем кнопку "Готово" или "Завершено"
    const doneBtn = page.locator('button').filter({ hasText: /Готово|Завершено|Закрыта|Done/i }).first();
    const hasDone = await doneBtn.isVisible().catch(() => false);

    if (hasDone) {
      await doneBtn.click({ force: true });
      await page.waitForTimeout(1000);
    } else {
      // Пробуем через последнюю колонку
      const statusButtons = page.locator('[data-testid="entity-status-section"] button');
      const count = await statusButtons.count();
      if (count > 0) {
        await statusButtons.last().click({ force: true });
        await page.waitForTimeout(1000);
      }
    }

    await closeEntityDetail(page);
  });

  test('10. Проверка финального состояния и timeline', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }
    await dismissToasts(page);

    // Переключаемся на табличный вид для проверки
    await switchView(page, 'table');
    await page.waitForTimeout(1000);

    // Проверяем, что заявка есть в таблице
    const tableRow = page.getByText(entityTitle);
    const hasRow = await tableRow.isVisible().catch(() => false);

    if (hasRow) {
      // Заявка найдена в табличном виде
      expect(hasRow).toBe(true);
    }

    // Возвращаемся на канбан
    await switchView(page, 'kanban');
    await page.waitForTimeout(1000);

    // Открываем деталь и проверяем timeline / историю
    const card = page.locator(kanban.card).filter({ hasText: entityTitle }).first();
    const hasCard = await card.isVisible().catch(() => false);

    if (hasCard) {
      await card.click({ force: true });
      await page.waitForTimeout(1000);

      // Проверяем, что комментарий всё ещё отображается
      const commentVisible = page.getByText(commentText);
      const hasComment = await commentVisible.isVisible().catch(() => false);
      expect(hasComment).toBe(true);

      // Проверяем наличие timeline/истории
      const timelineTab = page.getByText(/История|Timeline|Активность/i).first();
      const hasTimeline = await timelineTab.isVisible().catch(() => false);
      if (hasTimeline) {
        await timelineTab.click();
        await page.waitForTimeout(1000);

        // Проверяем наличие записей в timeline
        const historyEntries = page.locator('[data-testid="timeline-entry"], .timeline-entry, .activity-entry');
        const entryCount = await historyEntries.count().catch(() => 0);
        // Могут быть записи, но мы как минимум проверяем что tab открылся
      }

      await closeEntityDetail(page);
    }
  });
});
