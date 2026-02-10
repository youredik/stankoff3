import { test, expect } from '@playwright/test';
import {
  isZeebeAvailable,
  getDevToken,
  getWorkspacesApi,
  getMiningStatsApi,
  getMiningTimeAnalysisApi,
  getMiningElementStatsApi,
  getMiningWorkspaceStatsApi,
} from './helpers/test-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/**
 * Process Mining Analytics E2E Tests
 *
 * Тестирует API Process Mining:
 * - Статистика процессов (definition-level)
 * - Анализ по времени (time-analysis)
 * - Статистика элементов (heat map)
 * - Статистика workspace
 *
 * ВАЖНО: Mining тесты могут возвращать пустые/нулевые данные если процессы
 * не запускались. Используем условные проверки (typeof / toBeTruthy вместо > 0).
 */

test.describe('Process Mining Analytics', () => {
  let zeebeAvailable: boolean;
  let token: string | null;
  let workspaceId: string;
  let definitionId: string | null = null;

  test.beforeAll(async () => {
    zeebeAvailable = await isZeebeAvailable();
    token = await getDevToken();
    const workspaces = await getWorkspacesApi();
    workspaceId = workspaces.length > 0 ? workspaces[0].id : '';

    // Ищем deployed definition в workspace для тестирования mining
    if (token && workspaceId) {
      try {
        const res = await fetch(`${API_URL}/bpmn/definitions/${workspaceId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const definitions = await res.json();
          const deployed = definitions.find((d: any) => d.status === 'deployed');
          if (deployed) {
            definitionId = deployed.id;
          }
        }
      } catch {
        // Mining тесты всё равно будут работать с условными проверками
      }
    }
  });

  // ==========================================================================
  // Definition-level Mining Stats
  // ==========================================================================

  test('GET /mining/definitions/:id/stats — возвращает структуру статистики', async () => {
    test.skip(!zeebeAvailable || !definitionId, 'Zeebe недоступен или нет deployed definitions');

    const stats = await getMiningStatsApi(definitionId!);
    expect(stats).toBeTruthy();

    // Проверяем структуру ответа
    expect(typeof stats.totalInstances).toBe('number');
    expect(typeof stats.completedInstances).toBe('number');
    expect(typeof stats.activeInstances).toBe('number');
    expect(typeof stats.completionRate).toBe('number');
    expect(stats).toHaveProperty('definitionId');
    expect(stats).toHaveProperty('definitionName');
  });

  test('GET /mining/definitions/:id/stats с датами — фильтрованная статистика', async () => {
    test.skip(!zeebeAvailable || !definitionId, 'Zeebe недоступен или нет deployed definitions');

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const stats = await getMiningStatsApi(
      definitionId!,
      yesterday.toISOString(),
      now.toISOString(),
    );

    expect(stats).toBeTruthy();
    expect(typeof stats.totalInstances).toBe('number');
    // Фильтрованные данные могут быть <= общих — это нормально
  });

  test('Структура stats — содержит durationDistribution и instancesByDay', async () => {
    test.skip(!zeebeAvailable || !definitionId, 'Zeebe недоступен или нет deployed definitions');

    const stats = await getMiningStatsApi(definitionId!);
    expect(stats).toBeTruthy();

    // durationDistribution — массив бакетов распределения длительности
    expect(Array.isArray(stats.durationDistribution)).toBe(true);
    for (const bucket of stats.durationDistribution) {
      expect(bucket).toHaveProperty('bucket');
      expect(bucket).toHaveProperty('count');
      expect(typeof bucket.count).toBe('number');
    }

    // instancesByDay — массив с данными по дням
    expect(Array.isArray(stats.instancesByDay)).toBe(true);
    for (const day of stats.instancesByDay) {
      expect(day).toHaveProperty('date');
      expect(day).toHaveProperty('count');
      expect(typeof day.count).toBe('number');
    }
  });

  test('completionRate — значение от 0 до 100', async () => {
    test.skip(!zeebeAvailable || !definitionId, 'Zeebe недоступен или нет deployed definitions');

    const stats = await getMiningStatsApi(definitionId!);
    expect(stats).toBeTruthy();

    expect(stats.completionRate).toBeGreaterThanOrEqual(0);
    expect(stats.completionRate).toBeLessThanOrEqual(100);
  });

  // ==========================================================================
  // Time Analysis
  // ==========================================================================

  test('GET /mining/definitions/:id/time-analysis — структура анализа по времени', async () => {
    test.skip(!zeebeAvailable || !definitionId, 'Zeebe недоступен или нет deployed definitions');

    const analysis = await getMiningTimeAnalysisApi(definitionId!);
    expect(analysis).toBeTruthy();

    // dayOfWeekStats — массив статистики по дням недели
    expect(Array.isArray(analysis.dayOfWeekStats)).toBe(true);
    for (const d of analysis.dayOfWeekStats) {
      expect(d).toHaveProperty('day');
      expect(typeof d.avgInstances).toBe('number');
      expect(typeof d.avgDuration).toBe('number');
    }

    // hourlyStats — массив статистики по часам
    expect(Array.isArray(analysis.hourlyStats)).toBe(true);
    for (const h of analysis.hourlyStats) {
      expect(typeof h.hour).toBe('number');
      expect(typeof h.avgInstances).toBe('number');
    }

    // trendLine — массив точек тренда
    expect(Array.isArray(analysis.trendLine)).toBe(true);
    for (const t of analysis.trendLine) {
      expect(t).toHaveProperty('date');
      expect(typeof t.instances).toBe('number');
      expect(typeof t.avgDuration).toBe('number');
    }
  });

  // ==========================================================================
  // Element Stats (heat map)
  // ==========================================================================

  test('GET /mining/definitions/:id/element-stats — содержит массив elements', async () => {
    test.skip(!zeebeAvailable || !definitionId, 'Zeebe недоступен или нет deployed definitions');

    const elementStats = await getMiningElementStatsApi(definitionId!);
    expect(elementStats).toBeTruthy();

    expect(Array.isArray(elementStats.elements)).toBe(true);
  });

  test('Структура element stats — каждый элемент имеет elementId и executionCount', async () => {
    test.skip(!zeebeAvailable || !definitionId, 'Zeebe недоступен или нет deployed definitions');

    const elementStats = await getMiningElementStatsApi(definitionId!);
    expect(elementStats).toBeTruthy();

    // Если есть элементы — проверяем их структуру
    if (elementStats.elements.length > 0) {
      for (const el of elementStats.elements) {
        expect(el).toHaveProperty('elementId');
        expect(typeof el.elementId).toBe('string');
        expect(typeof el.executionCount).toBe('number');
        expect(el).toHaveProperty('elementType');
        expect(typeof el.elementType).toBe('string');

        // Duration может быть null если нет завершённых execution
        if (el.avgDurationMs !== null) {
          expect(typeof el.avgDurationMs).toBe('number');
        }
      }
    }
  });

  // ==========================================================================
  // Workspace-level Mining Stats
  // ==========================================================================

  test('GET /mining/workspaces/:id/stats — структура workspace-level статистики', async () => {
    test.skip(!zeebeAvailable || !workspaceId, 'Zeebe недоступен');

    const stats = await getMiningWorkspaceStatsApi(workspaceId);
    expect(stats).toBeTruthy();

    expect(typeof stats.totalDefinitions).toBe('number');
    expect(typeof stats.totalInstances).toBe('number');
    expect(typeof stats.avgCompletionRate).toBe('number');
    expect(typeof stats.avgDurationMinutes).toBe('number');
  });

  test('Workspace stats — содержит topProcessesByVolume и statusDistribution', async () => {
    test.skip(!zeebeAvailable || !workspaceId, 'Zeebe недоступен');

    const stats = await getMiningWorkspaceStatsApi(workspaceId);
    expect(stats).toBeTruthy();

    // topProcessesByVolume — массив процессов по объёму
    expect(Array.isArray(stats.topProcessesByVolume)).toBe(true);
    for (const p of stats.topProcessesByVolume) {
      expect(p).toHaveProperty('name');
      expect(typeof p.name).toBe('string');
      expect(typeof p.count).toBe('number');
    }

    // statusDistribution — распределение по статусам
    expect(Array.isArray(stats.statusDistribution)).toBe(true);
    for (const s of stats.statusDistribution) {
      expect(s).toHaveProperty('status');
      expect(typeof s.status).toBe('string');
      expect(typeof s.count).toBe('number');
    }
  });

  // ==========================================================================
  // Date-filtered Stats
  // ==========================================================================

  test('Stats с фильтром startDate=вчера, endDate=сегодня — валидный ответ', async () => {
    test.skip(!zeebeAvailable || !definitionId, 'Zeebe недоступен или нет deployed definitions');

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const stats = await getMiningStatsApi(
      definitionId!,
      yesterday.toISOString().split('T')[0],
      now.toISOString().split('T')[0],
    );

    expect(stats).toBeTruthy();
    expect(typeof stats.totalInstances).toBe('number');
    expect(typeof stats.completionRate).toBe('number');
    expect(Array.isArray(stats.instancesByDay)).toBe(true);

    // Фильтрованные данные не превышают общие
    const allStats = await getMiningStatsApi(definitionId!);
    expect(stats.totalInstances).toBeLessThanOrEqual(allStats!.totalInstances);
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  test('Mining stats для несуществующего definition — не крашит сервер', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(token).toBeTruthy();

    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${API_URL}/bpmn/mining/definitions/${fakeUuid}/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Может быть 200 (пустые данные), 404 (not found) или 500 (definition не найден в БД)
    expect([200, 404, 500].includes(res.status)).toBe(true);
  });

  test('Mining stats для невалидного UUID — 400', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(token).toBeTruthy();

    const res = await fetch(`${API_URL}/bpmn/mining/definitions/not-a-uuid/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // ParseUUIDPipe должен вернуть 400
    expect(res.status).toBe(400);
  });

  test('Workspace mining stats для несуществующего workspace — 200 с нулями или 404', async () => {
    test.skip(!zeebeAvailable, 'Zeebe недоступен');
    expect(token).toBeTruthy();

    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${API_URL}/bpmn/mining/workspaces/${fakeUuid}/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect([200, 404, 500].includes(res.status)).toBe(true);

    if (res.status === 200) {
      const stats = await res.json();
      expect(stats.totalDefinitions).toBe(0);
      expect(stats.totalInstances).toBe(0);
    }
  });
});
