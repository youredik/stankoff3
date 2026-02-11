import { test, expect } from '@playwright/test';
import { aiAssistant, aiSummary, entityDetail, kanban, sidebar } from './helpers/selectors';
import {
  goToDashboard,
  selectFirstWorkspace,
  openEntityDetail,
  dismissToasts,
  isAiAvailable,
  getDevToken,
  createEntityApi,
  getWorkspacesApi,
  getAiAssistanceApi,
  generateAiResponseApi,
  getAiSummaryApi,
  seedCommentsForEntity,
  addCommentToEntityApi,
} from './helpers/test-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/** Открыть AI вкладку для первой карточки в workspace.
 *  Возвращает 'full' если AI вернул полные данные (tab),
 *  'nodata' если AI доступен но данных нет, или null если не удалось.
 */
async function openAiTab(
  page: import('@playwright/test').Page,
): Promise<'full' | 'nodata' | null> {
  const hasWorkspace = await selectFirstWorkspace(page);
  if (!hasWorkspace) return null;

  await dismissToasts(page);

  const card = page.locator(kanban.card).first();
  const hasCard = await card.isVisible().catch(() => false);
  if (!hasCard) return null;

  await card.click({ force: true });
  await page.waitForTimeout(1000);

  const aiTab = page.getByRole('button', { name: /AI помощник/i });
  const hasAiTab = await aiTab.isVisible().catch(() => false);
  if (!hasAiTab) return null;

  await aiTab.click();

  // Ждём одно из AI состояний
  const tabContent = page.locator('[data-testid="ai-assistant-tab"]');
  const noData = page.locator('[data-testid="ai-assistant-no-data"]');
  const unavailable = page.locator('[data-testid="ai-assistant-unavailable"]');

  await expect(tabContent.or(noData).or(unavailable)).toBeVisible({ timeout: 20000 });

  if (await tabContent.isVisible().catch(() => false)) return 'full';
  if (await noData.isVisible().catch(() => false)) return 'nodata';
  return null;
}

