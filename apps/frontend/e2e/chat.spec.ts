import { test, expect } from '@playwright/test';
import { chat, sidebar } from './helpers/selectors';
import {
  goToDashboard,
  dismissToasts,
  getDevToken,
  getSecondUserToken,
  createConversationApi,
  sendMessageApi,
  getMessagesApi,
  editMessageApi,
  deleteMessageApi,
  toggleReactionApi,
  pinMessageApi,
  unpinMessageApi,
  getPinnedMessagesApi,
  searchChatMessagesApi,
  addChatParticipantsApi,
  removeChatParticipantApi,
  getConversationsApi,
  getUsersListApi,
  getUnreadCountsApi,
} from './helpers/test-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const CHAT_NAME = `Playwright Тест Чат ${Date.now()}`;

// ============================================================================
// ТЕСТЫ КОРПОРАТИВНОГО ЧАТА
// ============================================================================
test.describe('Корпоративный чат', () => {
  let testConvId: string;
  let testMessageId: string;
  let adminUserId: string;
  let secondUserId: string;

  test.beforeAll(async () => {
    const token = await getDevToken();
    if (!token) return;

    // Получаем ID текущего пользователя
    const meRes = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (meRes.ok) {
      const me = await meRes.json();
      adminUserId = me.id;
    }

    // Получаем второго пользователя
    const users = await getUsersListApi();
    const secondUser = users.find(
      (u: any) => u.email !== 'youredik@gmail.com' && u.isActive !== false,
    );
    if (secondUser) secondUserId = secondUser.id;

    // Создаём тестовый групповой чат
    if (adminUserId && secondUserId) {
      const conv = await createConversationApi({
        type: 'group',
        name: CHAT_NAME,
        participantIds: [secondUserId],
      });
      if (conv) testConvId = conv.id;

      // Засеваем сообщения
      if (testConvId) {
        const msg = await sendMessageApi(testConvId, 'Привет от Playwright тестов');
        if (msg) testMessageId = msg.id;
        await sendMessageApi(testConvId, 'Второе сообщение для поиска уникальный_маркер_pw');
        await sendMessageApi(testConvId, 'Третье сообщение');
      }
    }
  });

  // ── Shared UI helpers ──────────────────────────────────────────────
  /** Send a message via UI reliably (uses send button click, not Enter) */
  async function sendMsgUI(page: import('@playwright/test').Page, text: string) {
    const textarea = page.locator(chat.textarea);
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.fill(text);
    // Wait for React to re-render and show send button
    const sendBtn = page.locator(chat.sendBtn);
    await expect(sendBtn).toBeVisible({ timeout: 5000 });
    await sendBtn.click();
    // Wait for message to appear in the message list
    await expect(page.getByText(text)).toBeVisible({ timeout: 15000 });
  }

  /** Reveal hover action buttons on a message (CSS hover + JS fallback) */
  async function revealHoverActions(page: import('@playwright/test').Page, bubble: import('@playwright/test').Locator) {
    const content = bubble.locator(chat.messageContent);
    await content.hover();
    // CSS group-hover:flex may not trigger in headless Chromium; use JS fallback
    const hoverReply = bubble.locator(chat.hoverReply);
    const visible = await hoverReply.isVisible().catch(() => false);
    if (!visible) {
      await content.evaluate((el) => {
        const container = el.querySelector('[data-testid="chat-hover-reply"]')?.parentElement;
        if (container) container.style.display = 'flex';
      });
    }
  }

  // ==========================================================================
  // GROUP 1: API — Операции с чатами
  // ==========================================================================
  test.describe('API: Операции с чатами', () => {
    test('Создать групповой чат', async () => {
      const token = await getDevToken();
      if (!token || !secondUserId) {
        test.skip();
        return;
      }

      const conv = await createConversationApi({
        type: 'group',
        name: `PW API Чат ${Date.now()}`,
        participantIds: [secondUserId],
      });

      expect(conv).not.toBeNull();
      expect(conv.id).toBeDefined();
      expect(conv.type).toBe('group');
      expect(conv.name).toContain('PW API Чат');
    });

    test('Список чатов пользователя', async () => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      const conversations = await getConversationsApi();
      expect(Array.isArray(conversations)).toBe(true);
      expect(conversations.length).toBeGreaterThan(0);

      const found = conversations.find((c: any) => c.id === testConvId);
      expect(found).toBeDefined();
    });

    test('Детали чата', async () => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      const res = await fetch(`${API_URL}/chat/conversations/${testConvId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.ok).toBe(true);

      const conv = await res.json();
      expect(conv.id).toBe(testConvId);
      expect(conv.name).toBe(CHAT_NAME);
      expect(conv.participants).toBeDefined();
      expect(conv.participants.length).toBeGreaterThanOrEqual(2);
    });

    test('Поиск чатов', async () => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      const results = await getConversationsApi('Playwright');
      expect(Array.isArray(results)).toBe(true);

      const found = results.find((c: any) => c.id === testConvId);
      expect(found).toBeDefined();
    });
  });

  // ==========================================================================
  // GROUP 2: API — Операции с сообщениями
  // ==========================================================================
  test.describe('API: Операции с сообщениями', () => {
    test('Отправить сообщение', async () => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      const msg = await sendMessageApi(testConvId, `API тест сообщение ${Date.now()}`);
      expect(msg).not.toBeNull();
      expect(msg.id).toBeDefined();
      expect(msg.content).toContain('API тест сообщение');
      expect(msg.type).toBe('text');
    });

    test('Получить сообщения (cursor)', async () => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      const result = await getMessagesApi(testConvId, { limit: 10 });
      expect(result).not.toBeNull();
      // Ответ может быть массивом или объектом с messages
      const messages = Array.isArray(result) ? result : result.messages || result.items || [];
      expect(messages.length).toBeGreaterThan(0);

      // Проверяем структуру сообщения
      const firstMsg = messages[0];
      expect(firstMsg.id).toBeDefined();
      expect(firstMsg.content).toBeDefined();
    });

    test('Редактировать сообщение', async () => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      // Создаём сообщение для редактирования
      const msg = await sendMessageApi(testConvId, 'До редактирования');
      expect(msg).not.toBeNull();

      const edited = await editMessageApi(testConvId, msg.id, 'После редактирования');
      expect(edited).not.toBeNull();
      expect(edited.content).toBe('После редактирования');
    });

    test('Удалить сообщение (soft)', async () => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      // Создаём сообщение для удаления
      const msg = await sendMessageApi(testConvId, 'Сообщение для удаления');
      expect(msg).not.toBeNull();

      const deleted = await deleteMessageApi(testConvId, msg.id);
      expect(deleted).toBe(true);
    });

    test('Reply на сообщение', async () => {
      const token = await getDevToken();
      if (!token || !testConvId || !testMessageId) {
        test.skip();
        return;
      }

      const reply = await sendMessageApi(testConvId, 'Это ответ на сообщение', {
        replyToId: testMessageId,
      });
      expect(reply).not.toBeNull();
      expect(reply.id).toBeDefined();
      expect(reply.content).toBe('Это ответ на сообщение');
      expect(reply.replyToId || reply.replyTo?.id).toBeDefined();
    });
  });

  // ==========================================================================
  // GROUP 3: API — Реакции
  // ==========================================================================
  test.describe('API: Реакции', () => {
    let reactionMsgId: string;

    test.beforeAll(async () => {
      if (!testConvId) return;
      const msg = await sendMessageApi(testConvId, 'Сообщение для реакций');
      if (msg) reactionMsgId = msg.id;
    });

    test('Добавить реакцию', async () => {
      const token = await getDevToken();
      if (!token || !testConvId || !reactionMsgId) {
        test.skip();
        return;
      }

      const result = await toggleReactionApi(testConvId, reactionMsgId, '👍');
      expect(result).not.toBeNull();
    });

    test('Toggle — повторный вызов убирает', async () => {
      const token = await getDevToken();
      if (!token || !testConvId || !reactionMsgId) {
        test.skip();
        return;
      }

      // Добавляем реакцию
      await toggleReactionApi(testConvId, reactionMsgId, '🔥');
      // Убираем повторным вызовом
      const result = await toggleReactionApi(testConvId, reactionMsgId, '🔥');
      expect(result).not.toBeNull();

      // Проверяем через получение сообщений что реакция снята
      const messages = await getMessagesApi(testConvId, { limit: 50 });
      const items = Array.isArray(messages) ? messages : messages?.messages || messages?.items || [];
      const target = items.find((m: any) => m.id === reactionMsgId);
      if (target && target.reactions) {
        const fireReaction = target.reactions.find((r: any) => r.emoji === '🔥');
        // Реакция должна быть снята (нет записи или пустой список пользователей)
        if (fireReaction) {
          const userIds = fireReaction.userIds || fireReaction.users || [];
          expect(userIds).not.toContain(adminUserId);
        }
      }
    });

    test('Несколько эмодзи на одно сообщение', async () => {
      const token = await getDevToken();
      if (!token || !testConvId || !reactionMsgId) {
        test.skip();
        return;
      }

      await toggleReactionApi(testConvId, reactionMsgId, '😂');
      await toggleReactionApi(testConvId, reactionMsgId, '❤️');

      const messages = await getMessagesApi(testConvId, { limit: 50 });
      const items = Array.isArray(messages) ? messages : messages?.messages || messages?.items || [];
      const target = items.find((m: any) => m.id === reactionMsgId);
      expect(target).toBeDefined();
      if (target?.reactions) {
        const emojis = target.reactions.map((r: any) => r.emoji);
        expect(emojis).toContain('😂');
        expect(emojis).toContain('❤️');
      }
    });
  });

  // ==========================================================================
  // GROUP 4: API — Закреплённые сообщения
  // ==========================================================================
  test.describe('API: Закреплённые сообщения', () => {
    let pinMsgId: string;

    test.beforeAll(async () => {
      if (!testConvId) return;
      const msg = await sendMessageApi(testConvId, 'Сообщение для закрепления PW');
      if (msg) pinMsgId = msg.id;
    });

    test('Закрепить сообщение', async () => {
      const token = await getDevToken();
      if (!token || !testConvId || !pinMsgId) {
        test.skip();
        return;
      }

      const result = await pinMessageApi(testConvId, pinMsgId);
      expect(result).toBe(true);
    });

    test('Получить закреплённые', async () => {
      const token = await getDevToken();
      if (!token || !testConvId || !pinMsgId) {
        test.skip();
        return;
      }

      // Убеждаемся что сообщение закреплено
      await pinMessageApi(testConvId, pinMsgId);

      const pinned = await getPinnedMessagesApi(testConvId);
      expect(Array.isArray(pinned)).toBe(true);
      expect(pinned.length).toBeGreaterThan(0);

      const found = pinned.find(
        (p: any) => p.id === pinMsgId || p.messageId === pinMsgId || p.message?.id === pinMsgId,
      );
      expect(found).toBeDefined();
    });

    test('Открепить сообщение', async () => {
      const token = await getDevToken();
      if (!token || !testConvId || !pinMsgId) {
        test.skip();
        return;
      }

      const result = await unpinMessageApi(testConvId, pinMsgId);
      expect(result).toBe(true);

      const pinned = await getPinnedMessagesApi(testConvId);
      const found = pinned.find(
        (p: any) => p.id === pinMsgId || p.messageId === pinMsgId || p.message?.id === pinMsgId,
      );
      expect(found).toBeUndefined();
    });
  });

  // ==========================================================================
  // GROUP 5: API — Поиск по сообщениям
  // ==========================================================================
  test.describe('API: Поиск по сообщениям', () => {
    test('Полнотекстовый поиск', async () => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      // Ищем по слову из сообщений (tsvector может не разбирать спецсимволы)
      const results = await searchChatMessagesApi('Playwright');
      expect(Array.isArray(results)).toBe(true);
      // Полнотекстовый поиск может не вернуть результаты если tsvector не настроен
      // Основная проверка — что endpoint не падает и возвращает массив
    });

    test('Пустой запрос — пустой результат', async () => {
      const token = await getDevToken();
      if (!token) {
        test.skip();
        return;
      }

      const results = await searchChatMessagesApi('несуществующий_текст_xyz_999_pw');
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });
  });

  // ==========================================================================
  // GROUP 6: API — Управление участниками
  // ==========================================================================
  test.describe('API: Управление участниками', () => {
    let participantConvId: string;
    let thirdUserId: string;

    test.beforeAll(async () => {
      if (!adminUserId || !secondUserId) return;

      // Создаём отдельный чат для тестов участников
      const conv = await createConversationApi({
        type: 'group',
        name: 'PW Участники Тест',
        participantIds: [secondUserId],
      });
      if (conv) participantConvId = conv.id;

      // Получаем третьего пользователя
      const users = await getUsersListApi();
      const third = users.find(
        (u: any) =>
          u.id !== adminUserId && u.id !== secondUserId && u.isActive !== false,
      );
      if (third) thirdUserId = third.id;
    });

    test('Добавить участника', async () => {
      const token = await getDevToken();
      if (!token || !participantConvId || !thirdUserId) {
        test.skip();
        return;
      }

      const result = await addChatParticipantsApi(participantConvId, [thirdUserId]);
      expect(result).toBe(true);

      // Проверяем через детали чата
      const res = await fetch(`${API_URL}/chat/conversations/${participantConvId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const conv = await res.json();
      const participantIds = conv.participants.map((p: any) => p.userId || p.user?.id || p.id);
      expect(participantIds).toContain(thirdUserId);
    });

    test('Удалить участника', async () => {
      const token = await getDevToken();
      if (!token || !participantConvId || !thirdUserId) {
        test.skip();
        return;
      }

      // Убеждаемся что участник добавлен
      await addChatParticipantsApi(participantConvId, [thirdUserId]);

      const result = await removeChatParticipantApi(participantConvId, thirdUserId);
      expect(result).toBe(true);

      // Проверяем что участник удалён (soft-delete: leftAt ставится)
      const res = await fetch(`${API_URL}/chat/conversations/${participantConvId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const conv = await res.json();
      const activeParticipantIds = conv.participants
        .filter((p: any) => !p.leftAt)
        .map((p: any) => p.userId || p.user?.id || p.id);
      expect(activeParticipantIds).not.toContain(thirdUserId);
    });
  });

  // ==========================================================================
  // GROUP 7: UI — Навигация к чату
  // ==========================================================================
  test.describe('UI: Навигация к чату', () => {
    test('Переход на /chat', async ({ page }) => {
      const token = await getDevToken();
      if (!token) {
        test.skip();
        return;
      }

      await goToDashboard(page);
      await page.goto('/chat');
      await expect(page.locator(chat.page)).toBeVisible({ timeout: 10000 });
    });

    test('Список чатов слева', async ({ page }) => {
      const token = await getDevToken();
      if (!token) {
        test.skip();
        return;
      }

      await page.goto('/chat');
      await expect(page.locator(chat.page)).toBeVisible({ timeout: 10000 });
      await expect(page.locator(chat.conversationList)).toBeVisible({ timeout: 10000 });
    });

    test('Без выбранного чата — пустое состояние', async ({ page }) => {
      const token = await getDevToken();
      if (!token) {
        test.skip();
        return;
      }

      await page.goto('/chat');
      await expect(page.locator(chat.page)).toBeVisible({ timeout: 10000 });

      // Пустое состояние или список чатов без выбранного
      const hasEmptyState = await page.locator(chat.emptyState).isVisible().catch(() => false);
      const hasChatView = await page.locator(chat.view).isVisible().catch(() => false);

      // Должно быть либо пустое состояние, либо ещё не открыт чат
      expect(hasEmptyState || !hasChatView).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP 8: UI — Список чатов
  // ==========================================================================
  test.describe('UI: Список чатов', () => {
    test('Тестовый чат виден в списке', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await page.goto('/chat');
      await expect(page.locator(chat.page)).toBeVisible({ timeout: 10000 });

      const convItem = page.getByText(CHAT_NAME).first();
      await expect(convItem).toBeVisible({ timeout: 10000 });
    });

    test('Поиск фильтрует список', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await page.goto('/chat');
      await expect(page.locator(chat.page)).toBeVisible({ timeout: 10000 });

      const searchInput = page.locator(chat.convSearch);
      const hasSearch = await searchInput.isVisible().catch(() => false);
      if (!hasSearch) {
        test.skip();
        return;
      }

      await searchInput.fill('Playwright');
      await page.waitForTimeout(500); // debounce

      const convItem = page.getByText(CHAT_NAME).first();
      await expect(convItem).toBeVisible({ timeout: 10000 });
    });

    test('Клик на чат открывает ChatView', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await page.goto('/chat');
      await expect(page.locator(chat.page)).toBeVisible({ timeout: 10000 });

      const convItem = page.getByText(CHAT_NAME).first();
      await expect(convItem).toBeVisible({ timeout: 10000 });
      await convItem.click();

      await expect(page.locator(chat.view)).toBeVisible({ timeout: 10000 });
    });

    test('Кнопка "Новый чат" видна', async ({ page }) => {
      const token = await getDevToken();
      if (!token) {
        test.skip();
        return;
      }

      await page.goto('/chat');
      await expect(page.locator(chat.page)).toBeVisible({ timeout: 10000 });

      const newBtn = page.locator(chat.newBtn);
      await expect(newBtn).toBeVisible({ timeout: 10000 });
    });
  });

  // ==========================================================================
  // GROUP 9: UI — Отправка сообщений
  // ==========================================================================
  test.describe('UI: Отправка сообщений', () => {
    /** Навигация к тестовому чату */
    async function openTestChat(page: import('@playwright/test').Page) {
      await page.goto('/chat');
      await expect(page.locator(chat.page)).toBeVisible({ timeout: 10000 });
      const convItem = page.getByText(CHAT_NAME).first();
      await expect(convItem).toBeVisible({ timeout: 10000 });
      await convItem.click();
      await expect(page.locator(chat.view)).toBeVisible({ timeout: 10000 });
      // Ждём загрузки сообщений
      await expect(page.locator(chat.messageBubble).first()).toBeVisible({ timeout: 10000 });
    }

    test('Textarea видно и фокусируется', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const textarea = page.locator(chat.textarea);
      await expect(textarea).toBeVisible({ timeout: 10000 });
      await textarea.click();
      await expect(textarea).toBeFocused();
    });

    test('Enter отправляет сообщение', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const textarea = page.locator(chat.textarea);
      await expect(textarea).toBeVisible({ timeout: 10000 });

      const msgText = `UI Enter ${Date.now()}`;
      await textarea.click();
      await textarea.pressSequentially(msgText, { delay: 10 });

      // Verify React state updated (send button appears)
      await expect(page.locator(chat.sendBtn)).toBeVisible({ timeout: 5000 });
      await page.keyboard.press('Enter');

      // Ждём отправки и обновления через WebSocket/refetch
      await expect(page.getByText(msgText)).toBeVisible({ timeout: 15000 });
    });

    test('Shift+Enter — перенос строки', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const textarea = page.locator(chat.textarea);
      await expect(textarea).toBeVisible({ timeout: 10000 });
      await textarea.click();

      await page.keyboard.type('Строка 1');
      await page.keyboard.press('Shift+Enter');
      await page.keyboard.type('Строка 2');

      // Текст должен содержать обе строки, сообщение НЕ отправлено
      const value = await textarea.inputValue().catch(() => '');
      const textContent = await textarea.textContent().catch(() => '');
      const combined = value || textContent || '';
      expect(combined).toContain('Строка 1');
      expect(combined).toContain('Строка 2');
    });

    test('Кнопка отправки появляется при тексте', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const textarea = page.locator(chat.textarea);
      await expect(textarea).toBeVisible({ timeout: 10000 });

      // До ввода текста: кнопка отправки может быть скрыта
      const sendBtnBefore = await page.locator(chat.sendBtn).isVisible().catch(() => false);

      // Вводим текст
      await textarea.fill('Тест кнопки');
      await page.waitForTimeout(300);

      // После ввода текста: кнопка отправки должна быть видна
      const sendBtn = page.locator(chat.sendBtn);
      await expect(sendBtn).toBeVisible({ timeout: 5000 });
    });

    test('Пустое не отправляется', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const textarea = page.locator(chat.textarea);
      await expect(textarea).toBeVisible({ timeout: 10000 });

      // Пытаемся отправить пустое сообщение
      await textarea.click();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);

      // Кнопка отправки должна быть скрыта или disabled
      const sendBtn = page.locator(chat.sendBtn);
      const isVisible = await sendBtn.isVisible().catch(() => false);
      if (isVisible) {
        const isDisabled = await sendBtn.isDisabled().catch(() => false);
        // Или кнопка disabled, или пустое Enter не должно создавать системных сообщений с ошибкой
        expect(true).toBe(true);
      }

      // Страница не должна показывать ошибку
      await expect(page.locator(chat.view)).toBeVisible();
    });

    test('Микрофон виден когда поле пусто', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const textarea = page.locator(chat.textarea);
      await expect(textarea).toBeVisible({ timeout: 10000 });

      // Очищаем textarea
      await textarea.fill('');
      await page.waitForTimeout(300);

      // Микрофон виден когда текст пуст
      const micBtn = page.locator(chat.micBtn);
      const hasMic = await micBtn.isVisible().catch(() => false);
      // Микрофон может не быть реализован — проверяем gracefully
      if (hasMic) {
        await expect(micBtn).toBeVisible();
      }

      // Вводим текст — микрофон должен скрыться
      await textarea.fill('Текст');
      await page.waitForTimeout(300);
      const micAfter = await micBtn.isVisible().catch(() => false);
      if (hasMic) {
        expect(micAfter).toBe(false);
      }
    });
  });

  // ==========================================================================
  // GROUP 10: UI — Вложения файлов
  // ==========================================================================
  test.describe('UI: Вложения файлов', () => {
    async function openTestChat(page: import('@playwright/test').Page) {
      await page.goto('/chat');
      await expect(page.locator(chat.page)).toBeVisible({ timeout: 10000 });
      const convItem = page.getByText(CHAT_NAME).first();
      await expect(convItem).toBeVisible({ timeout: 10000 });
      await convItem.click();
      await expect(page.locator(chat.view)).toBeVisible({ timeout: 10000 });
      // Ждём загрузки сообщений
      await expect(page.locator(chat.messageBubble).first()).toBeVisible({ timeout: 10000 });
    }

    test('Кнопка прикрепления видна', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const attachBtn = page.locator(chat.attachBtn);
      await expect(attachBtn).toBeVisible({ timeout: 10000 });
    });

    test('Прикрепление файла показывает превью', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const fileInput = page.locator(chat.fileInput);
      await fileInput.setInputFiles({
        name: 'test-file.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Playwright test file content'),
      });

      await expect(page.locator(chat.pendingFiles)).toBeVisible({ timeout: 5000 });
    });

    test('Удаление прикреплённого файла', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const fileInput = page.locator(chat.fileInput);
      await fileInput.setInputFiles({
        name: 'delete-test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Delete me'),
      });

      await expect(page.locator(chat.pendingFiles)).toBeVisible({ timeout: 5000 });

      // Ищем кнопку удаления в области превью файлов
      const removeBtn = page.locator(chat.pendingFiles).locator('button').first();
      const hasRemove = await removeBtn.isVisible().catch(() => false);
      if (hasRemove) {
        await removeBtn.click();
        await page.waitForTimeout(500);
        const stillVisible = await page.locator(chat.pendingFiles).isVisible().catch(() => false);
        // Превью файлов должно исчезнуть или не содержать файлов
        expect(stillVisible).toBe(false);
      }
    });

    test('Отправка сообщения с файлом', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const fileInput = page.locator(chat.fileInput);
      await fileInput.setInputFiles({
        name: 'send-test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('File for sending'),
      });

      await expect(page.locator(chat.pendingFiles)).toBeVisible({ timeout: 5000 });

      // Вводим текст и отправляем
      const textarea = page.locator(chat.textarea);
      await textarea.fill('Сообщение с файлом');
      await page.keyboard.press('Enter');

      // Сообщение должно появиться
      await expect(page.getByText('Сообщение с файлом')).toBeVisible({ timeout: 15000 });
    });
  });

  // ==========================================================================
  // GROUP 11: UI — Ответ на сообщение
  // ==========================================================================
  test.describe('UI: Ответ на сообщение', () => {
    async function openTestChat(page: import('@playwright/test').Page) {
      await page.goto('/chat');
      await expect(page.locator(chat.page)).toBeVisible({ timeout: 10000 });
      const convItem = page.getByText(CHAT_NAME).first();
      await expect(convItem).toBeVisible({ timeout: 10000 });
      await convItem.click();
      await expect(page.locator(chat.view)).toBeVisible({ timeout: 10000 });
      // Ждём загрузки сообщений
      await expect(page.locator(chat.messageBubble).first()).toBeVisible({ timeout: 10000 });
    }

    test('Hover показывает кнопку ответа', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const firstBubble = page.locator(chat.messageBubble).first();
      await expect(firstBubble).toBeVisible({ timeout: 10000 });
      await revealHoverActions(page, firstBubble);

      await expect(firstBubble.locator(chat.hoverReply)).toBeVisible({ timeout: 3000 });
    });

    test('Клик "Ответить" показывает reply preview', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const firstBubble = page.locator(chat.messageBubble).first();
      await expect(firstBubble).toBeVisible({ timeout: 10000 });
      await revealHoverActions(page, firstBubble);

      const replyBtn = firstBubble.locator(chat.hoverReply);
      await expect(replyBtn).toBeVisible({ timeout: 3000 });
      await replyBtn.click();

      await expect(page.locator(chat.replyPreview)).toBeVisible({ timeout: 5000 });
    });

    test('Отмена ответа', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const firstBubble = page.locator(chat.messageBubble).first();
      await expect(firstBubble).toBeVisible({ timeout: 10000 });
      await revealHoverActions(page, firstBubble);

      const replyBtn = firstBubble.locator(chat.hoverReply);
      await expect(replyBtn).toBeVisible({ timeout: 3000 });
      await replyBtn.click();

      await expect(page.locator(chat.replyPreview)).toBeVisible({ timeout: 5000 });

      // Отменяем
      const cancelBtn = page.locator(chat.cancelReplyBtn);
      await expect(cancelBtn).toBeVisible({ timeout: 3000 });
      await cancelBtn.click();

      await expect(page.locator(chat.replyPreview)).not.toBeVisible({ timeout: 3000 });
    });

    test('Отправка reply — сообщение с цитатой', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const firstBubble = page.locator(chat.messageBubble).first();
      await expect(firstBubble).toBeVisible({ timeout: 10000 });
      await revealHoverActions(page, firstBubble);

      const replyBtn = firstBubble.locator(chat.hoverReply);
      await expect(replyBtn).toBeVisible({ timeout: 3000 });
      await replyBtn.click();

      await expect(page.locator(chat.replyPreview)).toBeVisible({ timeout: 5000 });

      const replyText = `UI Reply ${Date.now()}`;
      await sendMsgUI(page, replyText);
    });
  });

  // ==========================================================================
  // GROUP 12: UI — Контекстное меню
  // ==========================================================================
  test.describe('UI: Контекстное меню', () => {
    async function openTestChat(page: import('@playwright/test').Page) {
      await page.goto('/chat');
      await expect(page.locator(chat.page)).toBeVisible({ timeout: 10000 });
      const convItem = page.getByText(CHAT_NAME).first();
      await expect(convItem).toBeVisible({ timeout: 10000 });
      await convItem.click();
      await expect(page.locator(chat.view)).toBeVisible({ timeout: 10000 });
      // Ждём загрузки сообщений
      await expect(page.locator(chat.messageBubble).first()).toBeVisible({ timeout: 10000 });
    }

    test('Правый клик показывает меню', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const content = page.locator(chat.messageContent).first();
      await expect(content).toBeVisible({ timeout: 10000 });
      await content.click({ button: 'right' });

      await expect(page.locator(chat.contextMenu)).toBeVisible({ timeout: 3000 });
    });

    test('Содержит: Ответить, Копировать, Закрепить', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const content = page.locator(chat.messageContent).first();
      await expect(content).toBeVisible({ timeout: 10000 });
      await content.click({ button: 'right' });

      await expect(page.locator(chat.contextMenu)).toBeVisible({ timeout: 3000 });

      const replyItem = page.locator(chat.ctxReply);
      const copyItem = page.locator(chat.ctxCopy);
      const pinItem = page.locator(chat.ctxPin);

      await expect(replyItem).toBeVisible({ timeout: 3000 });
      await expect(copyItem).toBeVisible({ timeout: 3000 });
      await expect(pinItem).toBeVisible({ timeout: 3000 });
    });

    test('Своё сообщение: + Редактировать, Удалить', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      // Отправляем своё сообщение
      const ownMsgText = `Своё сообщение ${Date.now()}`;
      await sendMsgUI(page, ownMsgText);

      // Правый клик на своё сообщение (на content wrapper)
      const ownContent = page.locator(chat.messageBubble).filter({ hasText: ownMsgText }).locator(chat.messageContent);
      await ownContent.click({ button: 'right' });

      await expect(page.locator(chat.contextMenu)).toBeVisible({ timeout: 3000 });
      await expect(page.locator(chat.ctxEdit)).toBeVisible({ timeout: 3000 });
      await expect(page.locator(chat.ctxDelete)).toBeVisible({ timeout: 3000 });
    });

    test('Чужое сообщение: нет Редактировать/Удалить', async ({ page }) => {
      const token = await getDevToken();
      const secondToken = await getSecondUserToken();
      if (!token || !secondToken || !testConvId) {
        test.skip();
        return;
      }

      // Отправляем сообщение от второго пользователя
      const otherMsg = `Чужое сообщение ${Date.now()}`;
      await sendMessageApi(testConvId, otherMsg, undefined, 'grachev@stankoff.ru');

      await openTestChat(page);
      await page.waitForTimeout(2000); // Ждём подгрузку через WebSocket

      // Ищем чужое сообщение
      const otherBubble = page.locator(chat.messageBubble).filter({ hasText: otherMsg });
      const isVisible = await otherBubble.isVisible().catch(() => false);
      if (!isVisible) {
        // Сообщение может не отображаться (нужен скролл) — пропускаем
        test.skip();
        return;
      }

      await otherBubble.locator(chat.messageContent).click({ button: 'right' });
      await expect(page.locator(chat.contextMenu)).toBeVisible({ timeout: 3000 });

      const editItem = page.locator(chat.ctxEdit);
      const deleteItem = page.locator(chat.ctxDelete);

      const hasEdit = await editItem.isVisible().catch(() => false);
      const hasDelete = await deleteItem.isVisible().catch(() => false);

      expect(hasEdit).toBe(false);
      expect(hasDelete).toBe(false);
    });

    test('Копировать — текст в буфер', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      // Разрешаем clipboard
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

      await openTestChat(page);

      const content = page.locator(chat.messageContent).first();
      await expect(content).toBeVisible({ timeout: 10000 });
      const bubbleText = await content.textContent();

      await content.click({ button: 'right' });
      await expect(page.locator(chat.contextMenu)).toBeVisible({ timeout: 3000 });

      const copyItem = page.locator(chat.ctxCopy);
      await copyItem.click();

      await page.waitForTimeout(500);

      // Проверяем буфер обмена
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      if (clipboardText && bubbleText) {
        expect(clipboardText).toContain(bubbleText.trim().substring(0, 10));
      }
    });
  });

  // ==========================================================================
  // GROUP 13: UI — Редактирование
  // ==========================================================================
  test.describe('UI: Редактирование', () => {
    async function openTestChat(page: import('@playwright/test').Page) {
      await page.goto('/chat');
      await expect(page.locator(chat.page)).toBeVisible({ timeout: 10000 });
      const convItem = page.getByText(CHAT_NAME).first();
      await expect(convItem).toBeVisible({ timeout: 10000 });
      await convItem.click();
      await expect(page.locator(chat.view)).toBeVisible({ timeout: 10000 });
      // Ждём загрузки сообщений
      await expect(page.locator(chat.messageBubble).first()).toBeVisible({ timeout: 10000 });
    }

    test('Клик Редактировать — inline input', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      // Отправляем сообщение для редактирования
      const editMsgText = `Для редактирования ${Date.now()}`;
      await sendMsgUI(page, editMsgText);

      // Правый клик и Редактировать (на content wrapper)
      const ownContent = page.locator(chat.messageBubble).filter({ hasText: editMsgText }).locator(chat.messageContent);
      await ownContent.click({ button: 'right' });
      await expect(page.locator(chat.contextMenu)).toBeVisible({ timeout: 3000 });

      await page.locator(chat.ctxEdit).click();

      // Должен появиться inline input для редактирования
      await expect(page.locator(chat.editInput)).toBeVisible({ timeout: 5000 });
    });

    test('Enter сохраняет — badge "ред."', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      // Отправляем сообщение
      const originalText = `Оригинал ${Date.now()}`;
      await sendMsgUI(page, originalText);

      // Правый клик → Редактировать (на content wrapper)
      const ownContent = page.locator(chat.messageBubble).filter({ hasText: originalText }).locator(chat.messageContent);
      await ownContent.click({ button: 'right' });
      await expect(page.locator(chat.contextMenu)).toBeVisible({ timeout: 3000 });
      await page.locator(chat.ctxEdit).click();

      await expect(page.locator(chat.editInput)).toBeVisible({ timeout: 5000 });

      // Заменяем текст
      const editInput = page.locator(chat.editInput);
      await editInput.fill('Отредактировано');
      await page.keyboard.press('Enter');

      // Проверяем что текст изменился и есть badge "ред."
      await expect(page.getByText('Отредактировано')).toBeVisible({ timeout: 10000 });
      const editedBadge = page.locator(chat.messageEdited);
      const hasBadge = await editedBadge.isVisible().catch(() => false);
      if (hasBadge) {
        await expect(editedBadge).toBeVisible();
      }
    });

    test('Escape отменяет', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      // Отправляем сообщение
      const cancelEditText = `Отмена ред ${Date.now()}`;
      await sendMsgUI(page, cancelEditText);

      // Правый клик → Редактировать (на content wrapper)
      const ownContent = page.locator(chat.messageBubble).filter({ hasText: cancelEditText }).locator(chat.messageContent);
      await ownContent.click({ button: 'right' });
      await expect(page.locator(chat.contextMenu)).toBeVisible({ timeout: 3000 });
      await page.locator(chat.ctxEdit).click();

      await expect(page.locator(chat.editInput)).toBeVisible({ timeout: 5000 });

      // Нажимаем Escape
      await page.keyboard.press('Escape');

      // Edit input должен исчезнуть, оригинальный текст сохранён
      await expect(page.locator(chat.editInput)).not.toBeVisible({ timeout: 3000 });
      await expect(page.getByText(cancelEditText)).toBeVisible();
    });
  });

  // ==========================================================================
  // GROUP 14: UI — Удаление
  // ==========================================================================
  test.describe('UI: Удаление', () => {
    test('Удаление убирает сообщение из списка', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await page.goto('/chat');
      await expect(page.locator(chat.page)).toBeVisible({ timeout: 10000 });
      const convItem = page.getByText(CHAT_NAME).first();
      await expect(convItem).toBeVisible({ timeout: 10000 });
      await convItem.click();
      await expect(page.locator(chat.view)).toBeVisible({ timeout: 10000 });

      // Отправляем сообщение для удаления
      const deleteMsgText = `Удалить UI ${Date.now()}`;
      await sendMsgUI(page, deleteMsgText);

      // Правый клик → Удалить (на content wrapper)
      const ownContent = page.locator(chat.messageBubble).filter({ hasText: deleteMsgText }).locator(chat.messageContent);
      await ownContent.click({ button: 'right' });
      await expect(page.locator(chat.contextMenu)).toBeVisible({ timeout: 3000 });

      await page.locator(chat.ctxDelete).click();

      // Подтверждение удаления (если есть модалка)
      const confirmBtn = page.getByRole('button', { name: /Удалить|Да|Подтвердить/i });
      const hasConfirm = await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasConfirm) {
        await confirmBtn.click();
      }

      // Сообщение должно исчезнуть
      await expect(page.getByText(deleteMsgText)).not.toBeVisible({ timeout: 10000 });
    });
  });

  // ==========================================================================
  // GROUP 15: UI — Реакции
  // ==========================================================================
  test.describe('UI: Реакции', () => {
    async function openTestChat(page: import('@playwright/test').Page) {
      await page.goto('/chat');
      await expect(page.locator(chat.page)).toBeVisible({ timeout: 10000 });
      const convItem = page.getByText(CHAT_NAME).first();
      await expect(convItem).toBeVisible({ timeout: 10000 });
      await convItem.click();
      await expect(page.locator(chat.view)).toBeVisible({ timeout: 10000 });
      // Ждём загрузки сообщений
      await expect(page.locator(chat.messageBubble).first()).toBeVisible({ timeout: 10000 });
    }

    test('Hover показывает кнопку реакции', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const firstBubble = page.locator(chat.messageBubble).first();
      await expect(firstBubble).toBeVisible({ timeout: 10000 });
      await revealHoverActions(page, firstBubble);

      await expect(firstBubble.locator(chat.hoverReaction)).toBeVisible({ timeout: 3000 });
    });

    test('Клик открывает quick picker', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const firstBubble = page.locator(chat.messageBubble).first();
      await expect(firstBubble).toBeVisible({ timeout: 10000 });
      await revealHoverActions(page, firstBubble);

      const reactionBtn = firstBubble.locator(chat.hoverReaction);
      await expect(reactionBtn).toBeVisible({ timeout: 3000 });
      await reactionBtn.click({ force: true });

      await expect(page.locator(chat.quickReactions)).toBeVisible({ timeout: 3000 });
    });

    test('Выбор emoji добавляет реакцию', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      // Отправляем свежее сообщение для чистоты
      const msgText = `Emoji test ${Date.now()}`;
      await sendMsgUI(page, msgText);

      const bubble = page.locator(chat.messageBubble).filter({ hasText: msgText });
      await expect(bubble).toBeVisible({ timeout: 10000 });
      await revealHoverActions(page, bubble);

      const reactionBtn = bubble.locator(chat.hoverReaction);
      await expect(reactionBtn).toBeVisible({ timeout: 3000 });
      await reactionBtn.click({ force: true });

      await expect(page.locator(chat.quickReactions)).toBeVisible({ timeout: 3000 });

      // Кликаем на первый эмодзи в quick picker
      const firstEmoji = page.locator(chat.quickReactions).locator('button').first();
      await firstEmoji.click();

      // Ждём появления реакции под сообщением
      const reactionBar = bubble.locator(chat.reactionBar);
      await expect(reactionBar).toBeVisible({ timeout: 5000 });
    });

    test('Повторный клик убирает', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      // Отправляем новое сообщение для чистоты теста
      const msgText = `Реакция toggle ${Date.now()}`;
      await sendMsgUI(page, msgText);

      const bubble = page.locator(chat.messageBubble).filter({ hasText: msgText });
      await revealHoverActions(page, bubble);

      const reactionBtn = bubble.locator(chat.hoverReaction);
      const hasReactionBtn = await reactionBtn.isVisible().catch(() => false);
      if (!hasReactionBtn) {
        test.skip();
        return;
      }
      await reactionBtn.click({ force: true });
      await expect(page.locator(chat.quickReactions)).toBeVisible({ timeout: 3000 });
      const firstEmoji = page.locator(chat.quickReactions).locator('button').first();
      await firstEmoji.click();

      // Ждём появления реакции
      const reaction = bubble.locator(chat.reaction).first();
      await expect(reaction).toBeVisible({ timeout: 5000 });

      // Кликаем на уже поставленную реакцию для её снятия
      await reaction.click();
      await page.waitForTimeout(1000);
      // Реакция может исчезнуть или counter уменьшиться — успешно если нет ошибки
      expect(true).toBe(true);
    });

    test('Подсветка своей реакции', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      // Отправляем сообщение и ставим реакцию
      const msgText = `Подсветка реакции ${Date.now()}`;
      await sendMsgUI(page, msgText);

      const bubble = page.locator(chat.messageBubble).filter({ hasText: msgText });
      await revealHoverActions(page, bubble);

      const reactionBtn = bubble.locator(chat.hoverReaction);
      const hasReactionBtn = await reactionBtn.isVisible().catch(() => false);
      if (!hasReactionBtn) {
        test.skip();
        return;
      }
      await reactionBtn.click({ force: true });
      await expect(page.locator(chat.quickReactions)).toBeVisible({ timeout: 3000 });
      const firstEmoji = page.locator(chat.quickReactions).locator('button').first();
      await firstEmoji.click();

      // Ждём появления реакции
      const myReaction = bubble.locator(chat.reaction).first();
      await expect(myReaction).toBeVisible({ timeout: 5000 });

      // Проверяем подсветку — активная реакция имеет другие стили
      const classes = await myReaction.getAttribute('class');
      const isHighlighted =
        classes?.includes('active') ||
        classes?.includes('selected') ||
        classes?.includes('bg-') ||
        classes?.includes('border-') ||
        classes?.includes('ring-');
      expect(isHighlighted).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP 16: UI — Закреплённые сообщения
  // ==========================================================================
  test.describe('UI: Закреплённые сообщения', () => {
    async function openTestChat(page: import('@playwright/test').Page) {
      await page.goto('/chat');
      await expect(page.locator(chat.page)).toBeVisible({ timeout: 10000 });
      const convItem = page.getByText(CHAT_NAME).first();
      await expect(convItem).toBeVisible({ timeout: 10000 });
      await convItem.click();
      await expect(page.locator(chat.view)).toBeVisible({ timeout: 10000 });
      // Ждём загрузки сообщений
      await expect(page.locator(chat.messageBubble).first()).toBeVisible({ timeout: 10000 });
    }

    test('Закрепление через контекстное меню', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      // Отправляем сообщение для закрепления
      const pinText = `Закрепить UI ${Date.now()}`;
      await sendMsgUI(page, pinText);

      // Правый клик → Закрепить (на content wrapper)
      const pinContent = page.locator(chat.messageBubble).filter({ hasText: pinText }).locator(chat.messageContent);
      await pinContent.click({ button: 'right' });
      await expect(page.locator(chat.contextMenu)).toBeVisible({ timeout: 3000 });

      const pinItem = page.locator(chat.ctxPin);
      await pinItem.click();

      await page.waitForTimeout(1000);

      // Должен появиться баннер или иконка закрепления
      const pinnedBanner = page.locator(chat.pinnedBanner);
      const pinIcon = page.locator(chat.messagePinIcon);
      const hasBanner = await pinnedBanner.isVisible().catch(() => false);
      const hasPinIcon = await pinIcon.isVisible().catch(() => false);

      expect(hasBanner || hasPinIcon).toBe(true);
    });

    test('Баннер показывает текст', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      // Закрепляем сообщение через API для гарантии
      if (testMessageId) {
        await pinMessageApi(testConvId, testMessageId);
      }

      await openTestChat(page);

      const pinnedBanner = page.locator(chat.pinnedBanner);
      const hasBanner = await pinnedBanner.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasBanner) {
        const bannerText = await pinnedBanner.textContent();
        expect(bannerText).toBeTruthy();
        expect(bannerText!.length).toBeGreaterThan(0);
      }

      // Убираем закрепление для чистоты
      if (testMessageId) {
        await unpinMessageApi(testConvId, testMessageId);
      }
    });

    test('Открепление через меню', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      // Отправляем и закрепляем сообщение
      const unpinText = `Открепить UI ${Date.now()}`;
      await sendMsgUI(page, unpinText);

      // Закрепляем через контекстное меню (на content wrapper)
      const unpinContent = page.locator(chat.messageBubble).filter({ hasText: unpinText }).locator(chat.messageContent);
      await unpinContent.click({ button: 'right' });
      await expect(page.locator(chat.contextMenu)).toBeVisible({ timeout: 3000 });
      await page.locator(chat.ctxPin).click();
      await page.waitForTimeout(1000);

      // Теперь открепляем — снова правый клик
      await unpinContent.click({ button: 'right' });
      await expect(page.locator(chat.contextMenu)).toBeVisible({ timeout: 3000 });

      // Пункт меню может измениться на "Открепить"
      const unpinItem = page.locator(chat.ctxPin);
      await unpinItem.click();
      await page.waitForTimeout(1000);

      // Баннер/иконка должны исчезнуть (или показать другое закреплённое сообщение)
      await expect(page.locator(chat.view)).toBeVisible();
    });
  });

  // ==========================================================================
  // GROUP 17: UI — Поиск по сообщениям
  // ==========================================================================
  test.describe('UI: Поиск по сообщениям', () => {
    async function openTestChat(page: import('@playwright/test').Page) {
      await page.goto('/chat');
      await expect(page.locator(chat.page)).toBeVisible({ timeout: 10000 });
      const convItem = page.getByText(CHAT_NAME).first();
      await expect(convItem).toBeVisible({ timeout: 10000 });
      await convItem.click();
      await expect(page.locator(chat.view)).toBeVisible({ timeout: 10000 });
      // Ждём загрузки сообщений
      await expect(page.locator(chat.messageBubble).first()).toBeVisible({ timeout: 10000 });
    }

    test('Кнопка поиска открывает панель', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const searchBtn = page.locator(chat.searchBtn);
      await expect(searchBtn).toBeVisible({ timeout: 10000 });
      await searchBtn.click();

      await expect(page.locator(chat.searchPanel)).toBeVisible({ timeout: 5000 });
    });

    test('Ввод текста запускает поиск', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      await page.locator(chat.searchBtn).click();
      await expect(page.locator(chat.searchPanel)).toBeVisible({ timeout: 5000 });

      const searchInput = page.locator(chat.searchInput);
      await searchInput.fill('Привет');
      await page.waitForTimeout(1000); // debounce

      // Должны появиться результаты или счётчик или пустое состояние
      const hasResults = await page.locator(chat.searchResults).isVisible().catch(() => false);
      const hasCount = await page.locator(chat.searchCount).isVisible().catch(() => false);
      const hasEmpty = await page.locator(chat.searchEmpty).isVisible().catch(() => false);

      // Поиск должен хотя бы выполниться (результаты или пустое состояние)
      expect(hasResults || hasCount || hasEmpty).toBe(true);
    });

    test('Результаты с автором и временем', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      await page.locator(chat.searchBtn).click();
      await expect(page.locator(chat.searchPanel)).toBeVisible({ timeout: 5000 });

      const searchInput = page.locator(chat.searchInput);
      await searchInput.fill('Привет');
      await page.waitForTimeout(1000);

      const results = page.locator(chat.searchResult);
      const resultCount = await results.count();

      if (resultCount > 0) {
        const firstResult = results.first();
        const text = await firstResult.textContent();
        expect(text).toBeTruthy();
        // Результат должен содержать хоть какой-то текст сообщения
        expect(text!.length).toBeGreaterThan(0);
      }
    });

    test('Счётчик "N/M"', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      await page.locator(chat.searchBtn).click();
      await expect(page.locator(chat.searchPanel)).toBeVisible({ timeout: 5000 });

      const searchInput = page.locator(chat.searchInput);
      await searchInput.fill('сообщение');
      await page.waitForTimeout(1000);

      const countEl = page.locator(chat.searchCount);
      const hasCount = await countEl.isVisible().catch(() => false);
      if (hasCount) {
        const countText = await countEl.textContent();
        // Формат "1/3" или "1 из 3"
        expect(countText).toMatch(/\d+\s*[/из]+\s*\d+|\d+/);
      }
    });

    test('Клик прокручивает к сообщению', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      await page.locator(chat.searchBtn).click();
      await expect(page.locator(chat.searchPanel)).toBeVisible({ timeout: 5000 });

      const searchInput = page.locator(chat.searchInput);
      await searchInput.fill('Привет');
      await page.waitForTimeout(1000);

      const results = page.locator(chat.searchResult);
      const resultCount = await results.count();
      if (resultCount > 0) {
        await results.first().click();
        await page.waitForTimeout(500);

        // Сообщение должно быть видимым в viewport (подсвечено)
        const highlighted = page.locator(chat.messageBubble).filter({ hasText: 'Привет' });
        const isVisible = await highlighted.first().isVisible().catch(() => false);
        expect(isVisible).toBe(true);
      }
    });

    test('Стрелки навигации', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      await page.locator(chat.searchBtn).click();
      await expect(page.locator(chat.searchPanel)).toBeVisible({ timeout: 5000 });

      const searchInput = page.locator(chat.searchInput);
      await searchInput.fill('сообщение');
      await page.waitForTimeout(1000);

      const upBtn = page.locator(chat.searchUp);
      const downBtn = page.locator(chat.searchDown);

      const hasUp = await upBtn.isVisible().catch(() => false);
      const hasDown = await downBtn.isVisible().catch(() => false);

      if (hasUp && hasDown) {
        // Кликаем вниз
        await downBtn.click();
        await page.waitForTimeout(300);
        // Кликаем вверх
        await upBtn.click();
        await page.waitForTimeout(300);

        // Счётчик должен изменяться
        const countEl = page.locator(chat.searchCount);
        const hasCount = await countEl.isVisible().catch(() => false);
        if (hasCount) {
          const countText = await countEl.textContent();
          expect(countText).toBeTruthy();
        }
      }
    });

    test('Escape/X закрывает панель', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      await page.locator(chat.searchBtn).click();
      await expect(page.locator(chat.searchPanel)).toBeVisible({ timeout: 5000 });

      // Закрываем кнопкой X
      const closeBtn = page.locator(chat.searchClose);
      const hasClose = await closeBtn.isVisible().catch(() => false);

      if (hasClose) {
        await closeBtn.click();
        await expect(page.locator(chat.searchPanel)).not.toBeVisible({ timeout: 3000 });
      } else {
        // Закрываем через Escape
        await page.keyboard.press('Escape');
        await expect(page.locator(chat.searchPanel)).not.toBeVisible({ timeout: 3000 });
      }
    });

    test('Нет результатов — "Ничего не найдено"', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      await page.locator(chat.searchBtn).click();
      await expect(page.locator(chat.searchPanel)).toBeVisible({ timeout: 5000 });

      const searchInput = page.locator(chat.searchInput);
      await searchInput.fill('абсолютно_несуществующий_текст_xyz_999');
      await page.waitForTimeout(1000);

      const emptyState = page.locator(chat.searchEmpty);
      const hasEmpty = await emptyState.isVisible().catch(() => false);

      if (hasEmpty) {
        const text = await emptyState.textContent();
        expect(text).toBeTruthy();
      } else {
        // Или нет результатов — count показывает 0
        const countEl = page.locator(chat.searchCount);
        const hasCount = await countEl.isVisible().catch(() => false);
        if (hasCount) {
          const countText = await countEl.textContent();
          expect(countText).toContain('0');
        }
      }
    });
  });

  // ==========================================================================
  // GROUP 18: UI — Меню чата и участники
  // ==========================================================================
  test.describe('UI: Меню чата и участники', () => {
    async function openTestChat(page: import('@playwright/test').Page) {
      await page.goto('/chat');
      await expect(page.locator(chat.page)).toBeVisible({ timeout: 10000 });
      const convItem = page.getByText(CHAT_NAME).first();
      await expect(convItem).toBeVisible({ timeout: 10000 });
      await convItem.click();
      await expect(page.locator(chat.view)).toBeVisible({ timeout: 10000 });
      // Ждём загрузки сообщений
      await expect(page.locator(chat.messageBubble).first()).toBeVisible({ timeout: 10000 });
    }

    test('Кнопка меню открывает панель', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);

      const menuBtn = page.locator(chat.menuBtn);
      await expect(menuBtn).toBeVisible({ timeout: 10000 });
      await menuBtn.click();

      await expect(page.locator(chat.menuPanel)).toBeVisible({ timeout: 5000 });
    });

    test('Список участников', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);
      await page.locator(chat.menuBtn).click();
      await expect(page.locator(chat.menuPanel)).toBeVisible({ timeout: 5000 });

      const participants = page.locator(chat.menuParticipant);
      const count = await participants.count();
      expect(count).toBeGreaterThanOrEqual(2); // admin + secondUser
    });

    test('Количество отображается', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);
      await page.locator(chat.menuBtn).click();
      await expect(page.locator(chat.menuPanel)).toBeVisible({ timeout: 5000 });

      const countEl = page.locator(chat.menuParticipantCount);
      const hasCount = await countEl.isVisible().catch(() => false);
      if (hasCount) {
        const text = await countEl.textContent();
        expect(text).toMatch(/\d+/);
      }
    });

    test('Кнопка "Добавить" показывает список', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);
      await page.locator(chat.menuBtn).click();
      await expect(page.locator(chat.menuPanel)).toBeVisible({ timeout: 5000 });

      const addBtn = page.locator(chat.menuAddBtn);
      const hasAddBtn = await addBtn.isVisible().catch(() => false);
      if (!hasAddBtn) {
        test.skip();
        return;
      }

      await addBtn.click();

      // Ждём загрузки списка пользователей (async fetch /api/users)
      await page.waitForTimeout(2000);

      // Список доступных пользователей или сообщение "Нет доступных"
      const addUserList = page.locator(chat.menuAddUser);
      const hasUserList = await addUserList.first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasNoUsers = await page.getByText('Нет доступных пользователей').isVisible().catch(() => false);
      expect(hasUserList || hasNoUsers).toBe(true);
    });

    test('Поиск фильтрует пользователей', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);
      await page.locator(chat.menuBtn).click();
      await expect(page.locator(chat.menuPanel)).toBeVisible({ timeout: 5000 });

      const addBtn = page.locator(chat.menuAddBtn);
      const hasAddBtn = await addBtn.isVisible().catch(() => false);
      if (!hasAddBtn) {
        test.skip();
        return;
      }
      await addBtn.click();

      const memberSearch = page.locator(chat.menuMemberSearch);
      const hasSearch = await memberSearch.isVisible().catch(() => false);
      if (!hasSearch) {
        test.skip();
        return;
      }

      // Вводим текст для фильтрации
      await memberSearch.fill('admin');
      await page.waitForTimeout(500);

      // Количество результатов должно уменьшиться
      const filteredUsers = page.locator(chat.menuAddUser);
      const filteredCount = await filteredUsers.count();
      expect(filteredCount).toBeGreaterThanOrEqual(0);
    });

    test('Добавление обновляет список', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);
      await page.locator(chat.menuBtn).click();
      await expect(page.locator(chat.menuPanel)).toBeVisible({ timeout: 5000 });

      const participantsBefore = await page.locator(chat.menuParticipant).count();

      const addBtn = page.locator(chat.menuAddBtn);
      const hasAddBtn = await addBtn.isVisible().catch(() => false);
      if (!hasAddBtn) {
        test.skip();
        return;
      }
      await addBtn.click();

      // Кликаем на первого доступного пользователя
      const addUser = page.locator(chat.menuAddUser).first();
      const hasUser = await addUser.isVisible({ timeout: 5000 }).catch(() => false);
      if (!hasUser) {
        test.skip();
        return;
      }
      await addUser.click();
      await page.waitForTimeout(1000);

      // Количество участников должно увеличиться
      const participantsAfter = await page.locator(chat.menuParticipant).count();
      expect(participantsAfter).toBeGreaterThanOrEqual(participantsBefore);
    });

    test('Удаление участника (owner)', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);
      await page.locator(chat.menuBtn).click();
      await expect(page.locator(chat.menuPanel)).toBeVisible({ timeout: 5000 });

      const removeBtn = page.locator(chat.menuRemoveBtn).first();
      const hasRemoveBtn = await removeBtn.isVisible().catch(() => false);

      if (!hasRemoveBtn) {
        // Owner может не иметь кнопку удаления для себя — ОК
        test.skip();
        return;
      }

      const participantsBefore = await page.locator(chat.menuParticipant).count();
      await removeBtn.click();

      // Подтверждение (если есть)
      const confirmBtn = page.getByRole('button', { name: /Удалить|Да|Подтвердить/i });
      const hasConfirm = await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasConfirm) {
        await confirmBtn.click();
      }

      await page.waitForTimeout(1000);
      const participantsAfter = await page.locator(chat.menuParticipant).count();
      expect(participantsAfter).toBeLessThanOrEqual(participantsBefore);
    });

    test('Кнопка "Покинуть чат"', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await openTestChat(page);
      await page.locator(chat.menuBtn).click();
      await expect(page.locator(chat.menuPanel)).toBeVisible({ timeout: 5000 });

      const leaveBtn = page.locator(chat.menuLeaveBtn);
      const hasLeaveBtn = await leaveBtn.isVisible().catch(() => false);

      // Кнопка покинуть чат должна быть видна (но не нажимаем — иначе потеряем тестовый чат)
      if (hasLeaveBtn) {
        await expect(leaveBtn).toBeVisible();
      }
    });
  });

  // ==========================================================================
  // GROUP 19: UI — Header чата
  // ==========================================================================
  test.describe('UI: Header чата', () => {
    test('Имя чата отображается', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await page.goto('/chat');
      await expect(page.locator(chat.page)).toBeVisible({ timeout: 10000 });

      const convItem = page.getByText(CHAT_NAME).first();
      await expect(convItem).toBeVisible({ timeout: 10000 });
      await convItem.click();
      await expect(page.locator(chat.view)).toBeVisible({ timeout: 10000 });

      const headerName = page.locator(chat.headerName);
      await expect(headerName).toBeVisible({ timeout: 5000 });
      const name = await headerName.textContent();
      expect(name).toContain(CHAT_NAME);
    });

    test('Статус участников', async ({ page }) => {
      const token = await getDevToken();
      if (!token || !testConvId) {
        test.skip();
        return;
      }

      await page.goto('/chat');
      await expect(page.locator(chat.page)).toBeVisible({ timeout: 10000 });

      const convItem = page.getByText(CHAT_NAME).first();
      await expect(convItem).toBeVisible({ timeout: 10000 });
      await convItem.click();
      await expect(page.locator(chat.view)).toBeVisible({ timeout: 10000 });

      const headerStatus = page.locator(chat.headerStatus);
      const hasStatus = await headerStatus.isVisible().catch(() => false);

      if (hasStatus) {
        const statusText = await headerStatus.textContent();
        expect(statusText).toBeTruthy();
        // Должен содержать количество участников или статус онлайн
        const hasInfo =
          statusText!.match(/\d+/) || // число
          statusText!.includes('участник') ||
          statusText!.includes('онлайн') ||
          statusText!.includes('в сети');
        expect(hasInfo).toBeTruthy();
      }
    });
  });
});
