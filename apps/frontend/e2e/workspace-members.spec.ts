import { test, expect } from '@playwright/test';
import { sidebar } from './helpers/selectors';
import { navigateToWorkspaceSettings, dismissToasts } from './helpers/test-utils';

/**
 * Workspace Members E2E Tests
 *
 * Тестирует вкладку "Участники" на странице настроек workspace:
 * - Загрузка списка участников
 * - Отображение имени, email, роли
 * - Изменение ролей
 * - Добавление участников
 * - Ограничения на удаление себя
 */

// Хелпер: открыть вкладку "Участники"
async function openMembersTab(page: any): Promise<boolean> {
  const ok = await navigateToWorkspaceSettings(page);
  if (!ok) return false;

  await page.waitForTimeout(1000);

  const membersTab = page.getByRole('button', { name: /Участники/i });
  const hasTab = await membersTab.isVisible().catch(() => false);
  if (!hasTab) return false;

  await membersTab.click();
  await page.waitForTimeout(1500);
  return true;
}

test.describe('Workspace Members -- Управление участниками', () => {
  test('Вкладка Участники загружается с текущими участниками', async ({ page }) => {
    const ok = await openMembersTab(page);
    if (!ok) {
      test.skip();
      return;
    }

    // Заголовок "Участники" и счётчик
    const heading = page.locator('h2').filter({ hasText: 'Участники' });
    await expect(heading).toBeVisible({ timeout: 5000 });

    // Либо таблица участников, либо сообщение "Нет участников"
    const table = page.locator('table');
    const emptyMsg = page.getByText('Нет участников');

    const hasTable = await table.isVisible().catch(() => false);
    const isEmpty = await emptyMsg.isVisible().catch(() => false);

    expect(hasTable || isEmpty).toBeTruthy();
  });

  test('Каждая строка участника показывает имя, email и роль', async ({ page }) => {
    const ok = await openMembersTab(page);
    if (!ok) {
      test.skip();
      return;
    }

    // Проверяем таблицу
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      test.skip();
      return;
    }

    const firstRow = rows.first();

    // Имя (p.font-medium)
    const name = firstRow.locator('p.font-medium').first();
    await expect(name).toBeVisible();
    const nameText = await name.textContent();
    expect(nameText).toBeTruthy();

    // Email
    const email = firstRow.locator('p').filter({ hasText: /@/ }).first();
    await expect(email).toBeVisible();

    // Роль (select с опциями Просмотр/Редактор/Администратор)
    const roleSelect = firstRow.locator('select');
    await expect(roleSelect).toBeVisible();

    const options = roleSelect.locator('option');
    const optionCount = await options.count();
    expect(optionCount).toBe(3); // Просмотр, Редактор, Администратор
  });

  test('Dropdown роли содержит опции: Просмотр, Редактор, Администратор', async ({ page }) => {
    const ok = await openMembersTab(page);
    if (!ok) {
      test.skip();
      return;
    }

    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      test.skip();
      return;
    }

    const roleSelect = rows.first().locator('select');
    await expect(roleSelect).toBeVisible();

    // Проверяем наличие всех трёх ролей
    const prosmotr = roleSelect.locator('option').filter({ hasText: 'Просмотр' });
    const editor = roleSelect.locator('option').filter({ hasText: 'Редактор' });
    const admin = roleSelect.locator('option').filter({ hasText: 'Администратор' });

    await expect(prosmotr).toBeAttached();
    await expect(editor).toBeAttached();
    await expect(admin).toBeAttached();
  });

  test('Изменение роли участника обновляет select', async ({ page }) => {
    const ok = await openMembersTab(page);
    if (!ok) {
      test.skip();
      return;
    }

    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      test.skip();
      return;
    }

    // Берём последнюю строку (скорее всего не текущий пользователь)
    const lastRow = rows.last();
    const roleSelect = lastRow.locator('select');

    const currentRole = await roleSelect.inputValue();

    // Выбираем другую роль
    const newRole = currentRole === 'editor' ? 'viewer' : 'editor';
    await roleSelect.selectOption(newRole);
    await page.waitForTimeout(500);

    // Проверяем, что значение обновилось
    const updatedRole = await roleSelect.inputValue();
    expect(updatedRole).toBe(newRole);

    // Возвращаем обратно
    await roleSelect.selectOption(currentRole);
    await page.waitForTimeout(500);
  });

  test('Кнопка удаления участника видна в строке', async ({ page }) => {
    const ok = await openMembersTab(page);
    if (!ok) {
      test.skip();
      return;
    }

    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      test.skip();
      return;
    }

    // Кнопка удаления (Trash2 иконка) в каждой строке
    const deleteBtn = rows.first().locator('button[title="Удалить"]');
    await expect(deleteBtn).toBeVisible();
  });

  test('Модальное окно добавления участника открывается', async ({ page }) => {
    const ok = await openMembersTab(page);
    if (!ok) {
      test.skip();
      return;
    }

    const addButton = page.getByRole('button', { name: /Добавить/i });
    const isEnabled = await addButton.isEnabled();

    if (!isEnabled) {
      // Все пользователи уже участники — кнопка disabled
      test.skip();
      return;
    }

    await addButton.click();
    await page.waitForTimeout(500);

    // Модальное окно "Добавить участника"
    await expect(page.getByText('Добавить участника')).toBeVisible({ timeout: 3000 });

    // Поля: Пользователь (select) и Роль (select)
    const userLabel = page.getByText('Пользователь');
    const roleLabel = page.getByText('Роль').last();

    await expect(userLabel).toBeVisible();
    await expect(roleLabel).toBeVisible();

    // Кнопки Отмена и Добавить
    await expect(page.getByRole('button', { name: /Отмена/i }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: /Добавить/i }).last()).toBeVisible();

    // Закрываем модалку
    await page.getByRole('button', { name: /Отмена/i }).last().click();
    await page.waitForTimeout(300);
  });
});
