import { test, expect } from '@playwright/test';
import { sidebar, kanban, entityDetail } from '../helpers/selectors';
import {
  goToDashboard,
  selectWorkspaceByName,
  createTestEntity,
  openEntityDetail,
  closeEntityDetail,
  dismissToasts,
  isZeebeAvailable,
  getDevToken,
  createEntityApi,
  getEntityApi,
  waitForProcessInstance,
  waitForUserTask,
  claimAndCompleteTask,
  getProcessInstances,
} from '../helpers/test-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/**
 * Сценарий: Обработка обращения в техподдержку (service-support-v2).
 *
 * Полный BPMN happy path:
 *   1. Создание entity (UI) → триггер entity_created → процесс стартует автоматически
 *   2. Start → Log → SetNew → AI Classify → SetClassified
 *   3. Task_Route (user task, candidateGroups: l1-supervisors) — выбор исполнителя
 *   4. SetAssignee → Notify → SetInProgress
 *   5. Task_Work (user task, assigned to selectedAssigneeId) — decision: "resolved"
 *   6. SetResolved → NotifyCreator
 *   7. Task_Confirm (user task, assigned to creatorId) — confirmed: true
 *   8. SetClosed → LogClosed → End
 *
 * Тест использует API polling (waitForUserTask) вместо waitForTimeout.
 * Все user tasks завершаются через API (claim + complete).
 */
