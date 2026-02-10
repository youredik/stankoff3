import { test, expect } from '@playwright/test';
import {
  isZeebeAvailable,
  getDevToken,
  createEntityApi,
  getEntityApi,
  getWorkspacesApi,
  waitForProcessInstance,
  waitForUserTask,
  claimAndCompleteTask,
  getProcessInstances,
} from '../helpers/test-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/**
 * Сценарий: Переоткрытие инцидента (incident-management).
 *
 * Процесс BPMN (incident-management):
 *   Start -> SetNew -> Task_Categorize { priority }
 *   -> Gateway_Priority
 *     - critical: EscalateManager -> SetInProgress
 *     - !critical: SetInProgress
 *   -> Task_Investigate { needEscalation }
 *   -> Gateway_NeedEscalation
 *     - true:  Task_L2Support -> Task_Resolve
 *     - false: Task_Resolve
 *   -> Task_Resolve -> SetResolved -> NotifyUser
 *   -> Task_Confirmation { confirmed }
 *   -> Gateway_Confirmed
 *     - true:  Close -> End
 *     - false: -> SetInProgress (loop back!)
 *
 * Тест: Categorize → Investigate → Resolve → Confirm(false) → Investigate → Resolve → Confirm(true) → Closed
 */

let zeebeAvailable = false;
let tpWorkspaceId: string | null = null;
let definitionId: string | null = null;
let adminToken: string | null = null;
let adminUserId: string | null = null;

