import { test as setup, expect } from '@playwright/test';
import path from 'path';

export const EDITOR_STORAGE_STATE = path.join(__dirname, '../.auth/editor.json');

setup('authenticate as editor (volkova)', async ({ page }) => {
  // Переходим на страницу логина (dev mode показывает карточки пользователей)
  await page.goto('/login');

  // Ждём загрузки карточек dev-пользователей
  await expect(page.getByText('Выберите пользователя для входа')).toBeVisible({ timeout: 15000 });

  // Волкова — manager в workspace "Техническая поддержка" (TP)
  const editorCard = page.locator('button').filter({ hasText: 'volkova@stankoff.ru' });
  await expect(editorCard).toBeVisible({ timeout: 10000 });
  await editorCard.click();

  // Ждём редиректа на dashboard
  await page.waitForURL('**/dashboard', { timeout: 15000 });

  // Проверяем что авторизация успешна — sidebar виден
  await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });

  // Сохраняем состояние авторизации (cookies + localStorage)
  await page.context().storageState({ path: EDITOR_STORAGE_STATE });
});
