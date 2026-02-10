import { test, expect } from '@playwright/test';
import { sidebar, header, kanban } from './helpers/selectors';

test.describe('Smoke тесты', () => {
  test('Главная страница загружается', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Stankoff/i);
  });

  test('Sidebar отображается', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(sidebar.root)).toBeVisible();
  });

  test('Кнопка создания рабочего места видна (для админа)', async ({ page }) => {
    await page.goto('/');
    // Кнопка с data-testid — более надёжный селектор
    await expect(page.locator(sidebar.createWorkspace)).toBeVisible();
  });

  test('Header отображается', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(header.root)).toBeVisible();
  });
});

test.describe('Workspace', () => {
  test('Показывает список workspaces', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(sidebar.root)).toBeVisible();

    // Ждём загрузки данных
    await page.waitForTimeout(2000);

    // Либо есть сообщение о пустоте, либо есть рабочие места
    const emptyMessage = page.getByText('Нет рабочих мест');
    const workspaceItems = page.locator(sidebar.workspaceItem);

    const isEmpty = await emptyMessage.isVisible().catch(() => false);
    const hasWorkspaces = (await workspaceItems.count()) > 0;

    expect(isEmpty || hasWorkspaces).toBeTruthy();
  });

  test('Клик по рабочему месту выделяет его', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const workspaceButton = page.locator(sidebar.workspaceButton).first();
    const isVisible = await workspaceButton.isVisible().catch(() => false);

    if (isVisible) {
      await workspaceButton.click();
      await page.waitForTimeout(1000);
      // Проверяем что workspace выделен визуально (имеет primary цвет фона)
      const parent = page.locator(sidebar.workspaceItem).first();
      await expect(parent).toHaveClass(/bg-primary/);
    } else {
      test.skip();
    }
  });
});

test.describe('Dashboard', () => {
  test('Dashboard страница загружается', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator(sidebar.root)).toBeVisible();
    await expect(page.locator(header.root)).toBeVisible();
  });

  test('Канбан отображается на dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator(sidebar.root)).toBeVisible({ timeout: 10000 });

    // Нужно выбрать workspace чтобы канбан отобразился
    const wsButton = page.locator('[data-testid="sidebar-workspace-button"]').first();
    const hasWs = await wsButton.isVisible().catch(() => false);
    test.skip(!hasWs, 'Нет доступных workspace');

    await wsButton.click();
    await page.waitForTimeout(1000);

    const board = page.locator(kanban.board);
    await expect(board).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Уведомления', () => {
  test('Иконка уведомлений в хедере', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(header.root)).toBeVisible();
    await expect(page.locator(header.notificationBell)).toBeVisible();
  });

  test('Клик по иконке открывает панель уведомлений', async ({ page }) => {
    await page.goto('/');

    const bellButton = page.locator(header.notificationBell);
    await bellButton.click();

    // Проверяем, что панель уведомлений открылась
    await expect(page.getByText('Уведомления')).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Навигация', () => {
  test('Переход на /workspace/[id] напрямую', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Страница должна загрузиться
    await page.goto('/workspace/test-id');
    await expect(page.locator('body')).toBeVisible();
  });
});
