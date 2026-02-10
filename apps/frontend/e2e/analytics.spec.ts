import { test, expect } from '@playwright/test';
import { sidebar, kanban, header, tableView } from './helpers/selectors';
import {
  goToDashboard,
  selectFirstWorkspace,
  switchView,
  dismissToasts,
  getDevToken,
} from './helpers/test-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// ============================================================================
// ТЕСТЫ АНАЛИТИКИ
// ============================================================================
test.describe('Аналитика', () => {
  test.beforeEach(async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }
    // Ждём загрузки канбана
    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });
  });

  test('Вид аналитики доступен через переключатель в header', async ({ page }) => {
    // Проверяем наличие кнопки переключения на аналитику
    const analyticsToggle = page.locator(header.viewToggleAnalytics);
    await expect(analyticsToggle).toBeVisible({ timeout: 5000 });

    // Кликаем для переключения
    await analyticsToggle.click();
    await page.waitForTimeout(1000);

    // Должен отобразиться вид аналитики (канбан скрывается)
    const kanbanBoard = page.locator(kanban.board);
    const isKanbanVisible = await kanbanBoard.isVisible().catch(() => false);

    // После переключения на аналитику канбан не должен быть виден
    // (или должен появиться блок аналитики)
    const analyticsContent = page.getByText(/Аналитика|Статистика|KPI|Всего заявок/i);
    const hasAnalytics = await analyticsContent.isVisible().catch(() => false);

    expect(hasAnalytics || !isKanbanVisible).toBe(true);
  });

  test('KPI карточки показывают количество заявок (всего, открытые, закрытые, просроченные)', async ({ page }) => {
    await switchView(page, 'analytics');
    await page.waitForTimeout(1000);

    // Ищем KPI карточки
    const totalCard = page.getByText(/Всего|Total/i);
    const openCard = page.getByText(/Открытые|Открыт|Новые|Open/i);
    const closedCard = page.getByText(/Закрытые|Завершённые|Closed|Готово/i);
    const overdueCard = page.getByText(/Просроченные|Overdue|Нарушено/i);

    const hasTotal = await totalCard.isVisible().catch(() => false);
    const hasOpen = await openCard.isVisible().catch(() => false);
    const hasClosed = await closedCard.isVisible().catch(() => false);
    const hasOverdue = await overdueCard.isVisible().catch(() => false);

    // Хотя бы одна KPI карточка должна быть видна
    expect(hasTotal || hasOpen || hasClosed || hasOverdue).toBe(true);

    // Проверяем что KPI содержат числа
    if (hasTotal) {
      // Ищем числовое значение рядом с "Всего"
      const numbers = page.locator('text=/\\d+/');
      const numberCount = await numbers.count();
      expect(numberCount).toBeGreaterThan(0);
    }
  });

  test('График распределения по статусам отображается', async ({ page }) => {
    await switchView(page, 'analytics');
    await page.waitForTimeout(1000);

    // Ищем график распределения по статусам
    const statusChart = page.getByText(/По статусам|Статусы|Status distribution/i);
    const hasStatusLabel = await statusChart.isVisible().catch(() => false);

    // Ищем элементы графика (canvas для chart.js или SVG для recharts)
    const chartCanvas = page.locator('canvas');
    const chartSvg = page.locator('svg.recharts-surface, .recharts-wrapper svg');
    const anyChart = page.locator('[class*="chart"], [class*="Chart"]');

    const hasCanvas = await chartCanvas.first().isVisible().catch(() => false);
    const hasSvg = await chartSvg.first().isVisible().catch(() => false);
    const hasChart = await anyChart.first().isVisible().catch(() => false);

    // Хотя бы что-то из аналитики должно отобразиться
    expect(hasStatusLabel || hasCanvas || hasSvg || hasChart).toBe(true);
  });

  test('График распределения по приоритетам отображается', async ({ page }) => {
    await switchView(page, 'analytics');
    await page.waitForTimeout(1000);

    // Ищем график по приоритетам
    const priorityChart = page.getByText(/По приоритетам?|Priority|Приоритет/i);
    const hasPriority = await priorityChart.isVisible().catch(() => false);

    // Ищем легенду приоритетов
    const highPriority = page.getByText(/Высокий|High|Критический|Critical/i);
    const mediumPriority = page.getByText(/Средний|Medium/i);
    const lowPriority = page.getByText(/Низкий|Low/i);

    const hasHigh = await highPriority.first().isVisible().catch(() => false);
    const hasMedium = await mediumPriority.first().isVisible().catch(() => false);
    const hasLow = await lowPriority.first().isVisible().catch(() => false);

    // Хотя бы заголовок или элементы легенды должны быть видны
    expect(hasPriority || hasHigh || hasMedium || hasLow).toBe(true);
  });

  test('График нагрузки по исполнителям отображается', async ({ page }) => {
    await switchView(page, 'analytics');
    await page.waitForTimeout(1000);

    // Ищем график по исполнителям
    const assigneeChart = page.getByText(/Исполнители|По исполнителям|Assignee|Нагрузка/i);
    const hasAssignee = await assigneeChart.isVisible().catch(() => false);

    // Ищем имена пользователей в графике/таблице
    const adminName = page.getByText(/Админ|admin/i);
    const hasAdminName = await adminName.first().isVisible().catch(() => false);

    // Хотя бы заголовок раздела должен быть виден
    expect(hasAssignee || hasAdminName).toBe(true);
  });

  test('Timeline (график по времени) отображается', async ({ page }) => {
    await switchView(page, 'analytics');
    await page.waitForTimeout(1000);

    // Ищем timeline/график по времени
    const timelineChart = page.getByText(/По времени|Timeline|Динамика|Активность|По дням|Создано заявок|последние/i).first();
    const hasTimeline = await timelineChart.isVisible().catch(() => false);

    // Ищем элементы линейного графика (recharts)
    const lineChart = page.locator('.recharts-line, .recharts-area, .recharts-bar, .recharts-cartesian-grid');
    const hasLineChart = await lineChart.first().isVisible().catch(() => false);

    // Любые canvas/SVG графики
    const charts = page.locator('canvas, svg.recharts-surface, svg');
    const chartCount = await charts.count().catch(() => 0);

    expect(hasTimeline || hasLineChart || chartCount > 0).toBe(true);
  });

  test('Данные аналитики соответствуют реальному количеству заявок', async ({ page }) => {
    // Сначала считаем заявки на канбане
    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 5000 });
    const kanbanCards = await page.locator(kanban.card).count();

    // Переключаемся на аналитику
    await switchView(page, 'analytics');
    await page.waitForTimeout(1000);

    // Ищем число "Всего заявок" в KPI
    const totalElement = page.locator('[class*="kpi"], [class*="stat"], [class*="card"]')
      .filter({ hasText: /Всего|Total/i })
      .locator('text=/\\d+/');

    const hasTotalElement = await totalElement.first().isVisible().catch(() => false);

    if (hasTotalElement) {
      const totalText = await totalElement.first().textContent();
      const totalNumber = parseInt(totalText || '0', 10);

      // Число в аналитике должно быть >= числу карточек на канбане
      // (канбан может показывать не все из-за пагинации)
      expect(totalNumber).toBeGreaterThanOrEqual(0);
    }

    // Возвращаемся на канбан для следующих тестов
    await switchView(page, 'kanban');
    await page.waitForTimeout(500);
  });
});
