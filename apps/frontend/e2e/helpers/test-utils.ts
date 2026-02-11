import { expect, type Page } from '@playwright/test';
import { sidebar, kanban, entityDetail, createEntity, header } from './selectors';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// ============================================================================
// Навигация
// ============================================================================

/** Перейти на dashboard и дождаться загрузки sidebar */
export async function goToDashboard(page: Page) {
  await page.goto('/dashboard');
  await expect(page.locator(sidebar.root)).toBeVisible({ timeout: 15000 });
}

/** Выбрать workspace по имени в sidebar */
export async function selectWorkspaceByName(page: Page, name: string) {
  const wsButton = page.locator(sidebar.workspaceButton).filter({ hasText: name });
  await expect(wsButton).toBeVisible({ timeout: 10000 });
  await wsButton.click();
  // Ждём загрузку kanban/table
  await page.waitForTimeout(1000);
}

/** Выбрать первый доступный workspace */
export async function selectFirstWorkspace(page: Page): Promise<boolean> {
  await goToDashboard(page);

  const wsButton = page.locator(sidebar.workspaceButton).first();
  const hasWorkspace = await wsButton.isVisible().catch(() => false);

  if (hasWorkspace) {
    await wsButton.click();
    await page.waitForTimeout(1000);
    return true;
  }
  return false;
}

/** Перейти в настройки workspace через контекстное меню */
export async function navigateToWorkspaceSettings(page: Page): Promise<boolean> {
  await goToDashboard(page);

  const wsItem = page.locator(sidebar.workspaceItem).first();
  const hasWorkspace = await wsItem.isVisible().catch(() => false);

  if (!hasWorkspace) return false;

  await wsItem.hover();
  const menuBtn = wsItem.locator(sidebar.workspaceMenu);
  await menuBtn.click();

  const settingsBtn = page.getByText('Настроить');
  const hasSettings = await settingsBtn.isVisible().catch(() => false);
  if (!hasSettings) return false;

  await settingsBtn.click();
  await page.waitForURL(/\/settings/, { timeout: 5000 });
  return true;
}

/** Перейти на страницу бизнес-процессов workspace */
export async function navigateToProcesses(page: Page): Promise<string | null> {
  await goToDashboard(page);

  const wsButton = page.locator(sidebar.workspaceButton).first();
  const hasWorkspace = await wsButton.isVisible().catch(() => false);
  if (!hasWorkspace) return null;

  await wsButton.click();
  await page.waitForTimeout(500);

  // Extract workspace ID from URL or page
  const url = page.url();
  const match = url.match(/\/workspace\/([^/]+)/);
  const workspaceId = match ? match[1] : null;

  if (!workspaceId) {
    // Try navigating through sidebar menu
    const wsItem = page.locator(sidebar.workspaceItem).first();
    await wsItem.hover();
    const menuBtn = wsItem.locator(sidebar.workspaceMenu);
    await menuBtn.click();
    const processesBtn = page.getByText('Бизнес-процессы');
    const hasProcesses = await processesBtn.isVisible().catch(() => false);
    if (hasProcesses) {
      await processesBtn.click();
      await page.waitForTimeout(1000);
    }
    return null;
  }

  await page.goto(`/workspace/${workspaceId}/processes`);
  await page.waitForTimeout(2000);
  return workspaceId;
}

// ============================================================================
// Entity CRUD
// ============================================================================

