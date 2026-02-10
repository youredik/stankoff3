import { test, expect } from '@playwright/test';
import {
  isZeebeAvailable,
  getDevToken,
  getEntityApi,
  getWorkspacesApi,
  createEntityApi,
  waitForProcessInstance,
  waitForUserTask,
  claimAndCompleteTask,
  getProcessInstances,
} from '../helpers/test-utils';

/**
 * Сценарий: Управление рекламациями (claims-management ISO 10002).
 *
 * Процесс BPMN (claims-management):
 *   Start -> LogReceived -> SetReceived -> NotifyHead -> Task_Register (user task)
 *   -> SetRegistered -> Gateway_Valid
 *     - isValid=false: SetRejected -> NotifyRejected -> End_Rejected
 *     - isValid=true:  SetInvestigation -> Task_Investigate (user task) [5d timer]
 *       -> SetRCA -> Task_RCA (user task) -> Gateway_Severity
 *         - severity="critical": EscalateDirector -> SetDecision
 *         - severity!="critical": SetDecision
 *       -> Task_MakeDecision (user task) -> SetCorrective -> Task_Corrective (user task)
 *       -> SetClientNotify -> NotifyClient -> SetClosed -> LogClosed -> End_Closed
 *
 * Тест проверяет happy path (isValid=true, severity="medium"):
 *   Создание через UI -> триггер -> 5 user tasks через API -> закрытие
 *
 * Предусловие: процесс claims-management задеплоен, активный триггер entity_created
 * для workspace "Рекламации".
 */
