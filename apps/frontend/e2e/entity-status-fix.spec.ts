import { test, expect } from '@playwright/test';
import { getDevToken, getEntityApi } from './helpers/test-utils';

/**
 * Тест бага: при создании заявки назначается статус из другого workspace,
 * из-за чего заявка не отображается на канбане.
 *
 * Workspace "Разработка Stankoff Portal" (DEV) имеет статусы:
 *   backlog, in_development, code_review, testing, done
 *
 * Fix: backend валидирует статус и подставляет дефолтный из конфига workspace.
 */

const DEV_WORKSPACE_ID = '78eee495-9ebd-4e88-b9cf-1d19394496c5';
const VALID_STATUSES = ['backlog', 'in_development', 'code_review', 'testing', 'done'];
const API_URL = 'http://localhost:3001/api';
const TS = Date.now();

test.describe('Entity status fix — API тесты', () => {

  test('Невалидный статус "new" заменяется на дефолтный "backlog"', async () => {
    const token = await getDevToken();
    expect(token).toBeTruthy();

    const res = await fetch(`${API_URL}/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId: DEV_WORKSPACE_ID,
        title: `fix-invalid-status-${TS}`,
        status: 'new',
        priority: 'medium',
      }),
    });
    expect(res.ok).toBe(true);
    const entity = await res.json();

    expect(entity.status).toBe('backlog');
    expect(VALID_STATUSES).toContain(entity.status);
  });

  test('Отсутствующий статус заменяется на дефолтный "backlog"', async () => {
    const token = await getDevToken();
    expect(token).toBeTruthy();

    const res = await fetch(`${API_URL}/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId: DEV_WORKSPACE_ID,
        title: `fix-no-status-${TS}`,
        priority: 'medium',
      }),
    });
    expect(res.ok).toBe(true);
    const entity = await res.json();

    expect(entity.status).toBe('backlog');
  });

  test('Валидный статус "in_development" сохраняется как есть', async () => {
    const token = await getDevToken();
    expect(token).toBeTruthy();

    const res = await fetch(`${API_URL}/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId: DEV_WORKSPACE_ID,
        title: `fix-valid-status-${TS}`,
        status: 'in_development',
        priority: 'medium',
      }),
    });
    expect(res.ok).toBe(true);
    const entity = await res.json();

    expect(entity.status).toBe('in_development');
  });

  test('Статус из другого workspace "payment" заменяется на дефолтный', async () => {
    const token = await getDevToken();
    expect(token).toBeTruthy();

    const res = await fetch(`${API_URL}/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId: DEV_WORKSPACE_ID,
        title: `fix-foreign-status-${TS}`,
        status: 'payment',
        priority: 'medium',
      }),
    });
    expect(res.ok).toBe(true);
    const entity = await res.json();

    expect(entity.status).toBe('backlog');
    expect(VALID_STATUSES).toContain(entity.status);
  });

  test('Заявка сохраняется в БД с правильным статусом', async () => {
    const token = await getDevToken();
    expect(token).toBeTruthy();

    const res = await fetch(`${API_URL}/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId: DEV_WORKSPACE_ID,
        title: `fix-persist-check-${TS}`,
        status: 'new',
        priority: 'high',
      }),
    });
    const created = await res.json();

    const full = await getEntityApi(created.id);
    expect(full).not.toBeNull();
    expect(full.status).toBe('backlog');
    expect(full.title).toBe(`fix-persist-check-${TS}`);
  });

  test('Заявка видна в kanban API с валидным статусом', async () => {
    const token = await getDevToken();
    expect(token).toBeTruthy();

    // Создаём заявку с невалидным статусом
    const createRes = await fetch(`${API_URL}/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId: DEV_WORKSPACE_ID,
        title: `fix-kanban-visible-${TS}`,
        status: 'new',
        priority: 'medium',
      }),
    });
    const entity = await createRes.json();
    expect(entity.status).toBe('backlog');

    // Проверяем что заявка есть в kanban
    const kanbanRes = await fetch(
      `${API_URL}/entities/kanban?workspaceId=${DEV_WORKSPACE_ID}&perColumn=50`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(kanbanRes.ok).toBe(true);
    const kanban = await kanbanRes.json();

    // Ищем нашу заявку в колонках
    let found = false;
    for (const col of kanban.columns) {
      const match = col.items.find((item: any) => item.id === entity.id);
      if (match) {
        found = true;
        expect(col.status).toBe('backlog');
        break;
      }
    }
    expect(found).toBe(true);
  });
});