/** Создать тестовую заявку и дождаться её появления на канбане */
export async function createTestEntity(
  page: Page,
  title: string,
  options?: { priority?: 'low' | 'medium' | 'high'; assigneeIndex?: number }
) {
  await dismissToasts(page);

  const newBtn = page.locator(kanban.newEntityButton);
  // Fallback: если data-testid ещё нет — ищем по тексту
  const hasNewBtn = await newBtn.isVisible().catch(() => false);
  const clickTarget = hasNewBtn ? newBtn : page.getByRole('button', { name: /Новая заявка/i });
  await clickTarget.click();

  // Если диалог не открылся — повторная попытка (toast мог перехватить клик)
  const dialogVisible = await page.getByRole('dialog').isVisible({ timeout: 3000 }).catch(() => false);
  if (!dialogVisible) {
    await dismissToasts(page);
    await clickTarget.click();
  }

  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

  // Title
  const titleInput = page.locator(createEntity.titleInput);
  const hasTitleInput = await titleInput.isVisible().catch(() => false);
  if (hasTitleInput) {
    await titleInput.fill(title);
  } else {
    await page.getByLabel(/Название/i).fill(title);
  }

  // Priority
  if (options?.priority) {
    const priorityLabels: Record<string, string> = {
      high: 'Высокий',
      medium: 'Средний',
      low: 'Низкий',
    };
    const priorityBtn = page.locator('button').filter({ hasText: priorityLabels[options.priority] });
    const hasPriorityBtn = await priorityBtn.isVisible().catch(() => false);
    if (hasPriorityBtn) {
      await priorityBtn.click();
    }
  }

  // Assignee
  if (options?.assigneeIndex !== undefined) {
    const assigneeSelect = page.locator('[role="dialog"] select').first();
    const hasSelect = await assigneeSelect.isVisible().catch(() => false);
    if (hasSelect) {
      await assigneeSelect.selectOption({ index: options.assigneeIndex });
    }
  }

  // Заполнить обязательные кастомные поля (если есть) — иначе кнопка будет disabled
  const submitCheck = page.locator(createEntity.submit);
  const isDisabled = await submitCheck.isDisabled().catch(() => false);
  if (isDisabled) {
    const dialog = page.getByRole('dialog');
    const textboxes = dialog.getByRole('textbox');
    const count = await textboxes.count();
    for (let i = 0; i < count; i++) {
      const tb = textboxes.nth(i);
      const val = await tb.inputValue().catch(() => '');
      if (val) continue;
      // Текст родителя содержит label поля — если там есть *, поле обязательное
      const parentText = await tb.locator('..').textContent().catch(() => '');
      if (parentText?.includes('*')) {
        await tb.fill('Playwright Test Value');
      }
    }
  }

  // Submit
  const submitBtn = page.locator(createEntity.submit);
  const hasSubmitBtn = await submitBtn.isVisible().catch(() => false);
  if (hasSubmitBtn) {
    await submitBtn.click();
  } else {
    await page.getByRole('button', { name: /Создать заявку/i }).click();
  }

  // Ждём закрытия диалога (API отвечает и модалка закрывается)
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 15000 });

  // Ожидаем карточку на канбане
  await expect(
    page.locator(kanban.card).filter({ hasText: title }).first()
  ).toBeVisible({ timeout: 10000 });
}

/** Открыть деталь заявки по клику на карточку */
export async function openEntityDetail(page: Page, titleOrCard?: string) {
  await dismissToasts(page);

  const card = titleOrCard
    ? page.locator(kanban.card).filter({ hasText: titleOrCard }).first()
    : page.locator(kanban.card).first();

  // Проверяем видимость карточки
  const isVisible = await card.isVisible().catch(() => false);

  if (!isVisible && titleOrCard) {
    // Карточка не видна — может быть за пагинацией. Используем фильтр поиска
    const searchInput = page.locator('[data-testid="filter-search-input"]');
    let hasSearch = await searchInput.isVisible().catch(() => false);

    if (!hasSearch) {
      // Фильтр-панель закрыта — открываем
      const filterBtn = page.locator(kanban.filterButton);
      const hasFilter = await filterBtn.isVisible().catch(() => false);
      if (hasFilter) {
        await filterBtn.click();
        hasSearch = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);
      }
    }

    if (hasSearch) {
      await searchInput.fill(titleOrCard);
      // 300ms debounce + API call + render
      await page.waitForTimeout(3000);
    }
  }

  // Ждём появления карточки (может загружаться с сервера)
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.scrollIntoViewIfNeeded();
  await card.click({ force: true });
  await expect(page.locator(entityDetail.overlay)).toBeVisible({ timeout: 8000 });
}