test.describe.serial('Сценарий: Управление рекламациями (ISO 10002)', () => {
  let zeebeAvailable: boolean;
  let adminUserId: string;
  let workspaceId: string;
  let entityId: string;

  const testTitle = `Playwright Рекламация ${Date.now()}`;

  test.beforeAll(async () => {
    zeebeAvailable = await isZeebeAvailable();
  });

  // ---------------------------------------------------------------------------
  // 1. Setup: проверить Zeebe, получить adminUserId, найти workspace "Рекламации"
  // ---------------------------------------------------------------------------
  test('1. Setup: проверка Zeebe, пользователя и workspace', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен — пропуск BPMN тестов');

    // Получаем admin token и userId
    const token = await getDevToken();
    expect(token, 'Dev token должен быть получен').toBeTruthy();

    const meRes = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/auth/me`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(meRes.ok, 'GET /auth/me должен вернуть 200').toBe(true);
    const meData = await meRes.json();
    adminUserId = meData.id;
    expect(adminUserId, 'adminUserId должен быть определён').toBeTruthy();

    // Находим workspace "Рекламации"
    const workspaces = await getWorkspacesApi();
    expect(workspaces.length, 'Должен быть хотя бы один workspace').toBeGreaterThan(0);

    const rekWorkspace = workspaces.find(
      (ws: any) => /рекламаци/i.test(ws.name) || ws.prefix === 'REK',
    );
    expect(rekWorkspace, 'Workspace "Рекламации" (REK) должен существовать').toBeTruthy();
    workspaceId = rekWorkspace.id;
  });

  // ---------------------------------------------------------------------------
  // 2. Создание рекламации через API
  // ---------------------------------------------------------------------------
  test('2. Создание рекламации через API', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен — пропуск BPMN тестов');
    test.skip(!workspaceId, 'Workspace не найден в setup');

    const created = await createEntityApi(workspaceId, testTitle, { priority: 'high' });
    expect(created, `Не удалось создать entity "${testTitle}"`).toBeTruthy();
    entityId = created!.id;
    expect(entityId, 'entityId должен быть определён').toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // 3. Проверка запуска процесса через триггер
  // ---------------------------------------------------------------------------
  test('3. Проверка автоматического запуска процесса (триггер entity_created)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!entityId, 'Entity не создана');

    const instance = await waitForProcessInstance(entityId, 30000);
    expect(instance, 'Process instance должен быть создан триггером').toBeTruthy();
    expect(instance.status).toBe('active');
  });

  // ---------------------------------------------------------------------------
  // 4. Task_Register: Регистрация рекламации
  // ---------------------------------------------------------------------------
  test('4. Регистрация рекламации (Task_Register)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!entityId, 'Entity не создана');

    const task = await waitForUserTask(entityId, 'Task_Register', 30000);
    expect(task, 'User task Task_Register должна появиться').toBeTruthy();
    expect(task.elementId).toBe('Task_Register');

    const completed = await claimAndCompleteTask(task.id, {
      isValid: true,
      investigatorId: adminUserId,
      claimsHeadId: adminUserId,
    });
    expect(completed, 'Task_Register должна быть завершена с isValid=true').toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 5. Task_Investigate: Расследование
  // ---------------------------------------------------------------------------
  test('5. Расследование (Task_Investigate)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!entityId, 'Entity не создана');

    const task = await waitForUserTask(entityId, 'Task_Investigate', 30000);
    expect(task, 'User task Task_Investigate должна появиться').toBeTruthy();
    expect(task.elementId).toBe('Task_Investigate');

    const completed = await claimAndCompleteTask(task.id, {});
    expect(completed, 'Task_Investigate должна быть завершена').toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 6. Task_RCA: Анализ корневых причин
  // ---------------------------------------------------------------------------
  test('6. Анализ корневых причин (Task_RCA)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!entityId, 'Entity не создана');

    const task = await waitForUserTask(entityId, 'Task_RCA', 30000);
    expect(task, 'User task Task_RCA должна появиться').toBeTruthy();
    expect(task.elementId).toBe('Task_RCA');

    // severity="medium" — не критическая, чтобы не эскалировать на директора
    const completed = await claimAndCompleteTask(task.id, { severity: 'medium' });
    expect(completed, 'Task_RCA должна быть завершена с severity=medium').toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 7. Task_MakeDecision: Принятие решения
  // ---------------------------------------------------------------------------
  test('7. Принятие решения (Task_MakeDecision)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!entityId, 'Entity не создана');

    const task = await waitForUserTask(entityId, 'Task_MakeDecision', 30000);
    expect(task, 'User task Task_MakeDecision должна появиться').toBeTruthy();
    expect(task.elementId).toBe('Task_MakeDecision');

    const completed = await claimAndCompleteTask(task.id, {});
    expect(completed, 'Task_MakeDecision должна быть завершена').toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 8. Task_Corrective: Корректирующие действия
  // ---------------------------------------------------------------------------
  test('8. Корректирующие действия (Task_Corrective)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!entityId, 'Entity не создана');

    const task = await waitForUserTask(entityId, 'Task_Corrective', 30000);
    expect(task, 'User task Task_Corrective должна появиться').toBeTruthy();
    expect(task.elementId).toBe('Task_Corrective');

    const completed = await claimAndCompleteTask(task.id, {});
    expect(completed, 'Task_Corrective должна быть завершена').toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 9. Проверка финального статуса entity
  // ---------------------------------------------------------------------------
  test('9. Проверка финального статуса entity (closed / client_notification)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!entityId, 'Entity не создана');

    // После Task_Corrective процесс автоматически проходит:
    //   SetClientNotify -> NotifyClient -> SetClosed -> LogClosed -> End
    // Ждём, пока статус обновится (service tasks выполняются быстро)
    const maxWaitMs = 30000;
    const start = Date.now();
    let entity: any = null;

    while (Date.now() - start < maxWaitMs) {
      entity = await getEntityApi(entityId);
      if (entity && (entity.status === 'closed' || entity.status === 'client_notification')) {
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    expect(entity, 'Entity должна быть получена через API').toBeTruthy();
    expect(
      ['closed', 'client_notification'],
      'Статус entity должен быть closed или client_notification',
    ).toContain(entity.status);
  });

  // ---------------------------------------------------------------------------
  // 10. Проверка завершения процесса
  // ---------------------------------------------------------------------------
  test('10. Проверка process instance', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!entityId, 'Entity не создана');

    const instances = await getProcessInstances(entityId);
    expect(instances.length, 'Должен быть хотя бы один process instance').toBeGreaterThan(0);
    // Шаблон без process-completed: статус может быть active (DB) или completed
    expect(['active', 'completed']).toContain(instances[0].status);
  });
});
