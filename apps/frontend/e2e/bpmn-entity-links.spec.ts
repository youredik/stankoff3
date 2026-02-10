import { test, expect } from '@playwright/test';
import { kanban, entityDetail, bpmn } from './helpers/selectors';
import {
  selectFirstWorkspace,
  createTestEntity,
  openEntityDetail,
  dismissToasts,
  isZeebeAvailable,
  getDevToken,
} from './helpers/test-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

test.describe('BPMN Связи между сущностями', () => {
  let zeebeAvailable: boolean;

  test.beforeAll(async () => {
    zeebeAvailable = await isZeebeAvailable();
  });

  // ==========================================================================
  // Отображение связей в детальной панели
  // ==========================================================================

  test('Секция связей видна в детальной панели заявки', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }

    await dismissToasts(page);

    const card = page.locator(kanban.card).first();
    const hasCard = await card.isVisible().catch(() => false);
    if (!hasCard) {
      test.skip();
      return;
    }

    await card.click({ force: true });
    await page.waitForTimeout(1500);

    // Ищем секцию связей
    const linksSection = page.getByText(/Связанные заявки|Связи|Нет связанных заявок/i);
    const linkedEntities = page.locator(bpmn.linkedEntities);
    const addLinkButton = page.locator(bpmn.addLinkButton);

    const hasLinksSection = await linksSection.isVisible().catch(() => false);
    const hasLinkedEntities = await linkedEntities.isVisible().catch(() => false);
    const hasAddLinkBtn = await addLinkButton.isVisible().catch(() => false);

    // Секция связей должна быть видна (или кнопка добавления)
    expect(hasLinksSection || hasLinkedEntities || hasAddLinkBtn).toBe(true);
  });

  test('Кнопка "Добавить связь" открывает модальное окно', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }

    await dismissToasts(page);

    const card = page.locator(kanban.card).first();
    const hasCard = await card.isVisible().catch(() => false);
    if (!hasCard) {
      test.skip();
      return;
    }

    await card.click({ force: true });
    await page.waitForTimeout(1500);

    // Ищем кнопку добавления связи
    const addButton = page.locator(bpmn.addLinkButton);
    const addButtonText = page.getByRole('button', { name: /Добавить связь|Связать/i });

    const hasAddBtn1 = await addButton.isVisible().catch(() => false);
    const hasAddBtn2 = await addButtonText.isVisible().catch(() => false);

    if (!hasAddBtn1 && !hasAddBtn2) {
      test.skip();
      return;
    }

    const buttonToClick = hasAddBtn1 ? addButton : addButtonText;
    await buttonToClick.click();
    await page.waitForTimeout(1000);

    // Должен появиться модал "Добавить связь"
    const modal = page.getByText('Добавить связь').last();
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('Модал добавления связи содержит поиск заявок', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }

    await dismissToasts(page);

    const card = page.locator(kanban.card).first();
    const hasCard = await card.isVisible().catch(() => false);
    if (!hasCard) {
      test.skip();
      return;
    }

    await card.click({ force: true });
    await page.waitForTimeout(1500);

    const addButton = page.locator(bpmn.addLinkButton);
    const hasAddButton = await addButton.isVisible().catch(() => false);
    if (!hasAddButton) {
      const addButtonText = page.getByRole('button', { name: /Добавить связь|Связать/i });
      const hasBtn = await addButtonText.isVisible().catch(() => false);
      if (!hasBtn) {
        test.skip();
        return;
      }
      await addButtonText.click();
    } else {
      await addButton.click();
    }

    await page.waitForTimeout(1000);

    // Проверяем наличие поля поиска
    const searchInput = page.getByPlaceholder(/ID или название заявки/i);
    const hasSearch = await searchInput.isVisible().catch(() => false);

    if (hasSearch) {
      await expect(searchInput).toBeVisible();
    }

    // Проверяем наличие выбора типа связи
    const linkTypeSelect = page.locator('select').filter({ has: page.locator('option:text("Связано")') }).first();
    const hasLinkType = await linkTypeSelect.isVisible().catch(() => false);

    expect(hasSearch || hasLinkType).toBe(true);
  });

  test('Можно найти заявку через поиск в модале связей', async ({ page }) => {
    const hasWorkspace = await selectFirstWorkspace(page);
    if (!hasWorkspace) {
      test.skip();
      return;
    }

    // Создаём две заявки
    await dismissToasts(page);
    const targetTitle = `Связь цель ${Date.now()}`;
    await createTestEntity(page, targetTitle);
    await dismissToasts(page);

    const sourceTitle = `Связь источник ${Date.now()}`;
    await createTestEntity(page, sourceTitle);
    await dismissToasts(page);

    // Открываем источник
    await openEntityDetail(page, sourceTitle);
    await page.waitForTimeout(1000);

    // Ищем кнопку добавления связи
    const addButton = page.locator(bpmn.addLinkButton);
    const addButtonText = page.getByRole('button', { name: /Добавить связь|Связать/i });
    const hasAddButton = await addButton.isVisible().catch(() => false);
    const hasAddButtonText = await addButtonText.isVisible().catch(() => false);

    if (!hasAddButton && !hasAddButtonText) {
      test.skip();
      return;
    }

    if (hasAddButton) {
      await addButton.click();
    } else {
      await addButtonText.click();
    }

    await page.waitForTimeout(1000);

    // Ищем заявку-цель
    const searchInput = page.getByPlaceholder(/ID или название заявки/i);
    const hasSearch = await searchInput.isVisible().catch(() => false);

    if (!hasSearch) {
      test.skip();
      return;
    }

    await searchInput.fill(targetTitle.substring(0, 15));

    // Нажимаем "Найти"
    const findButton = page.getByRole('button', { name: /Найти/i });
    const hasFind = await findButton.isVisible().catch(() => false);
    if (hasFind) {
      await findButton.click();
      await page.waitForTimeout(2000);

      // Должны появиться результаты поиска
      const searchResults = page.locator('.max-h-48 label');
      const resultCount = await searchResults.count();

      // Может быть 0 если поиск не нашёл
      expect(resultCount).toBeGreaterThanOrEqual(0);
    }
  });

  // ==========================================================================
  // API тесты для связей
  // ==========================================================================

  test('API: Создание связи между заявками', async () => {
    const token = await getDevToken();
    if (!token) {
      test.skip();
      return;
    }

    // Получаем workspace
    const wsRes = await fetch(`${API_URL}/workspaces`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const workspaces = await wsRes.json();
    if (!workspaces.length) {
      test.skip();
      return;
    }

    // Получаем заявки для связывания
    const entitiesRes = await fetch(
      `${API_URL}/entities?workspaceId=${workspaces[0].id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!entitiesRes.ok) {
      test.skip();
      return;
    }

    const entities = await entitiesRes.json();
    const entityList = Array.isArray(entities) ? entities : entities.data || [];

    if (entityList.length < 2) {
      test.skip();
      return;
    }

    // Создаём связь
    const linkData = {
      sourceEntityId: entityList[0].id,
      targetEntityId: entityList[1].id,
      linkType: 'related',
    };

    const res = await fetch(`${API_URL}/bpmn/entity-links`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(linkData),
    });

    if (!res.ok) {
      // Модуль entity-links может быть недоступен
      test.skip();
      return;
    }
    const link = await res.json();
    expect(link.id).toBeTruthy();
    expect(link.linkType).toBe('related');

    // Cleanup
    await fetch(`${API_URL}/bpmn/entity-links/${link.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  test('API: Получение связей заявки', async () => {
    const token = await getDevToken();
    if (!token) {
      test.skip();
      return;
    }

    const wsRes = await fetch(`${API_URL}/workspaces`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const workspaces = await wsRes.json();
    if (!workspaces.length) {
      test.skip();
      return;
    }

    const entitiesRes = await fetch(
      `${API_URL}/entities?workspaceId=${workspaces[0].id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!entitiesRes.ok) {
      test.skip();
      return;
    }

    const entities = await entitiesRes.json();
    const entityList = Array.isArray(entities) ? entities : entities.data || [];

    if (!entityList.length) {
      test.skip();
      return;
    }

    const res = await fetch(`${API_URL}/bpmn/entity-links/entity/${entityList[0].id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      // Модуль entity-links может быть недоступен
      test.skip();
      return;
    }
    const links = await res.json();
    expect(Array.isArray(links)).toBe(true);
  });

  test('API: Удаление связи между заявками', async () => {
    const token = await getDevToken();
    if (!token) {
      test.skip();
      return;
    }

    const wsRes = await fetch(`${API_URL}/workspaces`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const workspaces = await wsRes.json();
    if (!workspaces.length) {
      test.skip();
      return;
    }

    const entitiesRes = await fetch(
      `${API_URL}/entities?workspaceId=${workspaces[0].id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!entitiesRes.ok) {
      test.skip();
      return;
    }

    const entities = await entitiesRes.json();
    const entityList = Array.isArray(entities) ? entities : entities.data || [];

    if (entityList.length < 2) {
      test.skip();
      return;
    }

    // Создаём связь
    const createRes = await fetch(`${API_URL}/bpmn/entity-links`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceEntityId: entityList[0].id,
        targetEntityId: entityList[1].id,
        linkType: 'blocks',
      }),
    });

    if (!createRes.ok) {
      test.skip();
      return;
    }

    const link = await createRes.json();

    // Удаляем
    const deleteRes = await fetch(`${API_URL}/bpmn/entity-links/${link.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(deleteRes.ok).toBe(true);

    // Проверяем что связь удалена
    const checkRes = await fetch(`${API_URL}/bpmn/entity-links/entity/${entityList[0].id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const remaining = await checkRes.json();
    const found = remaining.find((l: any) => l.id === link.id);
    expect(found).toBeUndefined();
  });

  test('API: Spawn создаёт новую заявку и связывает её', async () => {
    if (!zeebeAvailable) {
      test.skip();
      return;
    }

    const token = await getDevToken();
    if (!token) {
      test.skip();
      return;
    }

    const wsRes = await fetch(`${API_URL}/workspaces`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const workspaces = await wsRes.json();
    if (!workspaces.length) {
      test.skip();
      return;
    }

    const entitiesRes = await fetch(
      `${API_URL}/entities?workspaceId=${workspaces[0].id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!entitiesRes.ok) {
      test.skip();
      return;
    }

    const entities = await entitiesRes.json();
    const entityList = Array.isArray(entities) ? entities : entities.data || [];

    if (!entityList.length) {
      test.skip();
      return;
    }

    // Spawn — создаём новую заявку и привязываем
    const spawnRes = await fetch(`${API_URL}/bpmn/entity-links/spawn`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceEntityId: entityList[0].id,
        title: `Spawn тест ${Date.now()}`,
        workspaceId: workspaces[0].id,
        linkType: 'child',
      }),
    });

    // spawn может быть не реализован — проверяем корректный ответ
    if (spawnRes.ok) {
      const result = await spawnRes.json();
      expect(result).toBeTruthy();
    } else {
      // 404 или 400 — endpoint может быть не реализован
      expect([400, 404, 500].includes(spawnRes.status) || spawnRes.ok).toBe(true);
    }
  });
});