/** Закрыть детальную панель */
export async function closeEntityDetail(page: Page) {
  const closeBtn = page.locator(entityDetail.closeButton);
  const hasClose = await closeBtn.isVisible().catch(() => false);
  if (hasClose) {
    await closeBtn.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await expect(page.locator(entityDetail.overlay)).not.toBeVisible({ timeout: 3000 });

  // Если фильтр поиска активен — очищаем чтобы не мешать следующим тестам
  const searchInput = page.locator('[data-testid="filter-search-input"]');
  const hasSearch = await searchInput.isVisible().catch(() => false);
  if (hasSearch) {
    const value = await searchInput.inputValue().catch(() => '');
    if (value) {
      await searchInput.fill('');
      await page.waitForTimeout(500);
    }
  }
}

// ============================================================================
// Toast & UI helpers
// ============================================================================

/** Закрыть все видимые Toast уведомления */
export async function dismissToasts(page: Page) {
  // Программное удаление всех toast-элементов из DOM (самый надёжный способ)
  await page.evaluate(() => {
    document.querySelectorAll('[data-sonner-toast]').forEach(el => el.remove());
    // Также удаляем контейнер Sonner toaster если есть
    document.querySelectorAll('[data-sonner-toaster]').forEach(el => {
      el.querySelectorAll('li').forEach(li => li.remove());
    });
  }).catch(() => {});
  await page.waitForTimeout(200);
}

/** Открыть панель уведомлений */
export async function openNotifications(page: Page) {
  await page.locator(header.notificationBell).click();
  await expect(page.getByText('Уведомления')).toBeVisible({ timeout: 3000 });
}

/** Переключить вид (kanban/table/analytics) */
export async function switchView(page: Page, view: 'kanban' | 'table' | 'analytics') {
  const selectors: Record<string, string> = {
    kanban: header.viewToggleKanban,
    table: header.viewToggleTable,
    analytics: header.viewToggleAnalytics,
  };
  await page.locator(selectors[view]).click();
  await page.waitForTimeout(500);
}

// ============================================================================
// API helpers
// ============================================================================

/** Получить access token через dev login */
export async function getDevToken(email = 'youredik@gmail.com'): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/auth/dev/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return null;
    const { accessToken } = await res.json();
    return accessToken;
  } catch {
    return null;
  }
}

