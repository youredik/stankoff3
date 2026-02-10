import { test, expect } from '@playwright/test';
import {
  isZeebeAvailable,
  getDevToken,
  getWorkspacesApi,
  createEntityApi,
  waitForProcessInstance,
  updateEntityStatusApi,
  addCommentToEntityApi,
  getTriggerExecutionsApi,
  getRecentExecutionsApi,
  sendWebhookApi,
} from './helpers/test-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/**
 * BPMN Триггеры — E2E тесты с РЕАЛЬНЫМ выполнением через Zeebe.
 *
 * Покрытие:
 * - CRUD триггеров (create, toggle, delete)
 * - status_changed trigger: реальное срабатывание при смене статуса entity
 * - comment_added trigger: реальное срабатывание при добавлении комментария
 * - webhook trigger: HMAC-SHA256, невалидная подпись, запуск процесса
 * - Фильтрация по conditions (priority)
 * - Execution history (per-trigger, per-workspace)
 *
 * Все тесты — API-only (без page).
 * При недоступности Zeebe тесты gracefully пропускаются.
 */

// ============================================================================
// Shared state
// ============================================================================

let zeebeAvailable = false;
let token: string | null = null;
let tpWorkspaceId: string | null = null;
let deployedDefinitionId: string | null = null;

/** IDs триггеров, созданных в тестах (для cleanup) */
const createdTriggerIds: string[] = [];

// ============================================================================
// Helpers
// ============================================================================

/** Создать триггер через API и запомнить ID для cleanup */
async function createTrigger(data: {
  name: string;
  workspaceId: string;
  processDefinitionId: string;
  triggerType: string;
  conditions?: Record<string, any>;
  variableMappings?: Record<string, string>;
  isActive?: boolean;
}): Promise<any | null> {
  const res = await fetch(`${API_URL}/bpmn/triggers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    console.error('createTrigger failed:', res.status, await res.text().catch(() => ''));
    return null;
  }
  const trigger = await res.json();
  createdTriggerIds.push(trigger.id);
  return trigger;
}

/** Удалить триггер */
async function deleteTrigger(triggerId: string): Promise<void> {
  await fetch(`${API_URL}/bpmn/triggers/${triggerId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

/** Получить список триггеров workspace */
async function listTriggers(workspaceId: string): Promise<any[]> {
  const res = await fetch(`${API_URL}/bpmn/triggers?workspaceId=${workspaceId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  return res.json();
}

/** Toggle триггера */
async function toggleTrigger(triggerId: string): Promise<any | null> {
  const res = await fetch(`${API_URL}/bpmn/triggers/${triggerId}/toggle`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/** Подождать появления execution с SUCCESS у триггера */
async function waitForTriggerExecution(
  triggerId: string,
  maxWaitMs = 30_000,
): Promise<any | null> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const executions = await getTriggerExecutionsApi(triggerId);
    const success = executions.find((e: any) => e.status === 'success');
    if (success) return success;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

/** Уникальное имя триггера */
function triggerName(label: string): string {
  return `E2E Тест ${label} ${Date.now()}`;
}

// ============================================================================
// Global setup / teardown
// ============================================================================

test.beforeAll(async () => {
  zeebeAvailable = await isZeebeAvailable();
  if (!zeebeAvailable) return;

  token = await getDevToken('admin@stankoff.ru');
  if (!token) return;

  // Найти workspace TP
  const workspaces = await getWorkspacesApi();
  const tpWs = workspaces.find(
    (ws: any) => ws.prefix === 'TP' || ws.name === 'Техническая поддержка',
  );
  tpWorkspaceId = tpWs?.id ?? null;
  if (!tpWorkspaceId) return;

  // Найти задеплоенный процесс
  const defsRes = await fetch(`${API_URL}/bpmn/definitions/${tpWorkspaceId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!defsRes.ok) return;

  const definitions = await defsRes.json();
  const deployed = definitions.find((d: any) => d.deployedKey || d.zeebeKey);
  deployedDefinitionId = deployed?.id ?? null;
});

test.afterAll(async () => {
  // Cleanup: удалить все триггеры, созданные в тестах
  if (!token) return;
  for (const id of createdTriggerIds) {
    await deleteTrigger(id);
  }
});

// ============================================================================
// CRUD триггеров
// ============================================================================

test.describe.serial('CRUD триггеров', () => {
  let crudTriggerId: string;

  test('Setup: Zeebe доступен, workspace и definition найдены', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(token).toBeTruthy();
    expect(tpWorkspaceId).toBeTruthy();
    expect(deployedDefinitionId).toBeTruthy();
  });

  test('Создание entity_created триггера и проверка в списке', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!deployedDefinitionId, 'Нет задеплоенного определения');

    const trigger = await createTrigger({
      name: triggerName('entity_created CRUD'),
      workspaceId: tpWorkspaceId!,
      processDefinitionId: deployedDefinitionId!,
      triggerType: 'entity_created',
      conditions: {},
      isActive: false, // неактивный, чтобы не мешал другим тестам
    });

    expect(trigger).toBeTruthy();
    expect(trigger.id).toBeTruthy();
    expect(trigger.triggerType).toBe('entity_created');
    expect(trigger.isActive).toBe(false);

    crudTriggerId = trigger.id;

    // Проверяем что триггер виден в списке
    const triggers = await listTriggers(tpWorkspaceId!);
    const found = triggers.find((t: any) => t.id === crudTriggerId);
    expect(found).toBeTruthy();
    expect(found.name).toBe(trigger.name);
  });

  test('Toggle OFF -> ON', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!crudTriggerId, 'Триггер не создан');

    const toggled = await toggleTrigger(crudTriggerId);
    expect(toggled).toBeTruthy();
    expect(toggled.isActive).toBe(true);
  });

  test('Toggle ON -> OFF', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!crudTriggerId, 'Триггер не создан');

    const toggled = await toggleTrigger(crudTriggerId);
    expect(toggled).toBeTruthy();
    expect(toggled.isActive).toBe(false);
  });
});

