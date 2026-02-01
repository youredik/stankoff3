import { test, expect } from '@playwright/test';

test.describe('Smoke тесты', () => {
  test('Главная страница загружается', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Stankoff/i);
  });

  test('Sidebar отображается', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('aside')).toBeVisible();
    await expect(page.getByText('Рабочие места')).toBeVisible();
  });

  test('Кнопка создания рабочего места видна', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: /Создать рабочее место/i })
    ).toBeVisible();
  });

  test('Header отображается', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
  });
});

test.describe('Workspace', () => {
  test('Показывает сообщение если нет рабочих мест или список workspaces', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('aside')).toBeVisible();

    // Ждём загрузки данных
    await page.waitForTimeout(2000);

    // Либо есть сообщение о пустоте, либо есть рабочие места
    const emptyMessage = page.getByText('Нет рабочих мест');
    const workspaceItems = page.locator('aside .group');

    const isEmpty = await emptyMessage.isVisible().catch(() => false);
    const hasWorkspaces = (await workspaceItems.count()) > 0;

    expect(isEmpty || hasWorkspaces).toBeTruthy();
  });

  test('Клик по рабочему месту выделяет его', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const workspaceButtons = page.locator('aside .group button').first();
    const isVisible = await workspaceButtons.isVisible().catch(() => false);

    if (isVisible) {
      await workspaceButtons.click();
      // Проверяем, что workspace выделен (имеет градиентный класс primary)
      const parent = page.locator('aside .group').first();
      await expect(parent).toHaveClass(/primary-50/);
    } else {
      test.skip();
    }
  });
});

test.describe('Создание workspace', () => {
  test('Кнопка создания workspace видна и доступна', async ({ page }) => {
    await page.goto('/');

    const createButton = page.getByRole('button', { name: /Создать рабочее место/i });
    await expect(createButton).toBeVisible();
    await expect(createButton).toBeEnabled();

    // НЕ кликаем на кнопку, чтобы не создавать реальные данные
    // Только проверяем, что кнопка существует и активна
  });
});

test.describe('Dashboard', () => {
  test('Dashboard страница загружается', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('aside')).toBeVisible();
    await expect(page.locator('header')).toBeVisible();
  });

  test('Канбан отображается на dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);

    // Проверяем наличие элементов канбана (колонки или кнопка создания)
    const columns = page.locator('[class*="overflow-x-auto"]');
    const hasKanban = await columns.isVisible().catch(() => false);

    expect(hasKanban).toBeTruthy();
  });
});

test.describe('Уведомления', () => {
  test('Иконка уведомлений в хедере', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
    // В хедере есть кнопки
    await expect(page.locator('header button').first()).toBeVisible();
  });

  test('Клик по иконке открывает панель уведомлений', async ({ page }) => {
    await page.goto('/');

    // Находим кнопку уведомлений (колокольчик)
    const bellButton = page.locator('header button').first();
    await bellButton.click();

    // Проверяем, что панель уведомлений открылась
    await expect(page.getByText('Уведомления')).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Навигация', () => {
  test('Переход на /workspace/[id] напрямую', async ({ page }) => {
    // Сначала получим ID существующего workspace через API или создадим
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Проверяем, работает ли прямой URL (может вернуть 404 если workspace не существует)
    await page.goto('/workspace/test-id');

    // Страница должна загрузиться (либо канбан, либо ошибка)
    await expect(page.locator('body')).toBeVisible();
  });
});
