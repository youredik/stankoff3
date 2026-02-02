import { test, expect } from '@playwright/test';

// Хелпер: выбрать workspace по названию
async function selectWorkspace(page: any, name: string) {
  await page.waitForTimeout(1000);
  const workspace = page.locator('aside .group button').filter({ hasText: name });
  await expect(workspace).toBeVisible({ timeout: 10000 });
  await workspace.click();
  await page.waitForTimeout(1500);
}

// Тесты для viewer роли (storageState .auth/viewer.json)
test.describe('RBAC - Viewer permissions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);
  });

  test('Viewer (Петрова) видит workspaces где она участник', async ({ page }) => {
    // Петрова должна видеть Техническая поддержка (editor) и Рекламации (viewer)
    const techSupport = page.locator('aside').getByText('Техническая поддержка');
    const complaints = page.locator('aside').getByText('Рекламации');

    await expect(techSupport).toBeVisible({ timeout: 10000 });
    await expect(complaints).toBeVisible({ timeout: 10000 });
  });

  test('В workspace Рекламации (viewer) не видна кнопка "Новая заявка"', async ({ page }) => {
    await selectWorkspace(page, 'Рекламации');

    // Кнопка "Новая заявка" не должна быть видна для viewer
    const newEntityButton = page.getByRole('button', { name: /Новая заявка/i });
    await expect(newEntityButton).not.toBeVisible();
  });

  test('В workspace Рекламации (viewer) показан индикатор "Режим просмотра"', async ({ page }) => {
    await selectWorkspace(page, 'Рекламации');

    // Ищем индикатор режима просмотра
    const viewModeIndicator = page.getByText(/Режим просмотра/i);
    await expect(viewModeIndicator).toBeVisible({ timeout: 5000 });
  });

  test('Viewer может открыть карточку заявки', async ({ page }) => {
    await selectWorkspace(page, 'Рекламации');

    const card = page.locator('[data-testid="kanban-card"]').first();
    const hasCard = await card.isVisible().catch(() => false);

    if (!hasCard) {
      test.skip();
      return;
    }

    // Используем force: true потому что карточка имеет aria-disabled из-за отключенного drag-and-drop для viewer
    await card.click({ force: true });
    const detailPanel = page.locator('[data-testid="detail-panel-overlay"]');
    await expect(detailPanel).toBeVisible({ timeout: 5000 });
  });

  test('Viewer не видит редактор комментариев в детальной панели', async ({ page }) => {
    await selectWorkspace(page, 'Рекламации');

    const card = page.locator('[data-testid="kanban-card"]').first();
    const hasCard = await card.isVisible().catch(() => false);

    if (!hasCard) {
      test.skip();
      return;
    }

    await card.click({ force: true });
    await page.waitForTimeout(500);

    // Редактор комментариев (tiptap) не должен быть виден для viewer
    const tiptapEditor = page.locator('.tiptap');
    await expect(tiptapEditor).not.toBeVisible();
  });

  test('В workspace Техническая поддержка (editor) видна кнопка "Новая заявка"', async ({ page }) => {
    await selectWorkspace(page, 'Техническая поддержка');

    // Кнопка "Новая заявка" должна быть видна для editor
    const newEntityButton = page.getByRole('button', { name: /Новая заявка/i });
    await expect(newEntityButton).toBeVisible({ timeout: 5000 });
  });

  test('В workspace Техническая поддержка (editor) НЕТ индикатора "Режим просмотра"', async ({ page }) => {
    await selectWorkspace(page, 'Техническая поддержка');

    // Индикатор режима просмотра НЕ должен быть виден для editor
    const viewModeIndicator = page.getByText(/Режим просмотра/i);
    await expect(viewModeIndicator).not.toBeVisible();
  });
});