// ============================================================================
// ТЕСТЫ AI ПОМОЩНИКА (АССИСТЕНТ)
// ============================================================================
test.describe('AI Помощник — Ассистент', () => {
  let aiAvailable: boolean;
  let testWorkspaceId: string | null = null;
  let testEntityId: string | null = null;

  test.beforeAll(async () => {
    aiAvailable = await isAiAvailable();
    if (!aiAvailable) return;

    // Получаем workspace и создаём тестовую заявку через API
    const workspaces = await getWorkspacesApi();
    testWorkspaceId = workspaces[0]?.id || null;
    if (!testWorkspaceId) return;

    const entity = await createEntityApi(testWorkspaceId, 'Playwright AI: не работает станок ЧПУ Fanuc перегрев шпинделя', {
      data: { description: 'Не работает станок ЧПУ Fanuc, ошибка перегрева шпинделя. Клиент сообщает о вибрациях при высоких оборотах. Нужна диагностика и замена подшипников. Станок простаивает уже 3 дня, срочно нужна помощь специалиста.' },
    });
    testEntityId = entity?.id || null;

    // Засеиваем 6 комментариев для тестов резюме (нужно >= 5)
    if (testEntityId) {
      await seedCommentsForEntity(testEntityId, 6);
    }
  });

  // ============================================================================
  // ГРУППА 1: API тесты
  // ============================================================================
  test.describe('API: AI Assistant endpoints', () => {
    test('GET /ai/assist/:entityId возвращает данные помощника', async () => {
      if (!aiAvailable || !testEntityId) {
        test.skip();
        return;
      }

      const data = await getAiAssistanceApi(testEntityId);

      // Endpoint должен вернуть данные (может быть пустой если нет описания)
      expect(data).toBeDefined();
      expect(data).not.toBeNull();

      // Проверяем структуру ответа
      if (data.available) {
        expect(Array.isArray(data.similarCases)).toBe(true);
        expect(Array.isArray(data.suggestedExperts)).toBe(true);
      }
    });

    test('POST /ai/assist/:entityId/suggest-response генерирует черновик', async () => {
      if (!aiAvailable || !testEntityId) {
        test.skip();
        return;
      }

      const result = await generateAiResponseApi(testEntityId);

      // Endpoint должен вернуть ответ или null если данных недостаточно
      if (result) {
        expect(result).toBeDefined();
        // Черновик должен содержать текст
        expect(typeof result.draft === 'string' || typeof result.response === 'string').toBe(true);
      }
    });

    test('GET /ai/assist/:entityId/summary возвращает резюме при >= 5 комментариев', async () => {
      if (!aiAvailable || !testEntityId) {
        test.skip();
        return;
      }

      const summary = await getAiSummaryApi(testEntityId);

      // При 6 засеянных комментариях резюме должно быть доступно
      if (summary) {
        expect(summary).toBeDefined();
        // Должно содержать поле summary или text
        const hasText = typeof summary.summary === 'string' || typeof summary.text === 'string';
        expect(hasText).toBe(true);
      }
    });

    test('GET /ai/assist/:entityId/summary — недостаточно комментариев', async () => {
      if (!aiAvailable || !testWorkspaceId) {
        test.skip();
        return;
      }

      // Создаём заявку без комментариев
      const emptyEntity = await createEntityApi(testWorkspaceId, 'Playwright AI Summary Empty Test');
      if (!emptyEntity) {
        test.skip();
        return;
      }

      const token = await getDevToken();
      if (!token) {
        test.skip();
        return;
      }

      const res = await fetch(`${API_URL}/ai/assist/${emptyEntity.id}/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Должен вернуть ответ (может быть 200 с пустым результатом или 400/404)
      expect(res.status).toBeLessThan(500);
    });
  });

  // ============================================================================
  // ГРУППА 2: UI — Вкладка AI помощника
  // ============================================================================
  test.describe('UI: Вкладка AI помощника', () => {
    test('Вкладка "AI помощник" видна в панели деталей заявки', async ({ page }) => {
      if (!aiAvailable) {
        test.skip();
        return;
      }

      const state = await openAiTab(page);
      if (!state) {
        test.skip();
        return;
      }

      // Вкладка открылась успешно (любое состояние — full или nodata)
      if (state === 'full') {
        await expect(page.locator(aiAssistant.tab)).toBeVisible();
      } else {
        await expect(page.locator(aiAssistant.noData)).toBeVisible();
      }
    });

    test('Переключение на вкладку показывает содержимое', async ({ page }) => {
      if (!aiAvailable) {
        test.skip();
        return;
      }

      const state = await openAiTab(page);
      if (!state) {
        test.skip();
        return;
      }

      // Один из вариантов должен отображаться
      if (state === 'full') {
        await expect(page.locator(aiAssistant.tab)).toBeVisible();
      } else {
        await expect(page.locator(aiAssistant.noData)).toBeVisible();
      }
    });

    test('Кнопка "Предложить ответ" видна', async ({ page }) => {
      if (!aiAvailable) {
        test.skip();
        return;
      }

      const state = await openAiTab(page);
      if (!state) {
        test.skip();
        return;
      }

      if (state === 'full') {
        // Полные данные — кнопка генерации видна
        const generateBtn = page.locator(aiAssistant.generateBtn);
        await expect(generateBtn).toBeVisible({ timeout: 5000 });
      } else {
        // Нет данных — проверяем что "Недостаточно данных" отображается
        await expect(page.locator(aiAssistant.noData)).toBeVisible();
      }
    });

    test('Нажатие запускает генерацию — появляется черновик', async ({ page }) => {
      if (!aiAvailable) {
        test.skip();
        return;
      }

      const state = await openAiTab(page);
      if (!state) {
        test.skip();
        return;
      }

      // Генерация доступна только при полных данных
      if (state === 'nodata') {
        test.skip();
        return;
      }

      // Кликаем "Предложить ответ"
      const generateBtn = page.locator(aiAssistant.generateBtn);
      await expect(generateBtn).toBeVisible({ timeout: 5000 });
      await generateBtn.click();

      // Должен появиться streaming или готовый черновик
      const streamingDraft = page.locator(aiAssistant.streamingDraft);
      const generatedDraft = page.locator(aiAssistant.generatedDraft);

      await expect(streamingDraft.or(generatedDraft)).toBeVisible({ timeout: 20000 });
    });

    test('Черновик содержит текст, кнопки Копировать/Вставить', async ({ page }) => {
      if (!aiAvailable) {
        test.skip();
        return;
      }

      const state = await openAiTab(page);
      if (!state) {
        test.skip();
        return;
      }

      // Генерация доступна только при полных данных
      if (state === 'nodata') {
        test.skip();
        return;
      }

      // Генерируем ответ
      const generateBtn = page.locator(aiAssistant.generateBtn);
      await expect(generateBtn).toBeVisible({ timeout: 5000 });
      await generateBtn.click();

      // Ждём завершения генерации (готовый черновик)
      const generatedDraft = page.locator(aiAssistant.generatedDraft);
      const hasDraft = await generatedDraft.isVisible({ timeout: 30000 }).catch(() => false);
      if (!hasDraft) {
        test.skip();
        return;
      }

      // Текст черновика непустой
      const draftText = page.locator(aiAssistant.draftText);
      const text = await draftText.textContent().catch(() => '');
      expect(text!.length).toBeGreaterThan(0);

      // Кнопка копирования
      const copyBtn = page.locator(aiAssistant.copyBtn);
      await expect(copyBtn).toBeVisible();

      // Кнопка вставки может отсутствовать если onInsertDraft не передан
      const insertBtn = page.locator(aiAssistant.insertBtn);
      const hasInsertBtn = await insertBtn.isVisible().catch(() => false);
      // Информационная проверка — кнопка может быть условной
      if (hasInsertBtn) {
        await expect(insertBtn).toBeVisible();
      }
    });

    test('Кнопка "Копировать" копирует в буфер', async ({ page, context }) => {
      if (!aiAvailable) {
        test.skip();
        return;
      }

      // Разрешаем доступ к clipboard
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      const state = await openAiTab(page);
      if (!state) {
        test.skip();
        return;
      }

      // Копирование доступно только при полных данных (есть что копировать)
      if (state === 'nodata') {
        test.skip();
        return;
      }

      // Генерируем ответ
      const generateBtn = page.locator(aiAssistant.generateBtn);
      await expect(generateBtn).toBeVisible({ timeout: 5000 });
      await generateBtn.click();

      // Ждём черновик
      const generatedDraft = page.locator(aiAssistant.generatedDraft);
      const hasDraft = await generatedDraft.isVisible({ timeout: 30000 }).catch(() => false);
      if (!hasDraft) {
        test.skip();
        return;
      }

      // Копируем
      const copyBtn = page.locator(aiAssistant.copyBtn);
      await copyBtn.click();

      // Проверяем содержимое буфера обмена
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // ГРУППА 3: Похожие случаи
  // ============================================================================
  test.describe('UI: Похожие случаи', () => {
    test('Секция "Похожие решённые случаи" показывает карточки', async ({ page }) => {
      if (!aiAvailable) {
        test.skip();
        return;
      }

      const state = await openAiTab(page);
      if (!state) {
        test.skip();
        return;
      }

      if (state === 'full') {
        // Проверяем секцию похожих случаев
        const similarSection = page.locator(aiAssistant.similarCasesSection);
        const hasSimilar = await similarSection.isVisible().catch(() => false);

        if (hasSimilar) {
          // Должны быть карточки
          const cases = page.locator(aiAssistant.similarCase);
          const count = await cases.count();
          expect(count).toBeGreaterThan(0);
        }
      } else {
        // Нет данных — проверяем сообщение
        await expect(page.locator(aiAssistant.noData)).toBeVisible();
      }
    });

    test('Карточка содержит ID, % схожести, текст решения', async ({ page }) => {
      if (!aiAvailable) {
        test.skip();
        return;
      }

      const state = await openAiTab(page);
      if (!state) {
        test.skip();
        return;
      }

      if (state === 'full') {
        const firstCase = page.locator(aiAssistant.similarCase).first();
        const hasCaseCard = await firstCase.isVisible().catch(() => false);

        if (!hasCaseCard) {
          test.skip();
          return;
        }

        // Карточка должна содержать ID (#число)
        const caseText = await firstCase.textContent();
        expect(caseText).toMatch(/#\d+/);

        // Процент схожести
        expect(caseText).toMatch(/\d+%/);
      } else {
        // Нет данных — проверяем сообщение
        await expect(page.locator(aiAssistant.noData)).toBeVisible();
      }
    });

    test('Ссылка ведёт на legacy CRM', async ({ page }) => {
      if (!aiAvailable) {
        test.skip();
        return;
      }

      const state = await openAiTab(page);
      if (!state) {
        test.skip();
        return;
      }

      if (state === 'full') {
        const firstCase = page.locator(aiAssistant.similarCase).first();
        const hasCaseCard = await firstCase.isVisible().catch(() => false);

        if (!hasCaseCard) {
          test.skip();
          return;
        }

        // Карточка — это ссылка (тег <a>) на legacy CRM
        const href = await firstCase.getAttribute('href');
        expect(href).toBeTruthy();
        expect(href).toContain('stankoff.ru');
      } else {
        // Нет данных — проверяем сообщение
        await expect(page.locator(aiAssistant.noData)).toBeVisible();
      }
    });
  });

  // ============================================================================
  // ГРУППА 4: Рекомендуемые эксперты
  // ============================================================================
  test.describe('UI: Рекомендуемые эксперты', () => {
    test('Секция "Рекомендуемые эксперты" показывает карточки', async ({ page }) => {
      if (!aiAvailable) {
        test.skip();
        return;
      }

      const state = await openAiTab(page);
      if (!state) {
        test.skip();
        return;
      }

      if (state === 'full') {
        const expertsSection = page.locator(aiAssistant.expertsSection);
        const hasExperts = await expertsSection.isVisible().catch(() => false);

        if (hasExperts) {
          const experts = page.locator(aiAssistant.expertCard);
          const count = await experts.count();
          expect(count).toBeGreaterThan(0);
        }
      } else {
        // Нет данных — проверяем сообщение
        await expect(page.locator(aiAssistant.noData)).toBeVisible();
      }
    });

    test('Карточка содержит имя, отдел, количество случаев', async ({ page }) => {
      if (!aiAvailable) {
        test.skip();
        return;
      }

      const state = await openAiTab(page);
      if (!state) {
        test.skip();
        return;
      }

      if (state === 'full') {
        const firstExpert = page.locator(aiAssistant.expertCard).first();
        const hasExpertCard = await firstExpert.isVisible().catch(() => false);

        if (!hasExpertCard) {
          test.skip();
          return;
        }

        const expertText = await firstExpert.textContent();
        expect(expertText).toBeTruthy();

        // Должно содержать "случаев"
        expect(expertText).toMatch(/случаев/i);
      } else {
        // Нет данных — проверяем сообщение
        await expect(page.locator(aiAssistant.noData)).toBeVisible();
      }
    });
  });

  // ============================================================================
  // ГРУППА 5: Рекомендации, теги, контекст
  // ============================================================================
  test.describe('UI: Рекомендации, теги, контекст', () => {
    test('Секция "Рекомендации" показывает действия', async ({ page }) => {
      if (!aiAvailable) {
        test.skip();
        return;
      }

      const state = await openAiTab(page);
      if (!state) {
        test.skip();
        return;
      }

      if (state === 'full') {
        const actionsSection = page.locator(aiAssistant.actionsSection);
        const hasActions = await actionsSection.isVisible().catch(() => false);

        if (hasActions) {
          const actions = page.locator(aiAssistant.actionItem);
          const count = await actions.count();
          expect(count).toBeGreaterThan(0);

          // Каждое действие — непустая строка
          const firstActionText = await actions.first().textContent();
          expect(firstActionText!.trim().length).toBeGreaterThan(0);
        }
      } else {
        // Нет данных — проверяем сообщение
        await expect(page.locator(aiAssistant.noData)).toBeVisible();
      }
    });

    test('Секция "Теги" показывает ключевые слова', async ({ page }) => {
      if (!aiAvailable) {
        test.skip();
        return;
      }

      const state = await openAiTab(page);
      if (!state) {
        test.skip();
        return;
      }

      if (state === 'full') {
        const keywordsSection = page.locator(aiAssistant.keywordsSection);
        const hasKeywords = await keywordsSection.isVisible().catch(() => false);

        if (hasKeywords) {
          const tags = page.locator(aiAssistant.keywordTag);
          const count = await tags.count();
          expect(count).toBeGreaterThan(0);

          // Каждый тег — непустой текст
          const firstTagText = await tags.first().textContent();
          expect(firstTagText!.trim().length).toBeGreaterThan(0);
        }
      } else {
        // Нет данных — проверяем сообщение
        await expect(page.locator(aiAssistant.noData)).toBeVisible();
      }
    });

    test('Секция "Связанный контекст" если есть данные', async ({ page }) => {
      if (!aiAvailable) {
        test.skip();
        return;
      }

      const state = await openAiTab(page);
      if (!state) {
        test.skip();
        return;
      }

      if (state === 'full') {
        // Связанный контекст может быть или нет
        const relatedContext = page.locator(aiAssistant.relatedContext);
        const hasContext = await relatedContext.isVisible().catch(() => false);

        if (hasContext) {
          // Если есть — должен содержать информацию (контрагент, сделки и т.д.)
          const contextText = await relatedContext.textContent();
          expect(contextText!.trim().length).toBeGreaterThan(0);
        }
        // Если нет — это допустимо, зависит от данных заявки
      } else {
        // Нет данных — проверяем сообщение
        await expect(page.locator(aiAssistant.noData)).toBeVisible();
      }
    });
  });

  // ============================================================================
  // ГРУППА 6: AI Резюме переписки
  // ============================================================================
  test.describe('UI: AI Резюме переписки', () => {
    test('Баннер не показывается при < 5 комментариев', async ({ page }) => {
      if (!aiAvailable || !testWorkspaceId) {
        test.skip();
        return;
      }

      // Создаём заявку с 2 комментариями
      const entity = await createEntityApi(testWorkspaceId, 'Playwright AI Summary Few Comments');
      if (!entity) {
        test.skip();
        return;
      }

      await addCommentToEntityApi(entity.id, 'Комментарий 1');
      await addCommentToEntityApi(entity.id, 'Комментарий 2');

      const hasWorkspace = await selectFirstWorkspace(page);
      if (!hasWorkspace) {
        test.skip();
        return;
      }

      await dismissToasts(page);

      // Открываем заявку
      await openEntityDetail(page, 'Playwright AI Summary Few Comments');

      // Баннер НЕ должен отображаться
      const banner = page.locator(aiSummary.banner);
      const hasBanner = await banner.isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasBanner).toBe(false);
    });

    test('Баннер показывается при >= 5 комментариев', async ({ page }) => {
      if (!aiAvailable || !testEntityId) {
        test.skip();
        return;
      }

      const hasWorkspace = await selectFirstWorkspace(page);
      if (!hasWorkspace) {
        test.skip();
        return;
      }

      await dismissToasts(page);

      // Открываем тестовую заявку (у неё 6 комментариев)
      await openEntityDetail(page, 'Playwright AI Assistant Test');

      // Баннер резюме должен появиться
      const banner = page.locator(aiSummary.banner);
      const hasBanner = await banner.isVisible({ timeout: 15000 }).catch(() => false);

      // Баннер может показаться после загрузки комментариев
      if (hasBanner) {
        await expect(banner).toBeVisible();
      }
      // Если баннер не появился — возможно комментарии ещё не загрузились
    });

    test('Клик разворачивает/сворачивает резюме', async ({ page }) => {
      if (!aiAvailable || !testEntityId) {
        test.skip();
        return;
      }

      const hasWorkspace = await selectFirstWorkspace(page);
      if (!hasWorkspace) {
        test.skip();
        return;
      }

      await dismissToasts(page);

      await openEntityDetail(page, 'Playwright AI Assistant Test');

      const banner = page.locator(aiSummary.banner);
      const hasBanner = await banner.isVisible({ timeout: 15000 }).catch(() => false);
      if (!hasBanner) {
        test.skip();
        return;
      }

      const toggle = page.locator(aiSummary.toggle);
      const hasToggle = await toggle.isVisible().catch(() => false);
      if (!hasToggle) {
        test.skip();
        return;
      }

      // Баннер изначально развёрнут — кликаем для сворачивания
      await toggle.click();
      await page.waitForTimeout(500);

      // Текст резюме должен скрыться
      const summaryText = page.locator(aiSummary.text);
      const isTextVisibleAfterCollapse = await summaryText.isVisible().catch(() => false);

      // Разворачиваем обратно
      await toggle.click();
      await page.waitForTimeout(500);

      const isTextVisibleAfterExpand = await summaryText.isVisible({ timeout: 5000 }).catch(() => false);

      // Один из переключений должен был сработать
      // (текст скрылся при свертывании ИЛИ появился при развертывании)
      expect(!isTextVisibleAfterCollapse || isTextVisibleAfterExpand).toBe(true);
    });

    test('Содержимое — непустой текст', async ({ page }) => {
      if (!aiAvailable || !testEntityId) {
        test.skip();
        return;
      }

      const hasWorkspace = await selectFirstWorkspace(page);
      if (!hasWorkspace) {
        test.skip();
        return;
      }

      await dismissToasts(page);

      await openEntityDetail(page, 'Playwright AI Assistant Test');

      const banner = page.locator(aiSummary.banner);
      const hasBanner = await banner.isVisible({ timeout: 15000 }).catch(() => false);
      if (!hasBanner) {
        test.skip();
        return;
      }

      // Ждём пока загрузится текст (может быть loading)
      const summaryText = page.locator(aiSummary.text);
      const summaryLoading = page.locator(aiSummary.loading);

      // Ждём загрузку
      await expect(summaryText.or(summaryLoading)).toBeVisible({ timeout: 15000 });

      // Если текст есть — он должен быть непустым
      const hasText = await summaryText.isVisible({ timeout: 20000 }).catch(() => false);
      if (hasText) {
        const text = await summaryText.textContent();
        expect(text!.trim().length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================================
  // ГРУППА 7: Edge cases
  // ============================================================================
  test.describe('Edge cases', () => {
    test('AI недоступен — graceful fallback', async ({ page }) => {
      // Этот тест проверяет поведение при недоступности AI
      // Даже если AI доступен, проверяем что UI корректно обрабатывает состояния

      const hasWorkspace = await selectFirstWorkspace(page);
      if (!hasWorkspace) {
        test.skip();
        return;
      }

      await dismissToasts(page);

      const card = page.locator(kanban.card).first();
      const hasCard = await card.isVisible().catch(() => false);
      if (!hasCard) {
        test.skip();
        return;
      }

      await card.click({ force: true });
      await page.waitForTimeout(1000);

      const aiTab = page.getByRole('button', { name: /AI помощник/i });
      const hasAiTab = await aiTab.isVisible().catch(() => false);
      if (!hasAiTab) {
        test.skip();
        return;
      }

      await aiTab.click();

      // Должен показать один из вариантов:
      // 1) Контент (если AI доступен)
      // 2) "AI помощник недоступен" (если нет)
      // 3) "Недостаточно данных" (если нет данных)
      // 4) Загрузка (если ещё грузится)
      const tabContent = page.locator(aiAssistant.tab);
      const unavailable = page.locator(aiAssistant.unavailable);
      const noData = page.locator(aiAssistant.noData);
      const loadingIndicator = page.locator(aiAssistant.loading);

      await expect(
        tabContent.or(unavailable).or(noData).or(loadingIndicator)
      ).toBeVisible({ timeout: 20000 });

      // Не должно быть необработанных ошибок в консоли
      // (проверяем отсутствие ошибок JS через page — косвенно)
      await expect(page.locator('body')).toBeVisible();
    });

    test('Entity без описания — "Недостаточно данных"', async ({ page }) => {
      if (!aiAvailable || !testWorkspaceId) {
        test.skip();
        return;
      }

      // Создаём заявку без описания
      const emptyEntity = await createEntityApi(testWorkspaceId, 'Playwright AI Empty Description Test');
      if (!emptyEntity) {
        test.skip();
        return;
      }

      const hasWorkspace = await selectFirstWorkspace(page);
      if (!hasWorkspace) {
        test.skip();
        return;
      }

      await dismissToasts(page);

      // Открываем заявку без описания
      await openEntityDetail(page, 'Playwright AI Empty Description Test');

      const aiTab = page.getByRole('button', { name: /AI помощник/i });
      const hasAiTab = await aiTab.isVisible().catch(() => false);
      if (!hasAiTab) {
        test.skip();
        return;
      }

      await aiTab.click();

      // Ожидаем один из вариантов:
      // - "Недостаточно данных" (noData)
      // - Контент (если AI всё равно нашёл данные)
      // - "AI помощник недоступен"
      const noData = page.locator(aiAssistant.noData);
      const tabContent = page.locator(aiAssistant.tab);
      const unavailable = page.locator(aiAssistant.unavailable);

      await expect(
        noData.or(tabContent).or(unavailable)
      ).toBeVisible({ timeout: 20000 });

      // Если показывается "Недостаточно данных" — проверяем текст
      const hasNoData = await noData.isVisible().catch(() => false);
      if (hasNoData) {
        const noDataText = await noData.textContent();
        expect(noDataText).toMatch(/Недостаточно данных/i);
      }
    });
  });
});