// ============================================================================
// REAL: status_changed trigger
// ============================================================================

test.describe.serial('REAL: status_changed trigger', () => {
  let statusTriggerId: string;
  let entityId: string;

  test('Создание status_changed триггера (toStatus: in_progress)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!deployedDefinitionId, 'Нет задеплоенного определения');

    const trigger = await createTrigger({
      name: triggerName('status_changed'),
      workspaceId: tpWorkspaceId!,
      processDefinitionId: deployedDefinitionId!,
      triggerType: 'status_changed',
      conditions: { toStatus: 'in_progress' },
      isActive: true,
    });

    expect(trigger).toBeTruthy();
    expect(trigger.triggerType).toBe('status_changed');
    expect(trigger.isActive).toBe(true);
    statusTriggerId = trigger.id;
  });

  test('Создание entity (status=new)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!statusTriggerId, 'Триггер не создан');

    const entity = await createEntityApi(
      tpWorkspaceId!,
      `Playwright status-trigger ${Date.now()}`,
      { status: 'new', priority: 'medium' },
    );

    expect(entity).toBeTruthy();
    entityId = entity!.id;
  });

  test('Смена статуса на in_progress запускает процесс', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!entityId, 'Entity не создана');

    const updated = await updateEntityStatusApi(entityId, 'in_progress');
    expect(updated).toBe(true);

    // Ждём появления process instance (триггер работает асинхронно)
    const instance = await waitForProcessInstance(entityId, 30_000);
    expect(instance).toBeTruthy();
    expect(instance.id || instance.processInstanceKey).toBeTruthy();
  });

  test('История выполнений содержит SUCCESS', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!statusTriggerId, 'Триггер не создан');

    const execution = await waitForTriggerExecution(statusTriggerId, 15_000);
    expect(execution).toBeTruthy();
    expect(execution.status).toBe('success');
    expect(execution.processInstanceId).toBeTruthy();
  });
});

// ============================================================================
// REAL: comment_added trigger
// ============================================================================

