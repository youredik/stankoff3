import { test, expect } from '@playwright/test';
import { sidebar, kanban, entityDetail } from './helpers/selectors';
import {
  goToDashboard,
  selectFirstWorkspace,
  selectWorkspaceByName,
  openEntityDetail,
  closeEntityDetail,
  dismissToasts,
  isLegacyAvailable,
  getDevToken,
} from './helpers/test-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/**
 * Тесты интеграции с Legacy CRM.
 * Legacy CRM доступна только с IP препрода (MariaDB на 185.186.143.38).
 * Все тесты пропускаются если Legacy недоступна.
 */
test.describe('Legacy CRM интеграция', () => {
  let legacyAvailable: boolean;

  test.beforeAll(async () => {
    legacyAvailable = await isLegacyAvailable();
  });

  test('Legacy health check показывает статус подключения', async ({ page }) => {
    const token = await getDevToken();
    test.skip(!token, 'Не удалось получить токен');

    const response = await page.request.get(`${API_URL}/legacy/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    // API может возвращать { connected: boolean } или { available: boolean, message: string }
    const isConnected = data.connected ?? data.available;
    expect(isConnected !== undefined).toBe(true);
    expect(typeof isConnected).toBe('boolean');
  });

  test('CustomerPicker отображается в детали сущности (если есть поле клиента)', async ({ page }) => {
    test.skip(!legacyAvailable, 'Legacy CRM недоступна');

    const hasWorkspace = await selectFirstWorkspace(page);
    test.skip(!hasWorkspace, 'Нет доступных workspace');

    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });

    const card = page.locator(kanban.card).first();
    const hasCard = await card.isVisible().catch(() => false);
    test.skip(!hasCard, 'Нет карточек на канбане');

    await card.click({ force: true });
    await expect(page.locator(entityDetail.overlay)).toBeVisible({ timeout: 5000 });

    // Ищем компонент CustomerPicker (может быть в пользовательских полях)
    const customerPicker = page.locator(
      '[data-testid="legacy-customer-picker"], [data-testid="customer-picker"]'
    );
    const hasCustomerPicker = await customerPicker.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasCustomerPicker) {
      // Поле клиента может отсутствовать в данном workspace
      test.skip();
      return;
    }

    await expect(customerPicker).toBeVisible();
  });

  test('CustomerPicker поиск работает', async ({ page }) => {
    test.skip(!legacyAvailable, 'Legacy CRM недоступна');

    const hasWorkspace = await selectFirstWorkspace(page);
    test.skip(!hasWorkspace, 'Нет доступных workspace');

    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });

    const card = page.locator(kanban.card).first();
    const hasCard = await card.isVisible().catch(() => false);
    test.skip(!hasCard, 'Нет карточек');

    await card.click({ force: true });
    await expect(page.locator(entityDetail.overlay)).toBeVisible({ timeout: 5000 });

    const customerPicker = page.locator(
      '[data-testid="legacy-customer-picker"], [data-testid="customer-picker"]'
    );
    const hasCustomerPicker = await customerPicker.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!hasCustomerPicker, 'CustomerPicker не найден');

    // Ищем поле ввода внутри пикера
    const searchInput = customerPicker.locator('input');
    await searchInput.fill('Иванов');
    await page.waitForTimeout(1000);

    // Должны появиться результаты поиска
    const results = page.locator(
      '[data-testid="customer-search-results"], [role="listbox"], [class*="dropdown"]'
    );
    const hasResults = await results.first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasResults).toBeTruthy();
  });

  test('Выбор клиента заполняет поле', async ({ page }) => {
    test.skip(!legacyAvailable, 'Legacy CRM недоступна');

    const hasWorkspace = await selectFirstWorkspace(page);
    test.skip(!hasWorkspace, 'Нет доступных workspace');

    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });

    const card = page.locator(kanban.card).first();
    const hasCard = await card.isVisible().catch(() => false);
    test.skip(!hasCard, 'Нет карточек');

    await card.click({ force: true });
    await expect(page.locator(entityDetail.overlay)).toBeVisible({ timeout: 5000 });

    const customerPicker = page.locator(
      '[data-testid="legacy-customer-picker"], [data-testid="customer-picker"]'
    );
    const hasCustomerPicker = await customerPicker.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!hasCustomerPicker, 'CustomerPicker не найден');

    const searchInput = customerPicker.locator('input');
    await searchInput.fill('Иванов');
    await page.waitForTimeout(1000);

    // Выбираем первый результат
    const firstResult = page.locator(
      '[data-testid="customer-search-results"] [data-testid="customer-option"]:first-child, ' +
      '[role="option"]:first-child'
    );
    const hasResult = await firstResult.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasResult, 'Нет результатов поиска клиентов');

    await firstResult.click();
    await page.waitForTimeout(500);

    // После выбора поле должно содержать имя клиента
    const selectedValue = customerPicker.locator(
      '[data-testid="selected-customer"], .selected-value, span'
    );
    const selectedText = await selectedValue.first().textContent().catch(() => '');
    expect(selectedText!.length).toBeGreaterThan(0);
  });

  test('ProductPicker отображается для поля товара', async ({ page }) => {
    test.skip(!legacyAvailable, 'Legacy CRM недоступна');

    const hasWorkspace = await selectFirstWorkspace(page);
    test.skip(!hasWorkspace, 'Нет доступных workspace');

    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });

    const card = page.locator(kanban.card).first();
    const hasCard = await card.isVisible().catch(() => false);
    test.skip(!hasCard, 'Нет карточек');

    await card.click({ force: true });
    await expect(page.locator(entityDetail.overlay)).toBeVisible({ timeout: 5000 });

    const productPicker = page.locator(
      '[data-testid="legacy-product-picker"], [data-testid="product-picker"]'
    );
    const hasProductPicker = await productPicker.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasProductPicker) {
      test.skip();
      return;
    }

    await expect(productPicker).toBeVisible();
  });

  test('ProductPicker фильтр по категории работает', async ({ page }) => {
    test.skip(!legacyAvailable, 'Legacy CRM недоступна');

    const hasWorkspace = await selectFirstWorkspace(page);
    test.skip(!hasWorkspace, 'Нет доступных workspace');

    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });

    const card = page.locator(kanban.card).first();
    const hasCard = await card.isVisible().catch(() => false);
    test.skip(!hasCard, 'Нет карточек');

    await card.click({ force: true });
    await expect(page.locator(entityDetail.overlay)).toBeVisible({ timeout: 5000 });

    const productPicker = page.locator(
      '[data-testid="legacy-product-picker"], [data-testid="product-picker"]'
    );
    const hasProductPicker = await productPicker.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!hasProductPicker, 'ProductPicker не найден');

    // Ищем селектор категории
    const categorySelect = productPicker.locator(
      'select, [data-testid="category-filter"], [role="combobox"]'
    );
    const hasCategorySelect = await categorySelect.first().isVisible().catch(() => false);
    test.skip(!hasCategorySelect, 'Фильтр по категории не найден');

    // Выбираем любую категорию кроме первой (по умолчанию)
    const options = categorySelect.first().locator('option');
    const optionCount = await options.count();

    if (optionCount > 1) {
      await categorySelect.first().selectOption({ index: 1 });
      await page.waitForTimeout(500);
    }

    // Страница не должна упасть
    await expect(page.locator(entityDetail.overlay)).toBeVisible();
  });

  test('CounterpartyPicker поиск по ИНН работает', async ({ page }) => {
    test.skip(!legacyAvailable, 'Legacy CRM недоступна');

    // Проверяем через API напрямую
    const token = await getDevToken();
    test.skip(!token, 'Не удалось получить токен');

    const response = await page.request.get(
      `${API_URL}/legacy/counterparties/search?q=7707`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // API возвращает 200 с пагинированным ответом {items, total, limit, offset} или массивом
    expect(response.status()).toBe(200);
    const data = await response.json();
    const items = Array.isArray(data) ? data : data.items;
    expect(Array.isArray(items)).toBeTruthy();
  });

  test('DealLink показывает информацию о сделке', async ({ page }) => {
    test.skip(!legacyAvailable, 'Legacy CRM недоступна');

    const hasWorkspace = await selectFirstWorkspace(page);
    test.skip(!hasWorkspace, 'Нет доступных workspace');

    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });

    const card = page.locator(kanban.card).first();
    const hasCard = await card.isVisible().catch(() => false);
    test.skip(!hasCard, 'Нет карточек');

    await card.click({ force: true });
    await expect(page.locator(entityDetail.overlay)).toBeVisible({ timeout: 5000 });

    // Ищем компонент DealLink
    const dealLink = page.locator(
      '[data-testid="legacy-deal-link"], [data-testid="deal-link"]'
    );
    const hasDealLink = await dealLink.first().isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasDealLink) {
      test.skip();
      return;
    }

    // DealLink должен содержать информацию (сумма, этап, контрагент)
    const dealText = await dealLink.first().textContent();
    expect(dealText).toBeTruthy();
    expect(dealText!.length).toBeGreaterThan(0);
  });

  test('DealsList показывает список нескольких сделок', async ({ page }) => {
    test.skip(!legacyAvailable, 'Legacy CRM недоступна');

    const hasWorkspace = await selectFirstWorkspace(page);
    test.skip(!hasWorkspace, 'Нет доступных workspace');

    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });

    const card = page.locator(kanban.card).first();
    const hasCard = await card.isVisible().catch(() => false);
    test.skip(!hasCard, 'Нет карточек');

    await card.click({ force: true });
    await expect(page.locator(entityDetail.overlay)).toBeVisible({ timeout: 5000 });

    const dealsList = page.locator(
      '[data-testid="legacy-deals-list"], [data-testid="deals-list"]'
    );
    const hasDealsList = await dealsList.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasDealsList) {
      test.skip();
      return;
    }

    // Список должен содержать хотя бы один элемент
    const deals = dealsList.locator(
      '[data-testid="legacy-deal-link"], [data-testid="deal-link"], a, li'
    );
    const dealsCount = await deals.count();
    expect(dealsCount).toBeGreaterThan(0);
  });

  test('Legacy ссылки открываются в новой вкладке', async ({ page }) => {
    test.skip(!legacyAvailable, 'Legacy CRM недоступна');

    const hasWorkspace = await selectFirstWorkspace(page);
    test.skip(!hasWorkspace, 'Нет доступных workspace');

    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });

    const card = page.locator(kanban.card).first();
    const hasCard = await card.isVisible().catch(() => false);
    test.skip(!hasCard, 'Нет карточек');

    await card.click({ force: true });
    await expect(page.locator(entityDetail.overlay)).toBeVisible({ timeout: 5000 });

    // Ищем ссылки на legacy CRM (stankoff.ru/crm)
    const legacyLinks = page.locator('a[href*="stankoff.ru/crm"]');
    const hasLinks = await legacyLinks.first().isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasLinks) {
      test.skip();
      return;
    }

    // Ссылки должны иметь target="_blank" (открытие в новой вкладке)
    const target = await legacyLinks.first().getAttribute('target');
    expect(target).toBe('_blank');
  });

  test('Graceful fallback когда Legacy недоступна', async ({ page }) => {
    // Этот тест актуален при любом состоянии Legacy
    const hasWorkspace = await selectFirstWorkspace(page);
    test.skip(!hasWorkspace, 'Нет доступных workspace');

    await expect(page.locator(kanban.board)).toBeVisible({ timeout: 10000 });

    const card = page.locator(kanban.card).first();
    const hasCard = await card.isVisible().catch(() => false);
    test.skip(!hasCard, 'Нет карточек');

    await card.click({ force: true });
    await expect(page.locator(entityDetail.overlay)).toBeVisible({ timeout: 5000 });

    // Страница не должна упасть даже если Legacy недоступна
    // Проверяем что нет JavaScript ошибок (unhandled rejection / error overlay)
    const errorOverlay = page.locator(
      '#__next-build-error, [data-testid="error-overlay"], .nextjs-container-errors-header'
    );
    await expect(errorOverlay).not.toBeVisible({ timeout: 2000 });

    // Детальная панель должна корректно отображаться
    await expect(page.locator(entityDetail.overlay)).toBeVisible();
  });
});
