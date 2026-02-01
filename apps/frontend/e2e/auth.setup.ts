import { test as setup, expect } from '@playwright/test';
import path from 'path';

export const STORAGE_STATE = path.join(__dirname, '../.auth/user.json');

setup('authenticate', async ({ page }) => {
  // Переходим на страницу логина
  await page.goto('/login');

  // Ждём загрузки формы
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });

  // Заполняем форму
  await page.fill('input[type="email"]', 'admin@stankoff.ru');
  await page.fill('input[type="password"]', 'password');

  // Отправляем форму
  await page.click('button[type="submit"]');

  // Ждём редиректа на dashboard
  await page.waitForURL('**/dashboard', { timeout: 15000 });

  // Проверяем что авторизация успешна
  await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });

  // Сохраняем состояние авторизации
  await page.context().storageState({ path: STORAGE_STATE });
});
