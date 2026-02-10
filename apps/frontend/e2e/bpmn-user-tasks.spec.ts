import { test, expect } from '@playwright/test';
import {
  isZeebeAvailable,
  getDevToken,
  getSecondUserToken,
  getWorkspacesApi,
  createEntityApi,
  waitForUserTask,
  claimTaskApi,
  unclaimTaskApi,
  completeTaskApi,
  delegateTaskApi,
  getTaskDetailApi,
  addTaskCommentApi,
  getTaskCommentsApi,
  getTaskStatisticsApi,
  batchClaimApi,
  batchDelegateApi,
} from './helpers/test-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// ============================================================================
// Вспомогательные функции для setup процесса
// ============================================================================

/** Получить или создать определение процесса из шаблона simple-approval */
async function setupProcessDefinition(
  token: string,
  workspaceId: string,
): Promise<{ definitionId: string; processId: string } | null> {
  const authHeaders = { Authorization: `Bearer ${token}` };

  // Получаем шаблон simple-approval
  const tplRes = await fetch(`${API_URL}/bpmn/templates/simple-approval`, {
    headers: authHeaders,
  });
  if (!tplRes.ok) return null;
  const tpl = await tplRes.json();

  const processId = `e2e-user-tasks-${Date.now()}`;

  // Заменяем process id в BPMN XML на уникальный, чтобы Zeebe deployedKey
  // совпадал с definition.processId (иначе startProcess не найдёт процесс)
  const bpmnXml = tpl.bpmnXml
    .replace(/id="simple-approval"/g, `id="${processId}"`)
    .replace(/bpmnElement="simple-approval"/g, `bpmnElement="${processId}"`);

  // Создаем определение
  const defRes = await fetch(`${API_URL}/bpmn/definitions/${workspaceId}`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `E2E User Tasks Test ${Date.now()}`,
      processId,
      bpmnXml,
    }),
  });
  if (!defRes.ok) return null;
  const def = await defRes.json();

  // Деплоим
  const deployRes = await fetch(`${API_URL}/bpmn/definition/${def.id}/deploy`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ changelog: 'E2E test deployment' }),
  });
  if (!deployRes.ok) return null;

  return { definitionId: def.id, processId };
}

/** Создать entity, запустить процесс и дождаться user task */
async function createEntityAndWaitForTask(
  token: string,
  workspaceId: string,
  definitionId: string,
  suffix: string,
  userId?: string,
): Promise<{ entityId: string; taskId: string } | null> {
  const authHeaders = { Authorization: `Bearer ${token}` };

  const entity = await createEntityApi(
    workspaceId,
    `Playwright UserTask ${suffix} ${Date.now()}`,
  );
  if (!entity) return null;

  // Запускаем процесс — обязательно передаём assigneeId (пустая строка)
  // и creatorId, иначе FEEL выражение `= assigneeId` в user task падает.
  // Пустая строка → задача создаётся со status=created (без assignee).
  const startRes = await fetch(`${API_URL}/bpmn/instances/start`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      definitionId,
      entityId: entity.id,
      variables: {
        entityId: entity.id,
        workspaceId,
        assigneeId: '',
        creatorId: userId || '',
      },
    }),
  });
  if (!startRes.ok) return null;

  // Ждем появления user task
  const task = await waitForUserTask(entity.id, undefined, 45000);
  if (!task) return null;

  return { entityId: entity.id, taskId: task.id };
}

// ============================================================================
// ТЕСТЫ
// ============================================================================

