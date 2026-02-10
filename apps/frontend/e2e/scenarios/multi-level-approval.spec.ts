import { test, expect } from '@playwright/test';
import {
  isZeebeAvailable,
  getDevToken,
  createEntityApi,
  getEntityApi,
  waitForProcessInstance,
  waitForUserTask,
  claimAndCompleteTask,
  getProcessInstances,
  getWorkspacesApi,
} from '../helpers/test-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/**
 * Сценарий: Многоуровневое согласование (multi-level-approval).
 *
 * BPMN-процесс (multi-level-approval):
 *   Start -> SetStatus(level1_review)
 *     -> Task_Level1 (user task) { decision: "approve" | "reject" }
 *       - reject -> SetStatus(rejected) -> Notify -> End
 *     -> SetStatus(level2_review)
 *     -> Task_Level2 (user task) { decision: "approve" | "reject" }
 *       - reject -> SetStatus(rejected) -> Notify -> End
 *     -> SetStatus(level3_review)
 *     -> Task_Level3 (user task) { decision: "approve" | "reject" }
 *       - reject -> SetStatus(rejected) -> Notify -> End
 *     -> SetStatus(approved) -> Notify -> End
 *
 * Процесс деплоится вручную (нет автотриггера для multi-level-approval).
 * Запуск через POST /bpmn/instances/start.
 *
 * Группа 1: Happy path — все 3 уровня одобряют -> approved
 * Группа 2: Reject path — одобрение L1, отклонение L2 -> rejected
 */

let zeebeAvailable = false;
let finWorkspaceId: string | null = null;
let definitionId: string | null = null;
let adminToken: string | null = null;
let adminUserId: string | null = null;

test.beforeAll(async () => {
  zeebeAvailable = await isZeebeAvailable();
  if (!zeebeAvailable) return;

  adminToken = await getDevToken('admin@stankoff.ru');
  if (!adminToken) return;

  // Получаем admin user ID
  const meRes = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (meRes.ok) {
    const me = await meRes.json();
    adminUserId = me.id;
  }

  // Находим FIN workspace
  const workspaces = await getWorkspacesApi();
  const finWs = workspaces.find(
    (ws: any) => ws.prefix === 'FIN' || ws.name === 'Согласование расходов',
  );
  finWorkspaceId = finWs?.id ?? null;
  if (!finWorkspaceId) return;

  // Проверяем, задеплоен ли multi-level-approval в FIN
  const defsRes = await fetch(`${API_URL}/bpmn/definitions/${finWorkspaceId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!defsRes.ok) return;

  const definitions = await defsRes.json();
  let def = definitions.find((d: any) => d.processId === 'multi-level-approval');

  if (!def) {
    // Загружаем шаблон multi-level-approval
    const templateRes = await fetch(`${API_URL}/bpmn/templates/multi-level-approval`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!templateRes.ok) return;
    const template = await templateRes.json();

    // Создаём definition
    const createRes = await fetch(`${API_URL}/bpmn/definitions/${finWorkspaceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: 'Многоуровневое согласование (E2E)',
        processId: 'multi-level-approval',
        bpmnXml: template.bpmnXml,
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
      body: JSON.stringify({ changelog: 'E2E: deploy multi-level-approval' }),
    });
  }
});

