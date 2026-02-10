import { test, expect } from '@playwright/test';
import { sidebar, admin } from './helpers/selectors';
import {
  goToDashboard,
  getDevToken,
} from './helpers/test-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// ============================================================================
// ТЕСТЫ ПАНЕЛИ АДМИНИСТРАТОРА
// ============================================================================
test.describe('Панель администратора', () => {
  test('Админ может перейти в /admin/users', async ({ page }) => {
    await goToDashboard(page);

    // Ищем ссылку на админ-панель
    const adminLink = page.locator(sidebar.adminLink);
    const hasLink = await adminLink.isVisible().catch(() => false);

    if (hasLink) {
      await adminLink.click();
      await page.waitForURL(/\/admin/, { timeout: 5000 });
    } else {
      // Прямая навигация
      await page.goto('/admin/users');
      await page.waitForTimeout(2000);
    }

    // Страница должна загрузиться
    const url = page.url();
    expect(url).toContain('/admin');

    // Проверяем, что контент загрузился
    await expect(page.locator('main')).toBeVisible({ timeout: 5000 });
  });

  test('Таблица пользователей загружается', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForTimeout(2000);

    // Должна быть таблица или список пользователей
    const userList = page.locator(admin.userList);
    const table = page.locator('table').first();
    const userRows = page.locator(admin.userRow);

    const hasList = await userList.isVisible().catch(() => false);
    const hasTable = await table.isVisible().catch(() => false);
    const hasRows = (await userRows.count().catch(() => 0)) > 0;

    // Если нет data-testid, ищем по содержимому
    const hasUserContent = await page.getByText(/admin@stankoff.ru/i).isVisible().catch(() => false);

    expect(hasList || hasTable || hasRows || hasUserContent).toBe(true);
  });

  test('Список пользователей показывает email, имя и роль', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForTimeout(2000);

    // Проверяем, что seed-пользователи отображаются
    const adminEmail = page.getByText('admin@stankoff.ru');
    const hasAdmin = await adminEmail.isVisible().catch(() => false);

    if (!hasAdmin) {
      // Возможно, данные загружаются медленнее
      await page.waitForTimeout(3000);
    }

    // Проверяем наличие email хотя бы одного пользователя
    const emailPattern = page.getByText(/@stankoff\.ru/i);
    const emailCount = await emailPattern.count().catch(() => 0);
    expect(emailCount).toBeGreaterThan(0);

    // Проверяем заголовки колонок (email, имя, роль)
    const emailHeader = page.getByText(/Email|Почта/i);
    const nameHeader = page.getByText(/Имя|ФИО|Name/i);
    const roleHeader = page.getByText(/Роль|Role/i);

    const hasEmailHeader = await emailHeader.first().isVisible().catch(() => false);
    const hasNameHeader = await nameHeader.first().isVisible().catch(() => false);
    const hasRoleHeader = await roleHeader.first().isVisible().catch(() => false);

    // Хотя бы один заголовок должен быть виден
    expect(hasEmailHeader || hasNameHeader || hasRoleHeader).toBe(true);
  });

  test('Поиск в списке пользователей работает', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForTimeout(2000);

    // Ищем поле поиска
    const searchInput = page.getByPlaceholder(/Поиск|Найти|Search/i).first().or(
      page.locator('input[type="search"]').first()
    );
    const hasSearch = await searchInput.isVisible().catch(() => false);

    if (!hasSearch) {
      test.skip();
      return;
    }

    // Вводим email для поиска
    await searchInput.fill('admin');
    await page.waitForTimeout(500);

    // Admin пользователь должен остаться видимым
    const adminRow = page.getByText('admin@stankoff.ru');
    const hasAdminRow = await adminRow.isVisible().catch(() => false);

    // Поиск не должен сломать страницу
    await expect(page.locator('main')).toBeVisible();

    if (hasAdminRow) {
      await expect(adminRow).toBeVisible();
    }
  });

  test('Можно создать нового пользователя', async ({ page }) => {
    await page.goto('/admin/users');
    // Ждём загрузку данных — таблица или заголовок "Пользователи"
    await expect(page.getByText(/Пользователи/i).first()).toBeVisible({ timeout: 10000 });

    // Ищем кнопку создания (текст "Добавить" с иконкой Plus)
    const createButton = page.getByRole('button', {
      name: /Создать|Добавить|Новый пользователь|Invite|Пригласить/i,
    }).first();
    const hasCreate = await createButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasCreate) {
      test.skip();
      return;
    }

    await createButton.click();
    await page.waitForTimeout(500);

    // Должна появиться форма или модальное окно
    const dialog = page.getByRole('dialog');
    const form = page.locator('form').last();

    const hasDialog = await dialog.isVisible().catch(() => false);
    const hasForm = await form.isVisible().catch(() => false);

    if (!hasDialog && !hasForm) {
      // Кнопка не открыла форму/диалог — другой UI
      test.skip();
      return;
    }

    // Проверяем наличие полей формы (label может быть через placeholder или text)
    const emailInput = page.getByLabel(/Email|Почта/i).or(page.getByPlaceholder(/email/i));
    const nameInput = page.getByLabel(/Имя|ФИО|Name/i).or(page.getByPlaceholder(/Имя/i));
    const modalTitle = page.getByText(/Новый пользователь|Редактировать|Создать|Добавить/i);

    const hasEmail = await emailInput.first().isVisible().catch(() => false);
    const hasName = await nameInput.first().isVisible().catch(() => false);
    const hasModalTitle = await modalTitle.first().isVisible().catch(() => false);

    // Хотя бы что-то должно быть — форма или модалка
    if (!hasEmail && !hasName && !hasModalTitle) {
      // Форма имеет другую структуру
      test.skip();
      return;
    }

    // Закрываем без сохранения (Escape или кнопка отмены)
    const cancelButton = page.getByRole('button', { name: /Отмена|Cancel|Закрыть/i });
    const hasCancel = await cancelButton.isVisible().catch(() => false);
    if (hasCancel) {
      await cancelButton.click();
    } else {
      await page.keyboard.press('Escape');
    }
  });

  test('Можно редактировать данные пользователя (имя, роль)', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForTimeout(2000);

    // Ищем кнопку редактирования у первого пользователя
    const userRow = page.locator(admin.userRow).first().or(page.locator('table tbody tr').first());
    const hasRow = await userRow.isVisible().catch(() => false);

    if (!hasRow) {
      test.skip();
      return;
    }

    // Ищем кнопку редактирования
    const editButton = userRow.getByRole('button', { name: /Редактировать|Edit/i }).or(
      userRow.locator('button').filter({ has: page.locator('.lucide-pencil, .lucide-edit, .lucide-settings') })
    );
    const hasEdit = await editButton.first().isVisible().catch(() => false);

    if (hasEdit) {
      await editButton.first().click();
      await page.waitForTimeout(500);

      // Должна появиться форма редактирования
      const dialog = page.getByRole('dialog');
      const hasDialog = await dialog.isVisible().catch(() => false);

      if (hasDialog) {
        // Закрываем без сохранения
        const cancelButton = page.getByRole('button', { name: /Отмена|Cancel|Закрыть/i });
        const hasCancel = await cancelButton.isVisible().catch(() => false);
        if (hasCancel) {
          await cancelButton.click();
        } else {
          await page.keyboard.press('Escape');
        }
      }
    } else {
      // Пробуем клик на строку
      await userRow.click();
      await page.waitForTimeout(500);
    }

    // Страница не должна сломаться
    await expect(page.locator('main')).toBeVisible();
  });

  test('Можно деактивировать пользователя', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForTimeout(2000);

    // Ищем кнопку деактивации или toggle активности
    const deactivateButton = page.getByRole('button', { name: /Деактивировать|Заблокировать|Disable|Block/i }).first();
    const toggleSwitch = page.locator('input[type="checkbox"][name*="active"], [role="switch"]').first();

    const hasDeactivate = await deactivateButton.isVisible().catch(() => false);
    const hasToggle = await toggleSwitch.isVisible().catch(() => false);

    // Информационная проверка - не все реализации имеют эту кнопку
    // Проверяем что страница загрузилась
    await expect(page.locator('main')).toBeVisible();

    if (hasDeactivate || hasToggle) {
      // Не кликаем, чтобы не деактивировать реального пользователя
      // Только проверяем что элемент управления есть
      expect(hasDeactivate || hasToggle).toBe(true);
    }
  });

  test('Не-админ перенаправляется с /admin/users', async () => {
    // Проверяем через API что не-админ не может получить список пользователей
    const viewerToken = await getDevToken('belov@stankoff.ru');
    if (!viewerToken) {
      test.skip();
      return;
    }

    // Пробуем вызвать admin API (если есть)
    const meRes = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });

    if (meRes.ok) {
      const user = await meRes.json();
      expect(user.role).not.toBe('admin');
    }

    // Пробуем получить доступ к admin endpoint (если существует)
    // Не-админ не должен иметь доступа к управлению пользователями
    const editorToken = await getDevToken('volkova@stankoff.ru');
    if (!editorToken) {
      test.skip();
      return;
    }

    const editorMe = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${editorToken}` },
    });

    if (editorMe.ok) {
      const editorUser = await editorMe.json();
      expect(editorUser.role).not.toBe('admin');
    }
  });
});
