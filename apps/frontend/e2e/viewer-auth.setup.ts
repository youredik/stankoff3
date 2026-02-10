import { test as setup, expect } from '@playwright/test';
import path from 'path';

export const VIEWER_STORAGE_STATE = path.join(__dirname, '../.auth/viewer.json');

setup('authenticate as viewer', async ({ page }) => {
  // Переходим на страницу логина (dev mode показывает карточки пользователей)
  await page.goto('/login');

  // Ждём загрузки карточек dev-пользователей
  await expect(page.getByText('Выберите пользователя для входа')).toBeVisible({ timeout: 15000 });

  // Белов — viewer в Рекламациях (REK), менеджер в других workspace'ах
  const viewerCard = page.locator('button').filter({ hasText: 'belov@stankoff.ru' });
  await viewerCard.click();

  // Ждём редиректа на dashboard
  await page.waitForURL('**/dashboard', { timeout: 15000 });

  // Проверяем что авторизация успешна — sidebar виден
  await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });

  // Сохраняем состояние авторизации (cookies + localStorage)
  await page.context().storageState({ path: VIEWER_STORAGE_STATE });
});