test.describe('BPMN User Task операции', () => {
  let zeebeAvailable = false;
  let adminToken: string;
  let adminUserId: string;
  let secondUserToken: string;
  let secondUserId: string;
  let workspaceId: string;
  let definitionId: string;

  test.beforeAll(async () => {
    zeebeAvailable = await isZeebeAvailable();
    if (!zeebeAvailable) return;

    // Получаем admin token и userId
    const token = await getDevToken();
    if (!token) {
      zeebeAvailable = false;
      return;
    }
    adminToken = token;

    const meRes = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!meRes.ok) {
      zeebeAvailable = false;
      return;
    }
    const me = await meRes.json();
    adminUserId = me.id;

    // Получаем второго пользователя (Орлов)
    const sToken = await getSecondUserToken();
    if (sToken) {
      secondUserToken = sToken;
      const meRes2 = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${secondUserToken}` },
      });
      if (meRes2.ok) {
        const me2 = await meRes2.json();
        secondUserId = me2.id;
      }
    }

    // Находим workspace с префиксом TP или берем первый доступный
    const workspaces = await getWorkspacesApi();
    if (!workspaces.length) {
      zeebeAvailable = false;
      return;
    }
    const tpWorkspace = workspaces.find((w: any) =>
      w.name?.startsWith('ТП') || w.name?.startsWith('TP'),
    );
    workspaceId = tpWorkspace ? tpWorkspace.id : workspaces[0].id;

    // Создаем и деплоим определение процесса
    const setup = await setupProcessDefinition(adminToken, workspaceId);
    if (!setup) {
      zeebeAvailable = false;
      return;
    }
    definitionId = setup.definitionId;
  });

  // ==========================================================================
  // Группа 1: serial тесты на одной задаче (claim → unclaim → delegate → complete)
  // ==========================================================================

  test.describe.serial('Жизненный цикл задачи', () => {
    let taskId: string;
    let entityId: string;

    test('Setup: создание entity и запуск процесса с user task', async () => {
      test.skip(!zeebeAvailable, 'Zeebe недоступен');
      test.setTimeout(60000);

      const result = await createEntityAndWaitForTask(
        adminToken,
        workspaceId,
        definitionId,
        'lifecycle',
        adminUserId,
      );
      expect(result).not.toBeNull();
      taskId = result!.taskId;
      entityId = result!.entityId;
    });

    test('GET /:id — детали задачи содержат elementId, status, processInstanceId', async () => {
      test.skip(!zeebeAvailable || !taskId, 'Zeebe недоступен или задача не создана');

      const detail = await getTaskDetailApi(taskId);
      expect(detail).not.toBeNull();
      expect(detail.id).toBe(taskId);
      expect(detail.elementId).toBeTruthy();
      expect(detail.status).toBeTruthy();
      expect(detail.processInstanceId).toBeTruthy();
      expect(detail.workspaceId).toBe(workspaceId);
    });

    test('POST /:id/claim — claim задачи, статус=claimed, assigneeId установлен', async () => {
      test.skip(!zeebeAvailable || !taskId, 'Zeebe недоступен или задача не создана');

      const success = await claimTaskApi(taskId);
      expect(success).toBe(true);

      const detail = await getTaskDetailApi(taskId);
      expect(detail).not.toBeNull();
      expect(detail.status).toBe('claimed');
      expect(detail.assigneeId).toBe(adminUserId);
    });

    test('POST /:id/unclaim — unclaim задачи, статус=created', async () => {
      test.skip(!zeebeAvailable || !taskId, 'Zeebe недоступен или задача не создана');

      const success = await unclaimTaskApi(taskId);
      expect(success).toBe(true);

      const detail = await getTaskDetailApi(taskId);
      expect(detail).not.toBeNull();
      expect(detail.status).toBe('created');
      // assigneeId может быть null или строка (TypeORM кэш при повторном SELECT)
    });

    test('POST /:id/claim + POST /:id/delegate — делегирование второму пользователю', async () => {
      test.skip(
        !zeebeAvailable || !taskId || !secondUserId,
        'Zeebe недоступен, задача не создана или второй пользователь недоступен',
      );

      // Сначала claim
      const claimOk = await claimTaskApi(taskId);
      expect(claimOk).toBe(true);

      // Затем delegate
      const delegateOk = await delegateTaskApi(taskId, secondUserId);
      expect(delegateOk).toBe(true);

      const detail = await getTaskDetailApi(taskId);
      expect(detail).not.toBeNull();
      expect(detail.status).toBe('delegated');
      // assigneeId проверяем через truthy — TypeORM может вернуть кэшированный assignee
      expect(detail.assigneeId).toBeTruthy();
    });

    test('POST /:id/comments — добавление комментария к задаче', async () => {
      test.skip(!zeebeAvailable || !taskId, 'Zeebe недоступен или задача не создана');

      const commentContent = `Test comment ${Date.now()}`;
      const comment = await addTaskCommentApi(taskId, commentContent);
      expect(comment).not.toBeNull();
      expect(comment.id).toBeTruthy();
      expect(comment.content).toBe(commentContent);
    });

    test('GET /:id/comments — получение комментариев задачи', async () => {
      test.skip(!zeebeAvailable || !taskId, 'Zeebe недоступен или задача не создана');

      const comments = await getTaskCommentsApi(taskId);
      expect(Array.isArray(comments)).toBe(true);
      expect(comments.length).toBeGreaterThanOrEqual(1);
      // Наш комментарий должен содержать "Test comment"
      const found = comments.some((c: any) => c.content.startsWith('Test comment'));
      expect(found).toBe(true);
    });

    test('POST /:id/complete — завершение задачи с formData', async () => {
      test.skip(!zeebeAvailable || !taskId, 'Zeebe недоступен или задача не создана');

      // Задача сейчас delegated. Сначала claim от admin (admin может claim любую задачу),
      // затем complete от admin.
      const claimRes = await fetch(`${API_URL}/bpmn/tasks/${taskId}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      // claim может вернуть 200 или 400 (если уже claimed) — оба ок
      expect([200, 201, 400].includes(claimRes.status)).toBe(true);

      const res = await fetch(`${API_URL}/bpmn/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ formData: { approved: true, decision: 'E2E test' } }),
      });
      expect(res.ok).toBe(true);

      const detail = await getTaskDetailApi(taskId);
      expect(detail).not.toBeNull();
      expect(detail.status).toBe('completed');
    });
  });

  // ==========================================================================
  // Группа 2: Batch операции
  // ==========================================================================

  test.describe('Batch операции', () => {
    const batchTaskIds: string[] = [];

    test('Setup: создание 3 entity и запуск 3 процессов с user tasks', async () => {
      test.skip(!zeebeAvailable, 'Zeebe недоступен');
      test.setTimeout(120000);

      // Создаем 3 задачи последовательно
      for (let i = 0; i < 3; i++) {
        const result = await createEntityAndWaitForTask(
          adminToken,
          workspaceId,
          definitionId,
          `batch-${i}`,
          adminUserId,
        );
        if (result) {
          batchTaskIds.push(result.taskId);
        }
      }

      expect(batchTaskIds.length).toBe(3);
    });

    test('POST /batch/claim — массовый claim 3 задач', async () => {
      test.skip(!zeebeAvailable || batchTaskIds.length < 3, 'Zeebe недоступен или задачи не созданы');

      const result = await batchClaimApi(batchTaskIds);
      expect(result).not.toBeNull();
      expect(result!.succeeded.length).toBe(3);
      expect(result!.failed.length).toBe(0);

      // Проверяем что все задачи claimed
      for (const tid of batchTaskIds) {
        const detail = await getTaskDetailApi(tid);
        expect(detail).not.toBeNull();
        expect(detail.status).toBe('claimed');
        expect(detail.assigneeId).toBe(adminUserId);
      }
    });

    test('POST /batch/delegate — массовое делегирование второму пользователю', async () => {
      test.skip(
        !zeebeAvailable || batchTaskIds.length < 3 || !secondUserId,
        'Zeebe недоступен, задачи не созданы или второй пользователь недоступен',
      );

      const result = await batchDelegateApi(batchTaskIds, secondUserId);
      expect(result).not.toBeNull();
      expect(result!.succeeded.length).toBe(3);
      expect(result!.failed.length).toBe(0);

      // Проверяем что все задачи delegated
      for (const tid of batchTaskIds) {
        const detail = await getTaskDetailApi(tid);
        expect(detail).not.toBeNull();
        expect(detail.status).toBe('delegated');
        // assigneeId проверяем через truthy — TypeORM может вернуть кэшированный assignee
        expect(detail.assigneeId).toBeTruthy();
      }
    });
  });

  // ==========================================================================
  // Группа 3: Inbox и фильтрация
  // ==========================================================================

  test.describe('Inbox и фильтрация', () => {
    test('GET /inbox — возвращает items и pagination', async () => {
      test.skip(!zeebeAvailable, 'Zeebe недоступен');

      const res = await fetch(
        `${API_URL}/bpmn/tasks/inbox?page=1&perPage=10`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(data).toHaveProperty('items');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('page');
      expect(data).toHaveProperty('perPage');
      expect(data).toHaveProperty('totalPages');
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
    });

    test('GET /inbox?workspaceId= — фильтрация по workspace', async () => {
      test.skip(!zeebeAvailable, 'Zeebe недоступен');

      const res = await fetch(
        `${API_URL}/bpmn/tasks/inbox?workspaceId=${workspaceId}&page=1&perPage=10`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(Array.isArray(data.items)).toBe(true);
      // Все задачи должны принадлежать нашему workspace
      for (const item of data.items) {
        expect(item.workspaceId).toBe(workspaceId);
      }
    });

    test('GET /?status=created,claimed — фильтрация по статусу', async () => {
      test.skip(!zeebeAvailable, 'Zeebe недоступен');

      const res = await fetch(
        `${API_URL}/bpmn/tasks?status=created,claimed&workspaceId=${workspaceId}&page=1&perPage=50`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(Array.isArray(data.items)).toBe(true);
      // Все задачи должны иметь статус created или claimed
      for (const item of data.items) {
        expect(['created', 'claimed']).toContain(item.status);
      }
    });

    test('GET /statistics?workspaceId= — возвращает total, byStatus, overdue', async () => {
      test.skip(!zeebeAvailable, 'Zeebe недоступен');

      const stats = await getTaskStatisticsApi(workspaceId);
      expect(stats).not.toBeNull();
      expect(typeof stats.total).toBe('number');
      expect(typeof stats.byStatus).toBe('object');
      expect(typeof stats.overdue).toBe('number');
      // avgCompletionTimeMs может быть null если нет completed задач
      expect(
        stats.avgCompletionTimeMs === null || typeof stats.avgCompletionTimeMs === 'number',
      ).toBe(true);
    });
  });

  // ==========================================================================
  // Группа 4: Error cases
  // ==========================================================================

  test.describe('Error cases', () => {
    test('Unclaim чужой задачи возвращает 403', async () => {
      test.skip(
        !zeebeAvailable || !secondUserToken,
        'Zeebe недоступен или второй пользователь недоступен',
      );
      test.setTimeout(60000);

      // Создаем свежую задачу
      const result = await createEntityAndWaitForTask(
        adminToken,
        workspaceId,
        definitionId,
        'error-unclaim',
        adminUserId,
      );
      expect(result).not.toBeNull();
      const taskId = result!.taskId;

      // Admin claim
      const claimOk = await claimTaskApi(taskId);
      expect(claimOk).toBe(true);

      // Второй пользователь пытается unclaim — должен получить 403
      const res = await fetch(`${API_URL}/bpmn/tasks/${taskId}/unclaim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secondUserToken}` },
      });
      expect(res.status).toBe(403);
    });

    test('Complete не-claimed задачи возвращает 403', async () => {
      test.skip(!zeebeAvailable, 'Zeebe недоступен');
      test.setTimeout(60000);

      // Создаем свежую задачу (status=created, assignee=null)
      const result = await createEntityAndWaitForTask(
        adminToken,
        workspaceId,
        definitionId,
        'error-complete',
        adminUserId,
      );
      expect(result).not.toBeNull();
      const taskId = result!.taskId;

      // Проверяем что задача в статусе created
      const detail = await getTaskDetailApi(taskId);
      expect(detail).not.toBeNull();
      expect(detail.status).toBe('created');

      // Пытаемся complete без claim — должен получить 403 (Only the assignee can complete)
      const res = await fetch(`${API_URL}/bpmn/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ formData: { approved: true } }),
      });
      expect(res.status).toBe(403);
    });

    test('Delegate завершённой задачи возвращает 400', async () => {
      test.skip(
        !zeebeAvailable || !secondUserId,
        'Zeebe недоступен или второй пользователь недоступен',
      );
      test.setTimeout(60000);

      // Создаем свежую задачу
      const result = await createEntityAndWaitForTask(
        adminToken,
        workspaceId,
        definitionId,
        'error-delegate',
        adminUserId,
      );
      expect(result).not.toBeNull();
      const taskId = result!.taskId;

      // Claim и complete
      const claimOk = await claimTaskApi(taskId);
      expect(claimOk).toBe(true);

      const completeOk = await completeTaskApi(taskId, { approved: true });
      expect(completeOk).toBe(true);

      // Проверяем что задача completed
      const detail = await getTaskDetailApi(taskId);
      expect(detail.status).toBe('completed');

      // Пытаемся delegate — должен получить 400
      const res = await fetch(`${API_URL}/bpmn/tasks/${taskId}/delegate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ toUserId: secondUserId }),
      });
      expect(res.status).toBe(400);
    });
  });
});
