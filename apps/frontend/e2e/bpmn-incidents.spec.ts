import { test, expect } from '@playwright/test';
import {
  isZeebeAvailable,
  getDevToken,
  getWorkspacesApi,
  getIncidentsApi,
  getIncidentCountApi,
  retryIncidentApi,
  cancelIncidentApi,
  waitForIncident,
} from './helpers/test-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// ============================================================================
// Минимальный BPMN XML с service task update-entity-status.
// Worker вызовет entityService.findOne(entityId) — если entity не найден,
// бросит ошибку. После 3 неудачных попыток (Zeebe retries) создаётся инцидент.
// ============================================================================
function makeIncidentBpmnXml(processId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="${processId}" name="Test Incident Process" isExecutable="true">
    <bpmn:startEvent id="Start">
      <bpmn:outgoing>Flow1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:serviceTask id="Task_WillFail" name="Will Fail">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="update-entity-status" retries="1" />
      </bpmn:extensionElements>
      <bpmn:incoming>Flow1</bpmn:incoming>
      <bpmn:outgoing>Flow2</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="End">
      <bpmn:incoming>Flow2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow1" sourceRef="Start" targetRef="Task_WillFail" />
    <bpmn:sequenceFlow id="Flow2" sourceRef="Task_WillFail" targetRef="End" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processId}">
      <bpmndi:BPMNShape id="Start_di" bpmnElement="Start"><dc:Bounds x="179" y="99" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_di" bpmnElement="Task_WillFail"><dc:Bounds x="270" y="77" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_di" bpmnElement="End"><dc:Bounds x="432" y="99" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow1_di" bpmnElement="Flow1"><di:waypoint x="215" y="117" /><di:waypoint x="270" y="117" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow2_di" bpmnElement="Flow2"><di:waypoint x="370" y="117" /><di:waypoint x="432" y="117" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

// UUID, которого гарантированно нет в БД — worker update-entity-status бросит ошибку
const FAKE_ENTITY_ID = '00000000-0000-0000-0000-000000000000';

// ============================================================================
// Вспомогательные функции для работы с API определений/инстансов
// ============================================================================