test.beforeAll(async () => {
  zeebeAvailable = await isZeebeAvailable();
  if (!zeebeAvailable) return;

  adminToken = await getDevToken('admin@stankoff.ru');
  if (!adminToken) return;

  const meRes = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (meRes.ok) {
    const me = await meRes.json();
    adminUserId = me.id;
  }

  // Используем TP workspace
  const workspaces = await getWorkspacesApi();
  const tpWs = workspaces.find(
    (ws: any) => ws.prefix === 'TP' || ws.name === 'Техническая поддержка',
  );
  tpWorkspaceId = tpWs?.id ?? null;
  if (!tpWorkspaceId) return;

  // Проверяем, задеплоен ли incident-management
  const defsRes = await fetch(`${API_URL}/bpmn/definitions/${tpWorkspaceId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!defsRes.ok) return;

  const definitions = await defsRes.json();
  let def = definitions.find((d: any) => d.processId === 'incident-management');

  if (!def) {
    // Загружаем шаблон через templates API
    const templateRes = await fetch(`${API_URL}/bpmn/templates/incident-management`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!templateRes.ok) return;

    // Template endpoint может содержать control characters в XML — parse с обработкой
    const rawText = await templateRes.text();
    let bpmnXml: string;
    try {
      const template = JSON.parse(rawText);
      bpmnXml = template.bpmnXml;
    } catch {
      // Fallback: попытка извлечь XML напрямую
      const match = rawText.match(/"bpmnXml"\s*:\s*"([\s\S]*?)(?:","|\"})/);
      if (!match) return;
      bpmnXml = JSON.parse(`"${match[1]}"`);
    }

    const createRes = await fetch(`${API_URL}/bpmn/definitions/${tpWorkspaceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: 'Управление инцидентами (E2E)',
        processId: 'incident-management',
        bpmnXml,
      }),
    });
    if (!createRes.ok) return;
    def = await createRes.json();
  }

  definitionId = def.id;

  // Деплоим если не задеплоен
  if (!def.deployedKey && !def.zeebeKey) {
    await fetch(`${API_URL}/bpmn/definition/${definitionId}/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ changelog: 'E2E: deploy incident-management' }),
    });
  }
});

test.describe.serial('Сценарий: Переоткрытие инцидента (incident-management)', () => {
  const testTitle = `Playwright Инцидент ${Date.now()}`;
  let entityId: string;

  test('1. Создание entity и запуск процесса', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен — пропуск BPMN тестов');
    expect(tpWorkspaceId, 'Workspace TP не найден').toBeTruthy();
    expect(definitionId, 'Process definition не создан/задеплоен').toBeTruthy();

    const created = await createEntityApi(tpWorkspaceId!, testTitle, { priority: 'medium' });
    expect(created, 'Не удалось создать entity').toBeTruthy();
    entityId = created!.id;

    // Запускаем процесс вручную
    const startRes = await fetch(`${API_URL}/bpmn/instances/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        definitionId,
        entityId,
        variables: {
          entityId,
          workspaceId: tpWorkspaceId,
          creatorId: adminUserId,
          serviceDesk: adminUserId,
          technicianId: adminUserId,
          l2SupportId: adminUserId,
          incidentManagerId: adminUserId,
        },
      }),
    });
    expect(startRes.ok, 'Не удалось запустить процесс').toBe(true);

    const instance = await waitForProcessInstance(entityId, 30000);
    expect(instance, 'Process instance не появился за 30 сек').toBeTruthy();
  });

  test('2. Task_Categorize: priority=medium', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId).toBeTruthy();

    const task = await waitForUserTask(entityId, 'Task_Categorize', 30000);
    expect(task, 'Task_Categorize не появился за 30 сек').toBeTruthy();

    const completed = await claimAndCompleteTask(task.id, { priority: 'medium' });
    expect(completed, 'Не удалось завершить Task_Categorize').toBe(true);
  });

  test('3. Task_Investigate (1-й раз): needEscalation=false', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId).toBeTruthy();

    const task = await waitForUserTask(entityId, 'Task_Investigate', 30000);
    expect(task, 'Task_Investigate не появился').toBeTruthy();

    const completed = await claimAndCompleteTask(task.id, { needEscalation: false });
    expect(completed).toBe(true);
  });

  test('4. Task_Resolve (1-й раз)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId).toBeTruthy();

    const task = await waitForUserTask(entityId, 'Task_Resolve', 30000);
    expect(task, 'Task_Resolve не появился').toBeTruthy();

    const completed = await claimAndCompleteTask(task.id, {});
    expect(completed).toBe(true);
  });

  test('5. Task_Confirmation: confirmed=false (REOPEN)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId).toBeTruthy();

    const task = await waitForUserTask(entityId, 'Task_Confirmation', 30000);
    expect(task, 'Task_Confirmation не появился').toBeTruthy();

    const completed = await claimAndCompleteTask(task.id, { confirmed: false });
    expect(completed, 'Не удалось завершить Task_Confirmation с confirmed=false').toBe(true);

    // Ждём возврата в in_progress
    const maxWait = 15000;
    const start = Date.now();
    let entity: any = null;
    while (Date.now() - start < maxWait) {
      entity = await getEntityApi(entityId);
      if (entity && entity.status === 'in_progress') break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    expect(entity?.status, 'Статус после reopen должен быть in_progress').toBe('in_progress');
  });

  test('6. Task_Investigate (2-й раз, после reopen)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId).toBeTruthy();

    const task = await waitForUserTask(entityId, 'Task_Investigate', 30000);
    expect(task, 'Task_Investigate не появился повторно').toBeTruthy();

    const completed = await claimAndCompleteTask(task.id, { needEscalation: false });
    expect(completed).toBe(true);
  });

  test('7. Task_Resolve (2-й раз)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId).toBeTruthy();

    const task = await waitForUserTask(entityId, 'Task_Resolve', 30000);
    expect(task, 'Task_Resolve не появился повторно').toBeTruthy();

    const completed = await claimAndCompleteTask(task.id, {});
    expect(completed).toBe(true);
  });

  test('8. Task_Confirmation: confirmed=true (закрытие)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId).toBeTruthy();

    const task = await waitForUserTask(entityId, 'Task_Confirmation', 30000);
    expect(task, 'Task_Confirmation не появился повторно').toBeTruthy();

    const completed = await claimAndCompleteTask(task.id, { confirmed: true });
    expect(completed).toBe(true);
  });

  test('9. Финальный статус entity = closed', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId).toBeTruthy();

    const maxWait = 20000;
    const start = Date.now();
    let entity: any = null;
    while (Date.now() - start < maxWait) {
      entity = await getEntityApi(entityId);
      if (entity && entity.status === 'closed') break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    expect(entity?.status).toBe('closed');
  });

  test('10. Process instance существует', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId).toBeTruthy();

    const instances = await getProcessInstances(entityId);
    expect(instances.length).toBeGreaterThan(0);
    // Шаблон без process-completed: статус может быть active (DB) или completed
    expect(['active', 'completed']).toContain(instances[0].status);
  });
});
