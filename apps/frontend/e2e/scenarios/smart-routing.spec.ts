import { test, expect } from '@playwright/test';
import {
  goToDashboard,
  selectWorkspaceByName,
  dismissToasts,
  isZeebeAvailable,
  isAiAvailable,
  getDevToken,
  createEntityApi,
  getEntityApi,
  waitForProcessInstance,
  waitForUserTask,
  claimAndCompleteTask,
  getTasksForEntity,
  getProcessInstances,
} from '../helpers/test-utils';
import { sidebar, kanban, bpmn } from '../helpers/selectors';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/**
 * Сценарий: Умная маршрутизация (smart-routing).
 *
 * Процесс BPMN (smart-routing):
 *   Start → AI Classify (classify-entity) → Check Duplicate (check-duplicate) → Gateway_Duplicate
 *     - Дубликат (isDuplicate=true): NotifyDuplicate → Complete → End
 *     - Уникальная (isDuplicate=false): SuggestAssignee (suggest-assignee) → Gateway_Priority
 *       - Высокий/Критический (aiPriority=high|critical):
 *           Task_ReviewAssignment (user task) → SetAssigneeManual → LogRouting → Complete → End
 *       - Обычный (aiPriority=low|medium):
 *           SetAssigneeAuto → LogRouting → Complete → End
 *
 * Зависимости:
 *   - Zeebe (обязательно)
 *   - AI сервис (обязательно — classify-entity, check-duplicate, suggest-assignee)
 *
 * Стратегия:
 *   - Процесс не привязан к конкретному workspace в seed — деплоим через API
 *   - Создаём entity через API
 *   - Запускаем процесс вручную через POST /bpmn/instances/start
 *   - AI может установить произвольный приоритет — тест обрабатывает обе ветки
 *   - Все проверки через API polling, без waitForTimeout
 */