async function createDefinition(
  token: string,
  workspaceId: string,
  processId: string,
  bpmnXml: string,
): Promise<{ id: string; processId: string } | null> {
  const res = await fetch(`${API_URL}/bpmn/definitions/${workspaceId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Test Incident ${processId}`,
      processId,
      bpmnXml,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return { id: data.id, processId: data.processId };
}

async function deployDefinition(token: string, definitionId: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/bpmn/definition/${definitionId}/deploy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

async function startProcess(
  token: string,
  definitionId: string,
  variables: Record<string, any>,
): Promise<{ id: string } | null> {
  const res = await fetch(`${API_URL}/bpmn/instances/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ definitionId, variables }),
  });
  if (!res.ok) return null;
  return res.json();
}

// ============================================================================
// ТЕСТЫ: реальные BPMN-инциденты через Zeebe
// ============================================================================

test.describe.serial('BPMN Incidents (реальные через Zeebe)', () => {
  let zeebeAvailable: boolean;
  let token: string;
  let workspaceId: string;

  // Первый процесс — для retry теста
  let definitionId1: string;
  let incidentId1: string;

  // Второй процесс — для cancel теста
  let definitionId2: string;
  let incidentId2: string;

  // ========================================================================
  // 1. Setup: проверяем Zeebe, получаем workspace, деплоим процесс
  // ========================================================================

  test('Setup: Zeebe доступен, workspace получен, процесс задеплоен', async () => {
    test.setTimeout(30000);

    zeebeAvailable = await isZeebeAvailable();
    test.skip(!zeebeAvailable, 'Zeebe недоступен');

    const t = await getDevToken();
    expect(t).toBeTruthy();
    token = t!;

    const workspaces = await getWorkspacesApi();
    expect(workspaces.length).toBeGreaterThan(0);
    workspaceId = workspaces[0].id;

    // Создаём и деплоим ПЕРВОЕ определение (для retry)
    const pid1 = `test-incident-retry-${Date.now()}`;
    const def1 = await createDefinition(token, workspaceId, pid1, makeIncidentBpmnXml(pid1));
    expect(def1).toBeTruthy();
    definitionId1 = def1!.id;

    const deployed1 = await deployDefinition(token, definitionId1);
    expect(deployed1).toBe(true);

    // Запускаем процесс с несуществующим entityId — worker сфейлится
    const instance1 = await startProcess(token, definitionId1, {
      entityId: FAKE_ENTITY_ID,
      newStatus: 'in_progress',
      workspaceId,
    });
    expect(instance1).toBeTruthy();
  });

  // ========================================================================
  // 2. Ожидание инцидента (worker fail → 3 retry → incident)
  // ========================================================================

  test('Ожидание инцидента: worker исчерпывает retries и создаёт incident', async () => {
    test.setTimeout(120000);
    test.skip(!zeebeAvailable, 'Zeebe недоступен');

    // Worker update-entity-status попытается найти entity с FAKE_ENTITY_ID,
    // не найдёт, вызовет failJobWithIncidentCheck. После 3 фейлов — incident.
    const incident = await waitForIncident(workspaceId, 90000);
    expect(incident).toBeTruthy();
    incidentId1 = incident!.id;
  });

  // ========================================================================
  // 3. GET /incidents — список содержит наш инцидент
  // ========================================================================

  test('GET /incidents — список содержит инцидент с processInstanceKey', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');

    const incidents = await getIncidentsApi(workspaceId);
    expect(incidents.length).toBeGreaterThanOrEqual(1);

    const our = incidents.find((i: any) => i.id === incidentId1);
    expect(our).toBeTruthy();
    expect(our.processInstanceKey).toBeTruthy();
    expect(our.workspaceId).toBe(workspaceId);
  });

  // ========================================================================
  // 4. GET /incidents/count — счётчик >= 1
  // ========================================================================

  test('GET /incidents/count — количество инцидентов >= 1', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');

    const count = await getIncidentCountApi(workspaceId);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // ========================================================================
  // 5. Структура инцидента — проверка полей IncidentInfo
  // ========================================================================

  test('Структура инцидента содержит обязательные поля', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');

    const incidents = await getIncidentsApi(workspaceId);
    const our = incidents.find((i: any) => i.id === incidentId1);
    expect(our).toBeTruthy();

    // Обязательные поля IncidentInfo
    expect(our.id).toBeTruthy();
    expect(our.processInstanceKey).toBeTruthy();
    expect(our.workspaceId).toBe(workspaceId);

    // errorMessage должен содержать информацию об ошибке (entity not found)
    expect(our.errorMessage).toBeTruthy();
    expect(typeof our.errorMessage).toBe('string');

    // variables — объект с данными процесса
    expect(our.variables).toBeTruthy();
    expect(typeof our.variables).toBe('object');

    // startedAt и updatedAt — даты
    expect(our.startedAt).toBeTruthy();
    expect(our.updatedAt).toBeTruthy();
  });

  // ========================================================================
  // 6. POST /incidents/:id/retry — повтор инцидента
  // ========================================================================

  test('POST /incidents/:id/retry — сбрасывает статус на ACTIVE', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');

    const success = await retryIncidentApi(incidentId1);
    expect(success).toBe(true);

    // После retry инцидент исчезает из списка (статус стал ACTIVE)
    // Даём немного времени на обновление
    await new Promise((r) => setTimeout(r, 2000));

    const incidents = await getIncidentsApi(workspaceId);
    const stillIncident = incidents.find((i: any) => i.id === incidentId1);

    // Инцидент больше не в статусе INCIDENT — его не должно быть в списке
    expect(stillIncident).toBeFalsy();
  });

  // ========================================================================
  // 7. POST /incidents/:id/cancel — отмена процесса с инцидентом
  //    Создаём ВТОРОЙ процесс, ждём его инцидент, отменяем
  // ========================================================================

  test('Cancel: деплоим второй процесс и ждём инцидент для отмены', async () => {
    test.setTimeout(120000);
    test.skip(!zeebeAvailable, 'Zeebe недоступен');

    const pid2 = `test-incident-cancel-${Date.now()}`;
    const def2 = await createDefinition(token, workspaceId, pid2, makeIncidentBpmnXml(pid2));
    expect(def2).toBeTruthy();
    definitionId2 = def2!.id;

    const deployed2 = await deployDefinition(token, definitionId2);
    expect(deployed2).toBe(true);

    const instance2 = await startProcess(token, definitionId2, {
      entityId: FAKE_ENTITY_ID,
      newStatus: 'in_progress',
      workspaceId,
    });
    expect(instance2).toBeTruthy();

    // Ждём появления нового инцидента
    // Первый инцидент мы уже retry-нули, так что ждём свежий
    const startTime = Date.now();
    let newIncident: any = null;
    while (Date.now() - startTime < 90000) {
      const incidents = await getIncidentsApi(workspaceId);
      // Ищем инцидент, который НЕ равен первому (тот уже retry-нут)
      newIncident = incidents.find((i: any) => i.id !== incidentId1);
      if (newIncident) break;
      await new Promise((r) => setTimeout(r, 3000));
    }

    expect(newIncident).toBeTruthy();
    incidentId2 = newIncident!.id;
  });

  test('POST /incidents/:id/cancel — процесс завершается', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');

    const success = await cancelIncidentApi(incidentId2);
    expect(success).toBe(true);

    // После cancel инцидент исчезает из списка
    await new Promise((r) => setTimeout(r, 2000));

    const incidents = await getIncidentsApi(workspaceId);
    const stillExists = incidents.find((i: any) => i.id === incidentId2);
    expect(stillExists).toBeFalsy();
  });

  // ========================================================================
  // 8. Ошибка: cancel несуществующего инцидента → 404 / ошибка
  // ========================================================================

  test('Cancel несуществующего инцидента возвращает ошибку', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');

    const fakeId = '00000000-0000-0000-0000-000000000099';
    const res = await fetch(`${API_URL}/bpmn/incidents/${fakeId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    // ParseUUIDPipe пропустит валидный UUID, но NotFoundException → 404
    expect([400, 404, 500].includes(res.status)).toBe(true);
    expect(res.ok).toBe(false);
  });
});
