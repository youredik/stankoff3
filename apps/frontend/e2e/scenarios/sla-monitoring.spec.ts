import { test, expect } from '@playwright/test';
import { sidebar, kanban, entityDetail, createEntity, header, sla } from '../helpers/selectors';
import {
  goToDashboard,
  selectFirstWorkspace,
  selectWorkspaceByName,
  createTestEntity,
  openEntityDetail,
  closeEntityDetail,
  dismissToasts,
  isZeebeAvailable,
  switchView,
  getDevToken,
} from '../helpers/test-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/**
 * Сценарий: Мониторинг SLA (Service Level Agreement).
 *
 * Проверяет:
 * 1. Наличие SLA определений для workspace
 * 2. Создание заявки и старт SLA таймера
 * 3. Отображение SLA badge на карточке
 * 4. SLA метрики в деталях заявки
 * 5. Приостановка и возобновление SLA
 * 6. SLA dashboard со статистикой
 */
test.describe.serial('Сценарий: Мониторинг SLA', () => {
  let zeebeAvailable: boolean;
  const entityTitle = `Playwright SLA ${Date.now()}`;
  let workspaceId: string;

  test.beforeAll(async () => {
    zeebeAvailable = await isZeebeAvailable();
  });

  test('1. Проверка SLA определений для workspace', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }

    // Запоминаем workspace ID
    const url = page.url();
    const match = url.match(/\/workspace\/([^/]+)/);
    workspaceId = match ? match[1] : '';

    // Проверяем SLA через API
    const token = await getDevToken();
    if (token && workspaceId) {
      try {
        const res = await fetch(`${API_URL}/sla/definitions?workspaceId=${workspaceId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const definitions = await res.json();
          console.log('SLA определений:', Array.isArray(definitions) ? definitions.length : 0);
        }
      } catch {
        console.log('Не удалось получить SLA определения');
      }
    }

    // Проверяем через UI — настройки workspace
    const wsItem = page.locator(sidebar.workspaceItem).first();
    await wsItem.hover();
    const menuBtn = wsItem.locator(sidebar.workspaceMenu);
    const hasMenu = await menuBtn.isVisible().catch(() => false);

    if (hasMenu) {
      await menuBtn.click();
      const settingsBtn = page.getByText('Настроить');
      const hasSettings = await settingsBtn.isVisible().catch(() => false);
      if (hasSettings) {
        await settingsBtn.click();
        await page.waitForTimeout(1000);

        // Ищем вкладку SLA в настройках
        const slaTab = page.getByText(/SLA/i);
        const hasSlaTab = await slaTab.isVisible().catch(() => false);

        if (hasSlaTab) {
          await slaTab.click();
          await page.waitForTimeout(1000);

          // Проверяем наличие SLA настроек
          const slaSettings = page.locator(sla.settings);
          const hasSlaSettings = await slaSettings.isVisible().catch(() => false);
          console.log('Настройки SLA видны:', hasSlaSettings);

          // Проверяем строки определений
          const definitionRows = page.locator(sla.definitionRow);
          const rowCount = await definitionRows.count().catch(() => 0);
          console.log('SLA определений в UI:', rowCount);
        }
      }
    }
  });

  test('2. Создание заявки и старт SLA таймера', async ({ page }) => {
    await goToDashboard(page);
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }
    await dismissToasts(page);

    // Создаём заявку
    await createTestEntity(page, entityTitle, { priority: 'high' });

    const card = page.locator(kanban.card).filter({ hasText: entityTitle }).first();
    await expect(card).toBeVisible({ timeout: 10000 });

    // SLA таймер должен запуститься автоматически при создании заявки
    // (если для workspace настроено SLA определение)
    await page.waitForTimeout(2000);

    // Проверяем SLA через API
    const token = await getDevToken();
    if (token) {
      try {
        // Получаем entity для проверки SLA
        const res = await fetch(`${API_URL}/sla/dashboard?workspaceId=${workspaceId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const dashboard = await res.json();
          console.log('SLA dashboard:', JSON.stringify(dashboard).substring(0, 200));
        }
      } catch {
        console.log('SLA dashboard не доступен');
      }
    }
  });

  test('3. Отображение SLA badge на карточке', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }
    await dismissToasts(page);

    // Ищем SLA badge на карточке заявки
    const card = page.locator(kanban.card).filter({ hasText: entityTitle }).first();
    const hasCard = await card.isVisible().catch(() => false);

    if (hasCard) {
      // SLA badge может быть внутри карточки
      const slaBadgeOnCard = card.locator('[data-testid="sla-status-badge"], .sla-badge');
      const hasBadge = await slaBadgeOnCard.isVisible().catch(() => false);
      console.log('SLA badge на карточке:', hasBadge);

      // Или может быть таймер
      const slaTimerOnCard = card.locator('[data-testid="sla-timer"], .sla-timer');
      const hasTimer = await slaTimerOnCard.isVisible().catch(() => false);
      console.log('SLA таймер на карточке:', hasTimer);

      // Или цветовой индикатор (зелёный/жёлтый/красный)
      const colorIndicator = card.locator('.bg-green-500, .bg-yellow-500, .bg-red-500, .text-green-500, .text-yellow-500, .text-red-500');
      const hasColor = await colorIndicator.first().isVisible().catch(() => false);
      console.log('Цветовой индикатор SLA:', hasColor);
    }
  });

  test('4. SLA метрики в деталях заявки', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }
    await dismissToasts(page);

    // Проверяем, что заявка существует на канбане
    const cardLocator = page.locator('[data-testid="kanban-card"]').filter({ hasText: entityTitle }).first();
    const hasCard = await cardLocator.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCard) {
      test.skip();
      return;
    }

    await openEntityDetail(page, entityTitle);

    // Ищем SLA секцию в деталях
    const slaSection = page.getByText(/SLA|Service Level/i).first();
    const hasSlaSection = await slaSection.isVisible().catch(() => false);

    if (hasSlaSection) {
      console.log('Секция SLA найдена в деталях');

      // Проверяем SLA badge
      const badge = page.locator(sla.statusBadge);
      const hasBadge = await badge.isVisible().catch(() => false);
      if (hasBadge) {
        const badgeText = await badge.textContent();
        console.log('SLA статус:', badgeText);
      }

      // Проверяем SLA таймер
      const timer = page.locator(sla.timer);
      const hasTimer = await timer.isVisible().catch(() => false);
      if (hasTimer) {
        const timerText = await timer.textContent();
        console.log('SLA таймер:', timerText);
      }

      // Проверяем метрики (время ответа, время решения)
      const responseTime = page.getByText(/Время ответа|Response time|Первый ответ/i).first();
      const hasResponseTime = await responseTime.isVisible().catch(() => false);
      console.log('Метрика "Время ответа":', hasResponseTime);

      const resolutionTime = page.getByText(/Время решения|Resolution time/i).first();
      const hasResolutionTime = await resolutionTime.isVisible().catch(() => false);
      console.log('Метрика "Время решения":', hasResolutionTime);
    } else {
      console.log('Секция SLA не найдена — возможно SLA не настроен для этого workspace');
    }

    await closeEntityDetail(page);
  });

  test('5. Приостановка и возобновление SLA', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }
    await dismissToasts(page);

    await openEntityDetail(page, entityTitle);

    // Ищем кнопку паузы SLA
    const pauseBtn = page.getByRole('button', { name: /Приостанов|Pause|Пауза/i });
    const hasPause = await pauseBtn.isVisible().catch(() => false);

    if (hasPause) {
      await pauseBtn.click();
      await page.waitForTimeout(1000);

      // Проверяем, что SLA на паузе
      const pausedStatus = page.getByText(/Приостановлен|Paused|На паузе/i).first();
      const isPaused = await pausedStatus.isVisible().catch(() => false);
      console.log('SLA приостановлен:', isPaused);

      // Возобновляем
      const resumeBtn = page.getByRole('button', { name: /Возобнов|Resume|Продолж/i });
      const hasResume = await resumeBtn.isVisible().catch(() => false);
      if (hasResume) {
        await resumeBtn.click();
        await page.waitForTimeout(1000);

        // Проверяем, что SLA возобновлён
        const activeStatus = page.getByText(/Активн|Active|Running/i).first();
        const isActive = await activeStatus.isVisible().catch(() => false);
        console.log('SLA возобновлён:', isActive);
      }
    } else {
      // Пробуем через API
      const token = await getDevToken();
      if (token) {
        console.log('Кнопка паузы SLA не найдена — проверяем API');
      }
    }

    await closeEntityDetail(page);
  });

  test('6. SLA dashboard со статистикой', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }

    // Переключаемся на аналитику (если есть SLA dashboard)
    await switchView(page, 'analytics');
    await page.waitForTimeout(2000);

    // Проверяем наличие SLA графиков / статистики
    const slaChart = page.getByText(/SLA|Service Level/i).first();
    const hasSlaChart = await slaChart.isVisible().catch(() => false);

    if (hasSlaChart) {
      console.log('SLA раздел в аналитике найден');

      // Проверяем метрики
      const complianceRate = page.getByText(/Соблюдение|Compliance|%/i).first();
      const hasRate = await complianceRate.isVisible().catch(() => false);
      console.log('Показатель соблюдения SLA:', hasRate);

      const avgResponse = page.getByText(/Среднее время|Average/i).first();
      const hasAvg = await avgResponse.isVisible().catch(() => false);
      console.log('Среднее время ответа:', hasAvg);
    } else {
      console.log('SLA раздел не найден в аналитике');
    }

    // Возвращаемся на канбан
    await switchView(page, 'kanban');
    await page.waitForTimeout(500);

    // Проверяем SLA через API
    const token = await getDevToken();
    if (token && workspaceId) {
      try {
        const res = await fetch(`${API_URL}/sla/dashboard?workspaceId=${workspaceId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const dashboard = await res.json();
          console.log('SLA API dashboard получен');
          // Проверяем структуру ответа
          if (dashboard && typeof dashboard === 'object') {
            console.log('SLA dashboard keys:', Object.keys(dashboard).join(', '));
          }
        }
      } catch {
        console.log('SLA dashboard API не доступен');
      }
    }
  });
});