/** Создать entity и запустить процесс вручную */
async function createAndStartProcess(title: string): Promise<{ entityId: string } | null> {
  if (!finWorkspaceId || !definitionId || !adminToken || !adminUserId) return null;

  const created = await createEntityApi(finWorkspaceId, title, { priority: 'high' });
  if (!created) return null;

  // Запускаем процесс вручную (все approver'ы = admin для E2E)
  const startRes = await fetch(`${API_URL}/bpmn/instances/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      definitionId,
      entityId: created.id,
      variables: {
        entityId: created.id,
        workspaceId: finWorkspaceId,
        creatorId: adminUserId,
        level1ApproverId: adminUserId,
        level2ApproverId: adminUserId,
        level3ApproverId: adminUserId,
      },
    }),
  });

  if (!startRes.ok) return null;
  return { entityId: created.id };
}

// ============================================================================
// Группа 1: Happy path — все уровни одобряют
// ============================================================================
test.describe.serial('Happy path: все уровни одобряют', () => {
  const approveTitle = `Playwright Согласование ОК ${Date.now()}`;
  let entityId: string;

  test('Создание заявки и запуск процесса', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен — пропуск BPMN тестов');
    expect(finWorkspaceId, 'Workspace FIN не найден').toBeTruthy();
    expect(definitionId, 'Process definition не создан').toBeTruthy();

    const result = await createAndStartProcess(approveTitle);
    expect(result, 'Не удалось создать entity и запустить процесс').not.toBeNull();
    entityId = result!.entityId;
  });

  test('Процесс активен', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId).toBeTruthy();

    const instance = await waitForProcessInstance(entityId, 30000);
    expect(instance, 'Process instance не появился за 30 сек').not.toBeNull();
  });

  test('Уровень 1: одобрение (Task_Level1)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId).toBeTruthy();

    const task = await waitForUserTask(entityId, 'Task_Level1', 30000);
    expect(task, 'User task Task_Level1 не появился за 30 сек').not.toBeNull();

    const completed = await claimAndCompleteTask(task.id, { decision: 'approve' });
    expect(completed, 'Не удалось завершить Task_Level1').toBe(true);
  });

  test('Уровень 2: одобрение (Task_Level2)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId).toBeTruthy();

    const task = await waitForUserTask(entityId, 'Task_Level2', 30000);
    expect(task, 'User task Task_Level2 не появился за 30 сек').not.toBeNull();

    const completed = await claimAndCompleteTask(task.id, { decision: 'approve' });
    expect(completed, 'Не удалось завершить Task_Level2').toBe(true);
  });

  test('Уровень 3: одобрение (Task_Level3)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId).toBeTruthy();

    const task = await waitForUserTask(entityId, 'Task_Level3', 30000);
    expect(task, 'User task Task_Level3 не появился за 30 сек').not.toBeNull();

    const completed = await claimAndCompleteTask(task.id, { decision: 'approve' });
    expect(completed, 'Не удалось завершить Task_Level3').toBe(true);
  });

  test('Финальный статус entity = approved', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId).toBeTruthy();

    const maxWait = 20000;
    const start = Date.now();
    let entity: any = null;

    while (Date.now() - start < maxWait) {
      entity = await getEntityApi(entityId);
      if (entity && entity.status === 'approved') break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    expect(entity, 'Entity не найден').not.toBeNull();
    expect(entity.status).toBe('approved');
  });

  test('Process instance существует', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId).toBeTruthy();

    const instances = await getProcessInstances(entityId);
    expect(instances.length).toBeGreaterThan(0);
    // Шаблон без process-completed: статус может быть active (DB) или completed
    expect(['active', 'completed']).toContain(instances[0].status);
  });
});

// ============================================================================
// Группа 2: Reject path — отклонение на уровне 2
// ============================================================================
test.describe.serial('Reject path: отклонение на уровне 2', () => {
  const rejectTitle = `Playwright Согласование REJECT ${Date.now()}`;
  let entityId: string;

  test('Создание заявки и запуск процесса', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен — пропуск BPMN тестов');
    expect(finWorkspaceId, 'Workspace FIN не найден').toBeTruthy();
    expect(definitionId, 'Process definition не создан').toBeTruthy();

    const result = await createAndStartProcess(rejectTitle);
    expect(result, 'Не удалось создать entity и запустить процесс').not.toBeNull();
    entityId = result!.entityId;
  });

  test('Уровень 1: одобрение (Task_Level1)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId).toBeTruthy();

    const task = await waitForUserTask(entityId, 'Task_Level1', 30000);
    expect(task, 'User task Task_Level1 не появился за 30 сек').not.toBeNull();

    const completed = await claimAndCompleteTask(task.id, { decision: 'approve' });
    expect(completed, 'Не удалось завершить Task_Level1').toBe(true);
  });

  test('Уровень 2: отклонение (Task_Level2)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId).toBeTruthy();

    const task = await waitForUserTask(entityId, 'Task_Level2', 30000);
    expect(task, 'User task Task_Level2 не появился за 30 сек').not.toBeNull();

    const completed = await claimAndCompleteTask(task.id, { decision: 'reject' });
    expect(completed, 'Не удалось завершить Task_Level2 с отклонением').toBe(true);
  });

  test('Финальный статус entity = rejected', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(entityId).toBeTruthy();

    const maxWait = 20000;
    const start = Date.now();
    let entity: any = null;

    while (Date.now() - start < maxWait) {
      entity = await getEntityApi(entityId);
      if (entity && entity.status === 'rejected') break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    expect(entity, 'Entity не найден').not.toBeNull();
    expect(entity.status).toBe('rejected');
  });
});