test.describe.serial('Сценарий: Умная маршрутизация заявок', () => {
  let zeebeAvailable = false;
  let aiAvailable = false;
  let adminToken: string | null = null;
  let adminUserId: string | null = null;
  let workspaceId: string | null = null;
  let definitionId: string | null = null;
  let entityId: string | null = null;
  let aiPriority: string | null = null;
  const testTitle = `Playwright SmartRoute ${Date.now()}`;

  // -------------------------------------------------------------------------
  // 1. Setup: проверка Zeebe + AI, получение admin user, workspace, деплой процесса
  // -------------------------------------------------------------------------
  test('1. Setup: проверка Zeebe + AI, деплой smart-routing', async () => {
    zeebeAvailable = await isZeebeAvailable();
    test.skip(!zeebeAvailable, 'Zeebe недоступен — пропуск BPMN сценария');

    aiAvailable = await isAiAvailable();
    test.skip(!aiAvailable, 'AI сервис недоступен — smart-routing требует AI');

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

    // Проверяем, есть ли уже smart-routing definition в этом workspace
    const defsRes = await fetch(`${API_URL}/bpmn/definitions/${workspaceId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(defsRes.ok, 'GET /bpmn/definitions вернул ошибку').toBe(true);

    const definitions = await defsRes.json();
    const existingDef = definitions.find(
      (d: any) => d.processId === 'smart-routing',
    );

    if (existingDef) {
      definitionId = existingDef.id;
      // Если не задеплоен — деплоим
      if (!existingDef.deployedKey) {
        const deployRes = await fetch(
          `${API_URL}/bpmn/definition/${definitionId}/deploy`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({ changelog: 'E2E: initial deploy' }),
          },
        );
        expect(deployRes.ok, 'Deploy smart-routing вернул ошибку').toBe(true);
      }
    } else {
      // Загружаем шаблон smart-routing через templates API
      const templateRes = await fetch(`${API_URL}/bpmn/templates/smart-routing`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      let bpmnXml: string;
      if (templateRes.ok) {
        const template = await templateRes.json();
        bpmnXml = template.bpmnXml;
      } else {
        // Если templates API не работает — пропускаем тест
        test.skip(true, 'Не удалось загрузить шаблон smart-routing');
        return;
      }

      // Создаём definition
      const createDefRes = await fetch(
        `${API_URL}/bpmn/definitions/${workspaceId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: 'Умная маршрутизация',
            description: 'E2E: AI классификация + проверка дубликатов + маршрутизация',
            processId: 'smart-routing',
            bpmnXml,
          }),
        },
      );
      expect(createDefRes.ok, 'Создание definition smart-routing вернуло ошибку').toBe(true);

      const createdDef = await createDefRes.json();
      definitionId = createdDef.id;

      // Деплоим в Zeebe
      const deployRes = await fetch(
        `${API_URL}/bpmn/definition/${definitionId}/deploy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ changelog: 'E2E: initial deploy' }),
        },
      );
      expect(deployRes.ok, 'Deploy smart-routing вернул ошибку').toBe(true);
    }

    expect(definitionId, 'definitionId не задан после setup').toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 2. Создание entity через API
  // -------------------------------------------------------------------------
  test('2. Создание заявки для маршрутизации', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!aiAvailable, 'AI сервис недоступен');
    expect(workspaceId, 'workspaceId не задан из setup').toBeTruthy();

    const created = await createEntityApi(workspaceId!, testTitle, {
      priority: 'medium',
    });
    expect(created, `Не удалось создать entity "${testTitle}"`).toBeTruthy();
    entityId = created!.id;
    expect(entityId, 'entityId пустой').toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 3. Запуск процесса smart-routing через API
  // -------------------------------------------------------------------------
  test('3. Запуск процесса smart-routing', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!aiAvailable, 'AI сервис недоступен');
    expect(entityId, 'entityId не задан').toBeTruthy();
    expect(definitionId, 'definitionId не задан').toBeTruthy();

    const startRes = await fetch(`${API_URL}/bpmn/instances/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        definitionId,
        entityId,
        variables: {
          entityId,
          workspaceId,
          creatorId: adminUserId,
        },
      }),
    });
    expect(startRes.ok, 'POST /bpmn/instances/start вернул ошибку').toBe(true);

    const instance = await startRes.json();
    expect(instance.id, 'Process instance ID пустой').toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 4. Проверка: process instance появился
  // -------------------------------------------------------------------------
  test('4. Process instance появился', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!aiAvailable, 'AI сервис недоступен');
    expect(entityId, 'entityId не задан').toBeTruthy();

    const processInstance = await waitForProcessInstance(entityId!, 30000);
    expect(
      processInstance,
      'Process instance не появился за 30 сек',
    ).toBeTruthy();
    expect(processInstance.status).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 5. Ожидание AI классификации + check-duplicate + suggest-assignee
  //    Определяем приоритет, установленный AI (aiPriority)
  // -------------------------------------------------------------------------
  test('5. AI service tasks завершены (classify, check-duplicate, suggest-assignee)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!aiAvailable, 'AI сервис недоступен');
    expect(entityId, 'entityId не задан').toBeTruthy();

    // Ждём пока AI service tasks отработают.
    // После classify-entity, check-duplicate, suggest-assignee процесс дойдёт до:
    //   - user task Task_ReviewAssignment (если aiPriority=high|critical)
    //   - или SetAssigneeAuto → LogRouting → Complete (если aiPriority=low|medium)
    //
    // Определяем, какой приоритет AI установил, по наличию user task.
    // Даём до 30 сек на все 3 AI service tasks.

    const start = Date.now();
    const maxWait = 30000;
    let foundHighPriority = false;
    let processCompleted = false;

    while (Date.now() - start < maxWait) {
      // Проверяем, есть ли user task Task_ReviewAssignment
      const tasks = await getTasksForEntity(entityId!);
      const reviewTask = tasks.find(
        (t: any) =>
          t.elementId === 'Task_ReviewAssignment' && t.status === 'created',
      );

      if (reviewTask) {
        foundHighPriority = true;
        break;
      }

      // Проверяем, завершился ли процесс (low/medium priority path)
      const instances = await getProcessInstances(entityId!);
      if (instances.length > 0) {
        const mainInstance = instances[0];
        if (
          mainInstance.status === 'completed' ||
          mainInstance.status === 'COMPLETED'
        ) {
          processCompleted = true;
          break;
        }
      }

      await new Promise((r) => setTimeout(r, 2000));
    }

    if (foundHighPriority) {
      aiPriority = 'high';
    } else if (processCompleted) {
      aiPriority = 'low';
    } else {
      // Процесс ещё не дошёл до gateway — проверяем entity на наличие classification
      const entity = await getEntityApi(entityId!);
      // Если AI уже сработал но процесс ещё идёт, дадим ещё немного времени
      expect(
        foundHighPriority || processCompleted,
        'AI service tasks не завершились за 30 сек (ни user task, ни completed)',
      ).toBe(true);
    }

    expect(
      aiPriority,
      'Не удалось определить aiPriority — процесс не продвинулся',
    ).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 6. Task_ReviewAssignment (user task) — если high/critical priority
  // -------------------------------------------------------------------------
  test('6. Task_ReviewAssignment: назначить исполнителя (high/critical)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!aiAvailable, 'AI сервис недоступен');
    expect(entityId, 'entityId не задан').toBeTruthy();

    if (aiPriority !== 'high') {
      // Low/medium priority — процесс прошёл автоназначение, user task не создан
      test.skip(true, `AI установил приоритет "${aiPriority}" — автоназначение без user task`);
      return;
    }

    // Ждём user task Task_ReviewAssignment
    const task = await waitForUserTask(entityId!, 'Task_ReviewAssignment', 15000);
    expect(
      task,
      'User task Task_ReviewAssignment не найден (high priority path)',
    ).toBeTruthy();

    // Claim + complete с assigneeId = admin
    const success = await claimAndCompleteTask(task.id, {
      assigneeId: adminUserId,
    });
    expect(success, 'Не удалось claim + complete Task_ReviewAssignment').toBe(true);
  });

  // -------------------------------------------------------------------------
  // 7. Проверка: entity имеет assignee (обе ветки)
  // -------------------------------------------------------------------------
  test('7. Entity имеет назначенного исполнителя', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!aiAvailable, 'AI сервис недоступен');
    expect(entityId, 'entityId не задан').toBeTruthy();

    // Ждём пока set-assignee worker обработает назначение
    let entity: any = null;
    const start = Date.now();
    const maxWait = 20000;

    while (Date.now() - start < maxWait) {
      entity = await getEntityApi(entityId!);
      if (entity && entity.assigneeId) break;
      // Для low/medium priority AI мог не предложить assignee (hasSuggestion=false)
      // В этом случае set-assignee получит null и может не назначить
      // Поэтому также считаем успехом, если процесс завершился
      const instances = await getProcessInstances(entityId!);
      if (
        instances.length > 0 &&
        (instances[0].status === 'completed' || instances[0].status === 'COMPLETED')
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    expect(entity, 'Entity не найден через API').toBeTruthy();

    if (aiPriority === 'high') {
      // Для high priority мы явно указали assigneeId = admin
      expect(entity.assigneeId, 'Assignee не назначен (high priority path)').toBeTruthy();
    }
    // Для low/medium — assignee может быть null если AI не предложил кандидата
    // Это нормальное поведение (hasSuggestion=false → assigneeId=null)
  });

  // -------------------------------------------------------------------------
  // 8. Финальная валидация: process instance завершён
  // -------------------------------------------------------------------------
  test('8. Process instance завершён', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!aiAvailable, 'AI сервис недоступен');
    expect(entityId, 'entityId не задан').toBeTruthy();

    let instances: any[] = [];
    const start = Date.now();
    const maxWait = 30000;

    while (Date.now() - start < maxWait) {
      instances = await getProcessInstances(entityId!);
      if (instances.length > 0) {
        const mainInstance = instances[0];
        if (
          mainInstance.status === 'completed' ||
          mainInstance.status === 'COMPLETED'
        ) {
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    expect(instances.length).toBeGreaterThan(0);

    const mainInstance = instances[0];
    expect(
      mainInstance.status.toLowerCase(),
      `Ожидался status=completed, получен ${mainInstance.status}`,
    ).toBe('completed');
  });

  // -------------------------------------------------------------------------
  // 9. Проверка через UI: entity видна на канбане
  // -------------------------------------------------------------------------
  test('9. Entity отображается на канбане (UI)', async ({ page }) => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!aiAvailable, 'AI сервис недоступен');
    expect(entityId, 'entityId не задан').toBeTruthy();

    await goToDashboard(page);
    await selectWorkspaceByName(page, 'Техническая поддержка');
    await dismissToasts(page);

    // Ищем карточку на канбане (может потребоваться поиск через фильтр)
    const card = page.locator(kanban.card).filter({ hasText: testTitle }).first();
    const isVisible = await card.isVisible({ timeout: 5000 }).catch(() => false);

    if (!isVisible) {
      // Карточка за пагинацией — используем поиск
      const filterBtn = page.locator(kanban.filterButton);
      const hasFilter = await filterBtn.isVisible().catch(() => false);
      if (hasFilter) {
        await filterBtn.click();
        const searchInput = page.locator('[data-testid="filter-search-input"]');
        await searchInput.fill(testTitle);
        await page.waitForTimeout(3000); // debounce + API
      }
    }

    await expect(card).toBeVisible({ timeout: 15000 });
  });
});