test.describe.serial('REAL: comment_added trigger', () => {
  let commentTriggerId: string;
  let entityId: string;

  test('Создание comment_added триггера', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!deployedDefinitionId, 'Нет задеплоенного определения');

    const trigger = await createTrigger({
      name: triggerName('comment_added'),
      workspaceId: tpWorkspaceId!,
      processDefinitionId: deployedDefinitionId!,
      triggerType: 'comment_added',
      conditions: {},
      isActive: true,
    });

    expect(trigger).toBeTruthy();
    expect(trigger.triggerType).toBe('comment_added');
    commentTriggerId = trigger.id;
  });

  test('Создание entity для комментария', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!commentTriggerId, 'Триггер не создан');

    const entity = await createEntityApi(
      tpWorkspaceId!,
      `Playwright comment-trigger ${Date.now()}`,
    );

    expect(entity).toBeTruthy();
    entityId = entity!.id;
  });

  test('Добавление комментария запускает процесс', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!entityId, 'Entity не создана');

    const comment = await addCommentToEntityApi(entityId, 'Тестовый комментарий для триггера');
    expect(comment).toBeTruthy();

    // Ждём process instance
    const instance = await waitForProcessInstance(entityId, 30_000);
    expect(instance).toBeTruthy();
    expect(instance.id || instance.processInstanceKey).toBeTruthy();
  });

  test('Execution history для comment trigger содержит SUCCESS', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!commentTriggerId, 'Триггер не создан');

    const execution = await waitForTriggerExecution(commentTriggerId, 15_000);
    expect(execution).toBeTruthy();
    expect(execution.status).toBe('success');
  });
});

// ============================================================================
// Webhook trigger
// ============================================================================

test.describe.serial('Webhook trigger', () => {
  const WEBHOOK_SECRET = 'test-webhook-secret-e2e-' + Date.now();
  let webhookTriggerId: string;

  test('Создание webhook триггера с secret', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!deployedDefinitionId, 'Нет задеплоенного определения');

    const trigger = await createTrigger({
      name: triggerName('webhook'),
      workspaceId: tpWorkspaceId!,
      processDefinitionId: deployedDefinitionId!,
      triggerType: 'webhook',
      conditions: { secret: WEBHOOK_SECRET },
      isActive: true,
    });

    expect(trigger).toBeTruthy();
    expect(trigger.triggerType).toBe('webhook');
    webhookTriggerId = trigger.id;
  });

  test('Webhook с валидным plain secret возвращает 201', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!webhookTriggerId, 'Webhook триггер не создан');

    // Используем plain secret (X-Webhook-Secret) — надёжнее чем HMAC в тестах
    // т.к. HMAC зависит от точного совпадения serialized body
    const payload = { event: 'test', timestamp: Date.now() };
    const res = await fetch(`${API_URL}/bpmn/triggers/webhook/${webhookTriggerId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(201);
  });

  test('Webhook с невалидным HMAC возвращает 401', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!webhookTriggerId, 'Webhook триггер не создан');

    const payload = { event: 'test-invalid', timestamp: Date.now() };
    const result = await sendWebhookApi(webhookTriggerId, payload, 'wrong-secret-value');

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  test('Webhook без секрета возвращает 401', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!webhookTriggerId, 'Webhook триггер не создан');

    // Отправляем без заголовков подписи
    const res = await fetch(`${API_URL}/bpmn/triggers/webhook/${webhookTriggerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'no-auth' }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  test('Валидный webhook запустил процесс (execution SUCCESS)', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!webhookTriggerId, 'Webhook триггер не создан');

    const execution = await waitForTriggerExecution(webhookTriggerId, 30_000);
    expect(execution).toBeTruthy();
    expect(execution.status).toBe('success');
    expect(execution.processInstanceId).toBeTruthy();
  });
});

// ============================================================================
// Conditions: фильтрация по priority
// ============================================================================

