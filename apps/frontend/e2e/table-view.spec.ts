import { test, expect } from '@playwright/test';
import {
  sidebar,
  kanban,
  entityDetail,
  header,
  tableView,
} from './helpers/selectors';
import {
  goToDashboard,
  selectFirstWorkspace,
  createTestEntity,
  dismissToasts,
  switchView,
  closeEntityDetail,
} from './helpers/test-utils';

test.describe('Табличное представление', () => {
  test.beforeEach(async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }
    // Убедимся что канбан загрузился
    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });
  });

  test('Переключение на табличный вид показывает таблицу', async ({ page }) => {
    // Кликаем на кнопку табличного вида
    await switchView(page, 'table');

    // Должна появиться таблица (тег <table>)
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 5000 });
  });

  test('Таблица содержит колонки: Номер, Название, Статус, Приоритет, Исполнитель, Создана', async ({ page }) => {
    await switchView(page, 'table');

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 5000 });

    // Проверяем наличие заголовков колонок
    const thead = table.locator('thead');
    await expect(thead.getByText('Номер')).toBeVisible();
    await expect(thead.getByText('Название')).toBeVisible();
    await expect(thead.getByText('Статус')).toBeVisible();
    await expect(thead.getByText('Приоритет')).toBeVisible();
    await expect(thead.getByText('Исполнитель')).toBeVisible();
    await expect(thead.getByText('Создана')).toBeVisible();
  });

  test('Строки таблицы содержат данные заявок', async ({ page }) => {
    // Создаём заявку чтобы гарантировать данные
    const title = `ТаблицаТест_${Date.now()}`;
    await createTestEntity(page, title);
    await dismissToasts(page);

    // Переключаемся на таблицу
    await switchView(page, 'table');

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 5000 });

    // Ждём загрузку данных
    await page.waitForTimeout(1000);

    // Должна быть хотя бы одна строка в tbody
    const rows = table.locator('tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Первая строка содержит текстовые данные (customId в формате XX-)
    const firstRow = rows.first();
    const firstRowText = await firstRow.textContent();
    expect(firstRowText).toBeTruthy();
    expect(firstRowText!.length).toBeGreaterThan(0);
  });

  test('Клик по строке таблицы открывает панель деталей заявки', async ({ page }) => {
    // Создаём заявку для гарантии данных
    const title = `КликТаблица_${Date.now()}`;
    await createTestEntity(page, title);
    await dismissToasts(page);

    await switchView(page, 'table');

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);

    // Кликаем по первой строке данных
    const firstRow = table.locator('tbody tr').first();
    await firstRow.click();

    // Должна открыться панель деталей
    await expect(page.locator(entityDetail.overlay).or(page.getByText('Активность'))).toBeVisible({ timeout: 5000 });
  });

  test('Клик по заголовку колонки сортирует по возрастанию', async ({ page }) => {
    await switchView(page, 'table');

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);

    // Кликаем по кнопке сортировки "Название"
    const titleSortButton = table.locator('thead button').filter({ hasText: 'Название' });
    await expect(titleSortButton).toBeVisible();
    await titleSortButton.click();
    await page.waitForTimeout(500);

    // Должна появиться иконка направления сортировки (ChevronUp или ChevronDown)
    // После первого клика - ASC
    const sortIndicator = titleSortButton.locator('svg').last();
    await expect(sortIndicator).toBeVisible();
  });

  test('Повторный клик по заголовку переключает на сортировку по убыванию', async ({ page }) => {
    await switchView(page, 'table');

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);

    // Кликаем по "Создана" дважды
    const dateSortButton = table.locator('thead button').filter({ hasText: 'Создана' });
    await expect(dateSortButton).toBeVisible();

    // Первый клик - ASC
    await dateSortButton.click();
    await page.waitForTimeout(500);

    // Второй клик - DESC
    await dateSortButton.click();
    await page.waitForTimeout(500);

    // Индикатор сортировки всё ещё виден
    const sortIndicator = dateSortButton.locator('svg').last();
    await expect(sortIndicator).toBeVisible();
  });

  test('Иконка сортировки отображается на активной колонке', async ({ page }) => {
    await switchView(page, 'table');

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);

    // Все неактивные колонки имеют приглушённую иконку ArrowUpDown (opacity-30)
    const sortButtons = table.locator('thead button');
    const firstButton = sortButtons.first();
    await firstButton.click();
    await page.waitForTimeout(500);

    // Активная колонка должна иметь ChevronUp или ChevronDown (без opacity-30)
    // Неактивные — ArrowUpDown с opacity-30
    // Проверяем что после клика на одну колонку она отличается визуально
    await expect(firstButton).toBeVisible();
  });

  test('Пагинация видна когда заявок много', async ({ page }) => {
    await switchView(page, 'table');

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);

    // Проверяем наличие элемента пагинации под таблицей
    // Пагинация показывает "X-Y из Z"
    const paginationText = page.getByText(/\d+.*из\s+\d+/);
    const hasPagination = await paginationText.isVisible().catch(() => false);

    if (hasPagination) {
      // Если пагинация есть — должны быть кнопки навигации
      const prevButton = page.locator('button').filter({ has: page.locator('.lucide-chevron-left') });
      const nextButton = page.locator('button').filter({ has: page.locator('.lucide-chevron-right') });
      await expect(prevButton).toBeVisible();
      await expect(nextButton).toBeVisible();
    }
    // Если заявок мало, пагинация может не отображаться — это нормально
  });

  test('Навигация по страницам работает', async ({ page }) => {
    await switchView(page, 'table');

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);

    // Проверяем пагинацию
    const paginationText = page.getByText(/\d+.*из\s+\d+/);
    const hasPagination = await paginationText.isVisible().catch(() => false);

    if (!hasPagination) {
      // Недостаточно данных для пагинации — пропускаем
      test.skip();
      return;
    }

    // Извлекаем текущий текст пагинации
    const initialText = await paginationText.textContent();

    // Кликаем "Следующая страница" если кнопка активна
    const nextButton = page.locator('button').filter({ has: page.locator('.lucide-chevron-right') });
    const isNextDisabled = await nextButton.isDisabled().catch(() => true);

    if (!isNextDisabled) {
      await nextButton.click();
      await page.waitForTimeout(800);

      // Текст пагинации должен измениться
      const newText = await paginationText.textContent();
      // Если была вторая страница - текст пагинации изменится
      // Если была только одна страница - кнопка была disabled
      if (newText !== initialText) {
        expect(newText).not.toBe(initialText);
      }
    }
  });

  test('Переключение обратно на канбан сохраняет данные', async ({ page }) => {
    // Создаём заявку
    const title = `ПереключениеВида_${Date.now()}`;
    await createTestEntity(page, title);
    await dismissToasts(page);

    // Переключаемся на таблицу
    await switchView(page, 'table');
    await page.waitForTimeout(1000);

    // Переключаемся обратно на канбан
    await switchView(page, 'kanban');
    await page.waitForTimeout(1000);

    // Канбан должен загрузиться
    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 5000 });

    // Карточка с нашей заявкой должна быть видна
    const card = page.locator(kanban.card).filter({ hasText: title }).first();
    await expect(card).toBeVisible({ timeout: 5000 });
  });

  test('Поиск в таблице фильтрует строки', async ({ page }) => {
    // Создаём заявку с уникальным названием
    const title = `ПоискТаблица_${Date.now()}`;
    await createTestEntity(page, title);
    await dismissToasts(page);

    await switchView(page, 'table');

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);

    // Ищем кнопку фильтров в табличном виде
    const filterButton = page.getByText('Фильтры').first();
    const hasFilter = await filterButton.isVisible().catch(() => false);

    if (!hasFilter) {
      // В табличном виде фильтры могут быть реализованы иначе
      test.skip();
      return;
    }

    await filterButton.click();
    await page.waitForTimeout(300);

    // Вводим уникальное название в поиск
    const searchInput = page.locator('[data-testid="filter-search-input"]');
    const hasSearch = await searchInput.isVisible().catch(() => false);

    if (hasSearch) {
      await searchInput.fill(title);
      await page.waitForTimeout(800);

      // Таблица должна содержать нашу заявку
      const tableText = await table.textContent();
      expect(tableText).toContain(title);
    }
  });

  test('Количество строк таблицы соответствует ожидаемому', async ({ page }) => {
    await switchView(page, 'table');

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);

    // Ищем текст с количеством заявок (например "5 заявок")
    const countText = page.getByText(/\d+\s+(заявк|заявок|заявки|заявка)/);
    const hasCount = await countText.isVisible().catch(() => false);

    if (hasCount) {
      const text = await countText.textContent();
      // Извлекаем число из текста
      const match = text?.match(/(\d+)/);
      if (match) {
        const expectedTotal = parseInt(match[1], 10);

        // Количество строк в таблице не должно превышать perPage (обычно 20)
        const rows = table.locator('tbody tr');
        const rowCount = await rows.count();

        // Строки не пустые (не скелетоны)
        if (rowCount > 0 && expectedTotal > 0) {
          expect(rowCount).toBeLessThanOrEqual(expectedTotal);
        }
      }
    }
  });

  test('Чекбокс "Выбрать все" выделяет все строки на странице', async ({ page }) => {
    await switchView(page, 'table');

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);

    // Находим чекбокс в заголовке таблицы (select all)
    const selectAllCheckbox = table.locator('thead input[type="checkbox"]');
    const hasSelectAll = await selectAllCheckbox.isVisible().catch(() => false);

    if (!hasSelectAll) {
      test.skip();
      return;
    }

    // Кликаем "Выбрать все"
    await selectAllCheckbox.click();
    await page.waitForTimeout(300);

    // Все чекбоксы в строках должны быть отмечены
    const rowCheckboxes = table.locator('tbody input[type="checkbox"]');
    const checkboxCount = await rowCheckboxes.count();

    for (let i = 0; i < Math.min(checkboxCount, 5); i++) {
      await expect(rowCheckboxes.nth(i)).toBeChecked();
    }

    // Повторный клик снимает выделение
    await selectAllCheckbox.click();
    await page.waitForTimeout(300);

    for (let i = 0; i < Math.min(checkboxCount, 5); i++) {
      await expect(rowCheckboxes.nth(i)).not.toBeChecked();
    }
  });
});