/** Проверить доступность Zeebe */
export async function isZeebeAvailable(): Promise<boolean> {
  try {
    const token = await getDevToken();
    if (!token) return false;
    const res = await fetch(`${API_URL}/bpmn/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.connected === true;
  } catch {
    return false;
  }
}

/** Проверить доступность AI сервиса */
export async function isAiAvailable(): Promise<boolean> {
  try {
    const token = await getDevToken();
    if (!token) return false;
    const res = await fetch(`${API_URL}/ai/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.available === true || data.status === 'ok';
  } catch {
    return false;
  }
}

/** Проверить доступность Legacy БД */
export async function isLegacyAvailable(): Promise<boolean> {
  try {
    const token = await getDevToken();
    if (!token) return false;
    const res = await fetch(`${API_URL}/legacy/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.connected === true || data.available === true;
  } catch {
    return false;
  }
}

/** Получить список workspaces через API */
export async function getWorkspacesApi(): Promise<any[]> {
  try {
    const token = await getDevToken();
    if (!token) return [];
    const res = await fetch(`${API_URL}/workspaces`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// ============================================================================
// BPMN API helpers
// ============================================================================

/** Создать entity через API (для BPMN тестов — минуя UI) */
export async function createEntityApi(
  workspaceId: string,
  title: string,
  options?: { status?: string; priority?: string; data?: Record<string, unknown> },
): Promise<{ id: string; customId: string } | null> {
  try {
    const token = await getDevToken();
    if (!token) return null;
    const body: Record<string, unknown> = {
      title,
      workspaceId,
      status: options?.status || 'new',
      priority: options?.priority || 'medium',
    };
    if (options?.data) body.data = options.data;
    const res = await fetch(`${API_URL}/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { id: data.id, customId: data.customId };
  } catch {
    return null;
  }
}

/** Получить entity по ID через API */
export async function getEntityApi(entityId: string): Promise<any | null> {
  try {
    const token = await getDevToken();
    if (!token) return null;
    const res = await fetch(`${API_URL}/entities/${entityId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Ждать появления process instance для entity (с polling) */
export async function waitForProcessInstance(
  entityId: string,
  maxWaitMs = 30000,
): Promise<any | null> {
  const token = await getDevToken();
  if (!token) return null;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${API_URL}/bpmn/instances/entity/${entityId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const instances = await res.json();
        if (Array.isArray(instances) && instances.length > 0) {
          return instances[0];
        }
      }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

/** Ждать появления user task для entity (с polling) */
export async function waitForUserTask(
  entityId: string,
  elementId?: string,
  maxWaitMs = 30000,
): Promise<any | null> {
  const token = await getDevToken();
  if (!token) return null;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(
        `${API_URL}/bpmn/tasks?entityId=${entityId}&status=created,claimed&page=1&perPage=50`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        const tasks = data.items || [];
        if (elementId) {
          const match = tasks.find((t: any) => t.elementId === elementId);
          if (match) return match;
        } else if (tasks.length > 0) {
          return tasks[0];
        }
      }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

/** Claim user task через API */
export async function claimTaskApi(taskId: string): Promise<boolean> {
  try {
    const token = await getDevToken();
    if (!token) return false;
    const res = await fetch(`${API_URL}/bpmn/tasks/${taskId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Complete user task через API */
export async function completeTaskApi(
  taskId: string,
  formData?: Record<string, any>,
): Promise<boolean> {
  try {
    const token = await getDevToken();
    if (!token) return false;
    const body: any = {};
    if (formData) body.formData = formData;
    const res = await fetch(`${API_URL}/bpmn/tasks/${taskId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Claim + Complete одним вызовом */
export async function claimAndCompleteTask(
  taskId: string,
  formData?: Record<string, any>,
): Promise<boolean> {
  // Пытаемся claim — если задача уже claimed (auto-assigned), не критично
  await claimTaskApi(taskId);
  return completeTaskApi(taskId, formData);
}

/** Получить все задачи для entity */
export async function getTasksForEntity(entityId: string): Promise<any[]> {
  try {
    const token = await getDevToken();
    if (!token) return [];
    const res = await fetch(
      `${API_URL}/bpmn/tasks?entityId=${entityId}&page=1&perPage=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch {
    return [];
  }
}

/** Получить process instances для entity */
export async function getProcessInstances(entityId: string): Promise<any[]> {
  try {
    const token = await getDevToken();
    if (!token) return [];
    const res = await fetch(`${API_URL}/bpmn/instances/entity/${entityId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// ============================================================================
// User Tasks — расширенные операции
// ============================================================================

/** Получить деталь задачи */
export async function getTaskDetailApi(taskId: string): Promise<any | null> {
  try {
    const token = await getDevToken();
    if (!token) return null;
    const res = await fetch(`${API_URL}/bpmn/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Отпустить задачу */
export async function unclaimTaskApi(taskId: string): Promise<boolean> {
  try {
    const token = await getDevToken();
    if (!token) return false;
    const res = await fetch(`${API_URL}/bpmn/tasks/${taskId}/unclaim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Делегировать задачу другому пользователю */
export async function delegateTaskApi(taskId: string, toUserId: string): Promise<boolean> {
  try {
    const token = await getDevToken();
    if (!token) return false;
    const res = await fetch(`${API_URL}/bpmn/tasks/${taskId}/delegate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ toUserId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Массовый claim задач */
export async function batchClaimApi(
  taskIds: string[],
): Promise<{ succeeded: string[]; failed: any[] } | null> {
  try {
    const token = await getDevToken();
    if (!token) return null;
    const res = await fetch(`${API_URL}/bpmn/tasks/batch/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ taskIds }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Массовое делегирование */
export async function batchDelegateApi(
  taskIds: string[],
  targetUserId: string,
): Promise<{ succeeded: string[]; failed: any[] } | null> {
  try {
    const token = await getDevToken();
    if (!token) return null;
    const res = await fetch(`${API_URL}/bpmn/tasks/batch/delegate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ taskIds, targetUserId }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Добавить комментарий к задаче */
export async function addTaskCommentApi(taskId: string, content: string): Promise<any | null> {
  try {
    const token = await getDevToken();
    if (!token) return null;
    const res = await fetch(`${API_URL}/bpmn/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Получить комментарии задачи */
export async function getTaskCommentsApi(taskId: string): Promise<any[]> {
  try {
    const token = await getDevToken();
    if (!token) return [];
    const res = await fetch(`${API_URL}/bpmn/tasks/${taskId}/comments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/** Статистика задач workspace */
export async function getTaskStatisticsApi(workspaceId: string): Promise<any | null> {
  try {
    const token = await getDevToken();
    if (!token) return null;
    const res = await fetch(`${API_URL}/bpmn/tasks/statistics?workspaceId=${workspaceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Получить токен второго пользователя (для тестов delegation) */
export async function getSecondUserToken(): Promise<string | null> {
  return getDevToken('grachev@stankoff.ru');
}

// ============================================================================
// Process Management — расширенные операции
// ============================================================================

/** Отменить процесс */
export async function cancelProcessApi(processInstanceKey: string): Promise<boolean> {
  try {
    const token = await getDevToken();
    if (!token) return false;
    const res = await fetch(`${API_URL}/bpmn/instances/${processInstanceKey}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Получить timeline процесса */
export async function getProcessTimelineApi(instanceId: string): Promise<any[]> {
  try {
    const token = await getDevToken();
    if (!token) return [];
    const res = await fetch(`${API_URL}/bpmn/instances/${instanceId}/timeline`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/** Получить историю версий определения */
export async function getProcessVersionsApi(definitionId: string): Promise<any[]> {
  try {
    const token = await getDevToken();
    if (!token) return [];
    const res = await fetch(`${API_URL}/bpmn/definition/${definitionId}/versions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/** Удалить определение процесса */
export async function deleteDefinitionApi(definitionId: string): Promise<boolean> {
  try {
    const token = await getDevToken();
    if (!token) return false;
    const res = await fetch(`${API_URL}/bpmn/definition/${definitionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// Statistics
// ============================================================================

/** Статистика определения процесса */
export async function getDefinitionStatsApi(definitionId: string): Promise<any | null> {
  try {
    const token = await getDevToken();
    if (!token) return null;
    const res = await fetch(`${API_URL}/bpmn/statistics/definition/${definitionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Статистика workspace (BPMN) */
export async function getWorkspaceBpmnStatsApi(workspaceId: string): Promise<any | null> {
  try {
    const token = await getDevToken();
    if (!token) return null;
    const res = await fetch(`${API_URL}/bpmn/statistics/workspace/${workspaceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ============================================================================
// Process Mining
// ============================================================================

/** Process Mining — статистика процесса */
export async function getMiningStatsApi(
  definitionId: string,
  startDate?: string,
  endDate?: string,
): Promise<any | null> {
  try {
    const token = await getDevToken();
    if (!token) return null;
    let url = `${API_URL}/bpmn/mining/definitions/${definitionId}/stats`;
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (params.toString()) url += `?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Process Mining — анализ по времени */
export async function getMiningTimeAnalysisApi(definitionId: string): Promise<any | null> {
  try {
    const token = await getDevToken();
    if (!token) return null;
    const res = await fetch(`${API_URL}/bpmn/mining/definitions/${definitionId}/time-analysis`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Process Mining — статистика элементов (heat map) */
export async function getMiningElementStatsApi(definitionId: string): Promise<any | null> {
  try {
    const token = await getDevToken();
    if (!token) return null;
    const res = await fetch(`${API_URL}/bpmn/mining/definitions/${definitionId}/element-stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Process Mining — статистика workspace */
export async function getMiningWorkspaceStatsApi(workspaceId: string): Promise<any | null> {
  try {
    const token = await getDevToken();
    if (!token) return null;
    const res = await fetch(`${API_URL}/bpmn/mining/workspaces/${workspaceId}/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ============================================================================
// Incidents
// ============================================================================

/** Получить инциденты workspace */
export async function getIncidentsApi(workspaceId: string): Promise<any[]> {
  try {
    const token = await getDevToken();
    if (!token) return [];
    const res = await fetch(`${API_URL}/bpmn/incidents?workspaceId=${workspaceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/** Количество инцидентов */
export async function getIncidentCountApi(workspaceId: string): Promise<number> {
  try {
    const token = await getDevToken();
    if (!token) return 0;
    const res = await fetch(`${API_URL}/bpmn/incidents/count?workspaceId=${workspaceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.count || 0;
  } catch {
    return 0;
  }
}

/** Retry инцидента */
export async function retryIncidentApi(incidentId: string): Promise<boolean> {
  try {
    const token = await getDevToken();
    if (!token) return false;
    const res = await fetch(`${API_URL}/bpmn/incidents/${incidentId}/retry`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Cancel инцидента */
export async function cancelIncidentApi(incidentId: string): Promise<boolean> {
  try {
    const token = await getDevToken();
    if (!token) return false;
    const res = await fetch(`${API_URL}/bpmn/incidents/${incidentId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Ждать появления инцидента в workspace */
export async function waitForIncident(
  workspaceId: string,
  maxWaitMs = 60000,
): Promise<any | null> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const incidents = await getIncidentsApi(workspaceId);
    if (incidents.length > 0) return incidents[0];
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

// ============================================================================
// Triggers — расширенные операции
// ============================================================================

/** Получить историю выполнений триггера */
export async function getTriggerExecutionsApi(triggerId: string): Promise<any[]> {
  try {
    const token = await getDevToken();
    if (!token) return [];
    const res = await fetch(`${API_URL}/bpmn/triggers/${triggerId}/executions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/** Недавние выполнения всех триггеров workspace */
export async function getRecentExecutionsApi(workspaceId: string): Promise<any[]> {
  try {
    const token = await getDevToken();
    if (!token) return [];
    const res = await fetch(
      `${API_URL}/bpmn/triggers/executions/recent?workspaceId=${workspaceId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/** Отправить webhook запрос */
export async function sendWebhookApi(
  triggerId: string,
  payload: Record<string, any>,
  secret: string,
): Promise<{ ok: boolean; status: number }> {
  try {
    const body = JSON.stringify(payload);
    // HMAC-SHA256
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const hex = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const res = await fetch(`${API_URL}/bpmn/triggers/webhook/${triggerId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${hex}`,
      },
      body,
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** Обновить статус entity */
export async function updateEntityStatusApi(entityId: string, newStatus: string): Promise<boolean> {
  try {
    const token = await getDevToken();
    if (!token) return false;
    const res = await fetch(`${API_URL}/entities/${entityId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: newStatus }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// Chat API helpers
// ============================================================================

/** Получить список чатов пользователя */
export async function getConversationsApi(search?: string, email?: string): Promise<any[]> {
  try {
    const token = await getDevToken(email);
    if (!token) return [];
    const url = search
      ? `${API_URL}/chat/conversations?search=${encodeURIComponent(search)}`
      : `${API_URL}/chat/conversations`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/** Создать чат */
export async function createConversationApi(
  data: { type: string; name?: string; participantIds: string[]; entityId?: string },
  email?: string,
): Promise<any | null> {
  try {
    const token = await getDevToken(email);
    if (!token) return null;
    const res = await fetch(`${API_URL}/chat/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Отправить сообщение */
export async function sendMessageApi(
  conversationId: string,
  content: string,
  options?: { replyToId?: string; type?: string },
  email?: string,
): Promise<any | null> {
  try {
    const token = await getDevToken(email);
    if (!token) return null;
    const res = await fetch(`${API_URL}/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content, type: options?.type || 'text', replyToId: options?.replyToId }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Получить сообщения чата */
export async function getMessagesApi(
  conversationId: string,
  options?: { cursor?: string; limit?: number },
  email?: string,
): Promise<any | null> {
  try {
    const token = await getDevToken(email);
    if (!token) return null;
    const params = new URLSearchParams();
    if (options?.cursor) params.set('cursor', options.cursor);
    if (options?.limit) params.set('limit', String(options.limit));
    const qs = params.toString() ? `?${params}` : '';
    const res = await fetch(`${API_URL}/chat/conversations/${conversationId}/messages${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Редактировать сообщение */
export async function editMessageApi(
  conversationId: string,
  messageId: string,
  content: string,
  email?: string,
): Promise<any | null> {
  try {
    const token = await getDevToken(email);
    if (!token) return null;
    const res = await fetch(`${API_URL}/chat/conversations/${conversationId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Удалить сообщение (soft delete) */
export async function deleteMessageApi(
  conversationId: string,
  messageId: string,
  email?: string,
): Promise<boolean> {
  try {
    const token = await getDevToken(email);
    if (!token) return false;
    const res = await fetch(`${API_URL}/chat/conversations/${conversationId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Toggle реакция на сообщение */
export async function toggleReactionApi(
  conversationId: string,
  messageId: string,
  emoji: string,
  email?: string,
): Promise<any | null> {
  try {
    const token = await getDevToken(email);
    if (!token) return null;
    const res = await fetch(`${API_URL}/chat/conversations/${conversationId}/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ emoji }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Закрепить сообщение */
export async function pinMessageApi(
  conversationId: string,
  messageId: string,
  email?: string,
): Promise<boolean> {
  try {
    const token = await getDevToken(email);
    if (!token) return false;
    const res = await fetch(`${API_URL}/chat/conversations/${conversationId}/messages/${messageId}/pin`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Открепить сообщение */
export async function unpinMessageApi(
  conversationId: string,
  messageId: string,
  email?: string,
): Promise<boolean> {
  try {
    const token = await getDevToken(email);
    if (!token) return false;
    const res = await fetch(`${API_URL}/chat/conversations/${conversationId}/messages/${messageId}/pin`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Получить закреплённые сообщения */
export async function getPinnedMessagesApi(
  conversationId: string,
  email?: string,
): Promise<any[]> {
  try {
    const token = await getDevToken(email);
    if (!token) return [];
    const res = await fetch(`${API_URL}/chat/conversations/${conversationId}/pinned`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/** Поиск по сообщениям чата */
export async function searchChatMessagesApi(query: string, email?: string): Promise<any[]> {
  try {
    const token = await getDevToken(email);
    if (!token) return [];
    const res = await fetch(`${API_URL}/chat/search?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/** Добавить участников в чат */
export async function addChatParticipantsApi(
  conversationId: string,
  userIds: string[],
  email?: string,
): Promise<boolean> {
  try {
    const token = await getDevToken(email);
    if (!token) return false;
    const res = await fetch(`${API_URL}/chat/conversations/${conversationId}/participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userIds }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Удалить участника из чата */
export async function removeChatParticipantApi(
  conversationId: string,
  userId: string,
  email?: string,
): Promise<boolean> {
  try {
    const token = await getDevToken(email);
    if (!token) return false;
    const res = await fetch(`${API_URL}/chat/conversations/${conversationId}/participants/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Получить количество непрочитанных */
export async function getUnreadCountsApi(email?: string): Promise<any | null> {
  try {
    const token = await getDevToken(email);
    if (!token) return null;
    const res = await fetch(`${API_URL}/chat/unread-counts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Получить список пользователей (для тестов добавления участников) */
export async function getUsersListApi(email?: string): Promise<any[]> {
  try {
    const token = await getDevToken(email);
    if (!token) return [];
    const res = await fetch(`${API_URL}/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// ============================================================================
// AI Assistant API helpers
// ============================================================================

/** Получить AI помощь по заявке */
export async function getAiAssistanceApi(entityId: string, email?: string): Promise<any | null> {
  try {
    const token = await getDevToken(email);
    if (!token) return null;
    const res = await fetch(`${API_URL}/ai/assist/${entityId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Сгенерировать AI ответ (non-streaming) */
export async function generateAiResponseApi(
  entityId: string,
  context?: string,
  email?: string,
): Promise<any | null> {
  try {
    const token = await getDevToken(email);
    if (!token) return null;
    const res = await fetch(`${API_URL}/ai/assist/${entityId}/suggest-response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ context: context || '' }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Получить AI резюме переписки */
export async function getAiSummaryApi(entityId: string, email?: string): Promise<any | null> {
  try {
    const token = await getDevToken(email);
    if (!token) return null;
    const res = await fetch(`${API_URL}/ai/assist/${entityId}/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Засеять комментарии к заявке (для тестов резюме — нужно >= 5 комментариев) */
export async function seedCommentsForEntity(entityId: string, count: number, email?: string): Promise<number> {
  let created = 0;
  for (let i = 0; i < count; i++) {
    const result = await addCommentToEntityApi(entityId, `Тестовый комментарий Playwright #${i + 1} — автоматическая генерация`, email);
    if (result) created++;
  }
  return created;
}

// ============================================================================
// Entity Comments
// ============================================================================

/** Добавить комментарий к entity */
export async function addCommentToEntityApi(entityId: string, content: string, email?: string): Promise<any | null> {
  try {
    const token = await getDevToken(email);
    if (!token) return null;
    // Получаем userId через /auth/me (нужен для authorId в DTO)
    const meRes = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) return null;
    const me = await meRes.json();
    const res = await fetch(`${API_URL}/comments/entity/${entityId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content, authorId: me.id }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