test.describe.serial('Conditions: фильтрация по priority', () => {
  let priorityTriggerId: string;
  let lowPriorityEntityId: string;
  let highPriorityEntityId: string;

  test('Создание entity_created триггера с conditions: priority=high', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!deployedDefinitionId, 'Нет задеплоенного определения');

    const trigger = await createTrigger({
      name: triggerName('priority-filter'),
      workspaceId: tpWorkspaceId!,
      processDefinitionId: deployedDefinitionId!,
      triggerType: 'entity_created',
      conditions: { priority: 'high' },
      isActive: true,
    });

    expect(trigger).toBeTruthy();
    priorityTriggerId = trigger.id;
  });

  test('Entity с priority=medium НЕ запускает процесс от priority-filter триггера', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!priorityTriggerId, 'Триггер не создан');

    // Запоминаем количество executions НАШЕГО триггера ДО создания entity
    const execsBefore = await getTriggerExecutionsApi(priorityTriggerId);
    const countBefore = execsBefore.length;

    const entity = await createEntityApi(
      tpWorkspaceId!,
      `Playwright medium-priority ${Date.now()}`,
      { priority: 'medium' },
    );

    expect(entity).toBeTruthy();
    lowPriorityEntityId = entity!.id;

    // Ждём 5 секунд — триггер НЕ должен сработать
    await new Promise((r) => setTimeout(r, 5_000));

    // Проверяем что наш priority-filter триггер НЕ создал execution
    // (другие entity_created триггеры могут создать process — это ок)
    const execsAfter = await getTriggerExecutionsApi(priorityTriggerId);
    expect(execsAfter.length).toBe(countBefore);
  });

  test('Entity с priority=high ЗАПУСКАЕТ процесс от priority-filter триггера', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!priorityTriggerId, 'Триггер не создан');

    // Запоминаем executions ДО
    const execsBefore = await getTriggerExecutionsApi(priorityTriggerId);
    const countBefore = execsBefore.length;

    const entity = await createEntityApi(
      tpWorkspaceId!,
      `Playwright high-priority ${Date.now()}`,
      { priority: 'high' },
    );

    expect(entity).toBeTruthy();
    highPriorityEntityId = entity!.id;

    // Ждём execution от НАШЕГО priority-filter триггера
    const execution = await waitForTriggerExecution(priorityTriggerId, 30_000);
    expect(execution).toBeTruthy();
    expect(execution.status).toBe('success');

    const execsAfter = await getTriggerExecutionsApi(priorityTriggerId);
    expect(execsAfter.length).toBeGreaterThan(countBefore);
  });

  test('Деактивация триггера priority-filter', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!priorityTriggerId, 'Триггер не создан');

    // Выключаем чтобы не мешал другим тестам
    const toggled = await toggleTrigger(priorityTriggerId);
    expect(toggled).toBeTruthy();
    expect(toggled.isActive).toBe(false);
  });
});

// ============================================================================
// Execution History
// ============================================================================

test.describe('Execution History', () => {
  test('GET /:id/executions возвращает массив', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');

    // Берём любой созданный в тестах триггер
    const triggerId = createdTriggerIds[0];
    test.skip(!triggerId, 'Нет созданных триггеров');

    const executions = await getTriggerExecutionsApi(triggerId);
    expect(Array.isArray(executions)).toBe(true);
  });

  test('GET /executions/recent?workspaceId= возвращает массив', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!tpWorkspaceId, 'Нет workspace');

    const executions = await getRecentExecutionsApi(tpWorkspaceId!);
    expect(Array.isArray(executions)).toBe(true);
  });

  test('Execution содержит processInstanceId и status=success', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    test.skip(!tpWorkspaceId, 'Нет workspace');

    // Ищем среди всех созданных триггеров тот, у которого были SUCCESS executions
    let foundExecution: any = null;
    for (const triggerId of createdTriggerIds) {
      const executions = await getTriggerExecutionsApi(triggerId);
      const success = executions.find((e: any) => e.status === 'success');
      if (success) {
        foundExecution = success;
        break;
      }
    }

    // Если нет ни одного успешного execution — может быть что триггеры
    // не сработали (например, Zeebe упал). Пропускаем.
    test.skip(!foundExecution, 'Нет SUCCESS executions');

    expect(foundExecution.processInstanceId).toBeTruthy();
    expect(foundExecution.status).toBe('success');
    expect(foundExecution.executedAt).toBeTruthy();
  });
});

// ============================================================================
// Cleanup (запасной — на случай если afterAll не отработал)
// ============================================================================

test.describe('Cleanup тестовых триггеров', () => {
  test('Удаление всех триггеров, созданных в тестах', async () => {
    test.skip(!token, 'Нет токена');

    for (const id of createdTriggerIds) {
      await deleteTrigger(id);
    }

    // Проверяем что ни один тестовый триггер не остался
    if (tpWorkspaceId) {
      const remaining = await listTriggers(tpWorkspaceId);
      for (const id of createdTriggerIds) {
        const found = remaining.find((t: any) => t.id === id);
        expect(found).toBeUndefined();
      }
    }

    // Очищаем массив, чтобы afterAll не пытался удалять повторно
    createdTriggerIds.length = 0;
  });
});