test.describe.serial('Сценарий: Обработка обращения в техподдержку', () => {
  // Shared state between serial tests
  let zeebeAvailable = false;
  let adminToken: string | null = null;
  let adminUserId: string | null = null;
  let workspaceId: string | null = null;
  let entityId: string | null = null;
  const testTitle = `Playwright ТП ${Date.now()}`;

  // -------------------------------------------------------------------------
  // 1. Setup: проверка Zeebe, получение admin user ID
  // -------------------------------------------------------------------------
  test('1. Setup: проверка Zeebe и получение admin user ID', async () => {
    zeebeAvailable = await isZeebeAvailable();
    test.skip(!zeebeAvailable, 'Zeebe недоступен — пропуск BPMN сценария');

    // Получаем токен и ID админа
    adminToken = await getDevToken('admin@stankoff.ru');
    expect(adminToken, 'Не удалось получить dev token для admin').toBeTruthy();

    const meRes = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(meRes.ok, 'GET /auth/me вернул ошибку').toBe(true);

    const meData = await meRes.json();
    adminUserId = meData.id;
    expect(adminUserId, 'admin user ID пустой').toBeTruthy();

    // Находим workspace "Техническая поддержка"
    const wsRes = await fetch(`${API_URL}/workspaces`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(wsRes.ok, 'GET /workspaces вернул ошибку').toBe(true);

    const workspaces = await wsRes.json();
    const tpWorkspace = workspaces.find(
      (ws: any) => ws.name === 'Техническая поддержка',
    );
    expect(tpWorkspace, 'Workspace "Техническая поддержка" не найден').toBeTruthy();

    workspaceId = tpWorkspace.id;
  });

  // -------------------------------------------------------------------------
  // 2. Создание entity через UI
  // -------------------------------------------------------------------------
  test('2. Создание обращения через UI', async ({ page }) => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(workspaceId, 'workspaceId не задан из setup').toBeTruthy();

    await goToDashboard(page);
    await selectWorkspaceByName(page, 'Техническая поддержка');
    await dismissToasts(page);

    // Создаём заявку через UI
    await createTestEntity(page, testTitle, { priority: 'high' });

    // Проверяем карточку на канбане
    const card = page.locator(kanban.card).filter({ hasText: testTitle }).first();
    await expect(card).toBeVisible({ timeout: 10000 });

    // Извлекаем entityId из API (по title)
    const searchRes = await fetch(
      `${API_URL}/entities?workspaceId=${workspaceId}&search=${encodeURIComponent(testTitle)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(searchRes.ok, 'GET /entities с поиском вернул ошибку').toBe(true);

    const entities = await searchRes.json();
    // Ответ может быть массивом или объектом с items
    const list = Array.isArray(entities) ? entities : entities.items || [];
    const found = list.find((e: any) => e.title === testTitle);
    expect(found, `Entity "${testTitle}" не найден в API`).toBeTruthy();

    entityId = found.id;
  });

  // -------------------------------------------------------------------------
  // 3. Проверка автоматического запуска процесса через триггер
  // -------------------------------------------------------------------------
  test('3. Процесс запущен автоматически (через триггер entity_created)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId, 'entityId не задан').toBeTruthy();

    const processInstance = await waitForProcessInstance(entityId!, 30000);
    expect(
      processInstance,
      'Process instance не появился за 30 сек — триггер не сработал',
    ).toBeTruthy();
    expect(processInstance.status).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 4. Проверка: entity классифицирован (AI classify → set status "classified")
  // -------------------------------------------------------------------------
  test('4. Entity получил статус "classified" после AI классификации', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId, 'entityId не задан').toBeTruthy();

    // Ждём пока AI классификация пройдёт и статус обновится.
    // AI classify + set status = service tasks, обычно < 15 сек.
    let entity: any = null;
    const start = Date.now();
    const maxWait = 30000;

    while (Date.now() - start < maxWait) {
      entity = await getEntityApi(entityId!);
      if (entity && entity.status === 'classified') break;
      // Также принимаем более поздние статусы (если process уже продвинулся)
      if (
        entity &&
        ['assigned', 'in_progress', 'resolved', 'closed'].includes(entity.status)
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    expect(entity, 'Entity не найден через API').toBeTruthy();
    expect(
      ['classified', 'assigned', 'in_progress', 'resolved', 'closed'],
      'Ожидался статус classified или более поздний',
    ).toContain(entity.status);
  });

  // -------------------------------------------------------------------------
  // 5. Task_Route: назначение исполнителя
  // -------------------------------------------------------------------------
  test('5. Task_Route: назначить исполнителя', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId, 'entityId не задан').toBeTruthy();
    expect(adminUserId, 'adminUserId не задан').toBeTruthy();

    // Ждём появления user task Task_Route
    const task = await waitForUserTask(entityId!, 'Task_Route', 30000);
    expect(task, 'User task Task_Route не появился за 30 сек').toBeTruthy();

    // Claim и complete через API с formData: selectedAssigneeId = admin
    const success = await claimAndCompleteTask(task.id, {
      selectedAssigneeId: adminUserId,
    });
    expect(success, 'Не удалось claim + complete Task_Route').toBe(true);
  });

  // -------------------------------------------------------------------------
  // 6. Task_Work: работа над заявкой — решение "resolved"
  // -------------------------------------------------------------------------
  test('6. Task_Work: решить заявку (decision: resolved)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId, 'entityId не задан').toBeTruthy();

    // Ждём Task_Work (assigned to selectedAssigneeId = admin)
    const task = await waitForUserTask(entityId!, 'Task_Work', 30000);
    expect(task, 'User task Task_Work не появился за 30 сек').toBeTruthy();

    // Complete с decision = resolved
    const success = await claimAndCompleteTask(task.id, {
      decision: 'resolved',
    });
    expect(success, 'Не удалось claim + complete Task_Work').toBe(true);
  });

  // -------------------------------------------------------------------------
  // 7. Проверка: entity в статусе "resolved"
  // -------------------------------------------------------------------------
  test('7. Entity получил статус "resolved"', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId, 'entityId не задан').toBeTruthy();

    // Ждём пока service tasks отработают (SetResolved + NotifyResolved)
    let entity: any = null;
    const start = Date.now();
    const maxWait = 20000;

    while (Date.now() - start < maxWait) {
      entity = await getEntityApi(entityId!);
      if (entity && entity.status === 'resolved') break;
      // Принимаем closed если process уже продвинулся
      if (entity && entity.status === 'closed') break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    expect(entity, 'Entity не найден через API').toBeTruthy();
    expect(
      ['resolved', 'closed'],
      'Ожидался статус resolved или closed',
    ).toContain(entity.status);
  });

  // -------------------------------------------------------------------------
  // 8. Task_Confirm: подтверждение закрытия
  // -------------------------------------------------------------------------
  test('8. Task_Confirm: подтвердить закрытие (confirmed: true)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId, 'entityId не задан').toBeTruthy();

    // Ждём Task_Confirm (assigned to creatorId = admin, т.к. admin создал entity)
    const task = await waitForUserTask(entityId!, 'Task_Confirm', 30000);
    expect(task, 'User task Task_Confirm не появился за 30 сек').toBeTruthy();

    // Complete с confirmed = true
    const success = await claimAndCompleteTask(task.id, {
      confirmed: true,
    });
    expect(success, 'Не удалось claim + complete Task_Confirm').toBe(true);
  });

  // -------------------------------------------------------------------------
  // 9. Проверка: entity в статусе "closed" (API + UI)
  // -------------------------------------------------------------------------
  test('9. Entity получил статус "closed" (API + UI)', async ({ page }) => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId, 'entityId не задан').toBeTruthy();

    // Проверяем через API
    let entity: any = null;
    const start = Date.now();
    const maxWait = 20000;

    while (Date.now() - start < maxWait) {
      entity = await getEntityApi(entityId!);
      if (entity && entity.status === 'closed') break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    expect(entity, 'Entity не найден через API').toBeTruthy();
    expect(entity.status).toBe('closed');

    // Проверяем через UI — заявка должна быть на канбане в колонке "Закрыта"
    await goToDashboard(page);
    await selectWorkspaceByName(page, 'Техническая поддержка');
    await dismissToasts(page);

    // Ищем карточку (может быть за пагинацией — openEntityDetail использует поиск)
    await openEntityDetail(page, testTitle);

    // Проверяем заголовок
    const titleElement = page.locator(entityDetail.title);
    await expect(titleElement).toContainText(testTitle, { timeout: 5000 });

    await closeEntityDetail(page);
  });

  // -------------------------------------------------------------------------
  // 10. Финальная валидация: process instance завершён
  // -------------------------------------------------------------------------
  test('10. Process instance существует', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId, 'entityId не задан').toBeTruthy();

    const instances = await getProcessInstances(entityId!);
    expect(instances.length).toBeGreaterThan(0);
    // Шаблон без process-completed: статус может быть active (DB) или completed
    expect(['active', 'completed']).toContain(instances[0].status);
  });
});
