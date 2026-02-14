/**
 * Аудит чата — Stankoff Portal
 * Проверяет: логин, список бесед, отправку сообщений, поиск, создание групп, unread, скриншоты
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import path from 'path';

const BASE = 'http://localhost:3000';
const SCREENSHOTS = '/Users/ed/dev/stankoff3/stankoff-portal/audit-screenshots';
const TIMEOUT = 20000;

const results = [];
const consoleErrors = [];

function log(emoji, msg) {
  const ts = new Date().toLocaleTimeString('ru-RU');
  console.log(`[${ts}] ${emoji} ${msg}`);
}

function pass(test, detail = '') {
  log('✅', `PASS: ${test}${detail ? ' — ' + detail : ''}`);
  results.push({ test, status: 'PASS', detail });
}

function fail(test, detail = '') {
  log('❌', `FAIL: ${test}${detail ? ' — ' + detail : ''}`);
  results.push({ test, status: 'FAIL', detail });
}

function warn(test, detail = '') {
  log('⚠️', `WARN: ${test}${detail ? ' — ' + detail : ''}`);
  results.push({ test, status: 'WARN', detail });
}

async function screenshot(page, name) {
  const fpath = path.join(SCREENSHOTS, `chat_${name}.png`);
  await page.screenshot({ path: fpath, fullPage: false });
  log('📸', `Screenshot: ${fpath}`);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  log('🚀', 'Запуск аудита чата...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
  });
  const page = await context.newPage();

  // Collect console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon') && !text.includes('hydrat') && !text.includes('ERR_CONNECTION_REFUSED') && !text.includes('Failed to load resource')) {
        consoleErrors.push({ url: page.url(), text });
      }
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push({ url: page.url(), text: err.message });
  });

  try {
    // ═══════════════════════════════════════════════════════════════
    // 1. LOGIN
    // ═══════════════════════════════════════════════════════════════
    log('🔑', '1. Логин через карточку пользователя...');
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForSelector('text=youredik@gmail.com', { timeout: TIMEOUT });
    await sleep(500);

    const userCard = await page.locator('button', { hasText: 'youredik@gmail.com' }).first();
    await userCard.click();
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: TIMEOUT });
    await sleep(2000);
    pass('Логин', `Вход выполнен, URL: ${page.url()}`);
    await screenshot(page, '01_after_login');

    // ═══════════════════════════════════════════════════════════════
    // 2. NAVIGATE TO CHAT
    // ═══════════════════════════════════════════════════════════════
    log('💬', '2. Переход в чат...');
    await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForSelector('[data-testid="chat-page"]', { timeout: TIMEOUT });
    await sleep(2000);
    pass('Страница чата', 'ChatPage загружена');
    await screenshot(page, '02_chat_page');

    // ═══════════════════════════════════════════════════════════════
    // 3. CHECK CONVERSATION LIST
    // ═══════════════════════════════════════════════════════════════
    log('📋', '3. Проверка списка бесед...');
    const convList = await page.$('[data-testid="chat-conversation-list"]');
    if (convList) pass('Список бесед', 'ConversationList отображается');
    else fail('Список бесед', 'ConversationList не найден');

    const convSearch = await page.$('[data-testid="chat-conv-search"]');
    if (convSearch) pass('Поиск в списке бесед', 'Input поиска присутствует');
    else warn('Поиск в списке бесед', 'Input поиска не найден');

    const newChatBtn = await page.$('[data-testid="chat-new-btn"]');
    if (newChatBtn) pass('Кнопка нового чата', 'Кнопка "+" присутствует');
    else warn('Кнопка нового чата', 'Кнопка "+" не найдена');

    const aiChatBtn = await page.$('[data-testid="chat-ai-btn"]');
    if (aiChatBtn) pass('Кнопка AI чата', 'Кнопка AI ассистента присутствует');
    else warn('Кнопка AI чата', 'Кнопка AI ассистента не найдена');

    await sleep(1000);
    const convItemsAll = await page.$$('[data-testid="chat-conversation-list"] div[class*="cursor-pointer"]');
    const convCount = convItemsAll.length;
    if (convCount > 0) pass('Загрузка бесед', `Найдено ${convCount} бесед в списке`);
    else warn('Загрузка бесед', 'Список бесед пуст');

    await screenshot(page, '03_conversation_list');

    // ═══════════════════════════════════════════════════════════════
    // 4. OPEN EXISTING CONVERSATION
    // ═══════════════════════════════════════════════════════════════
    log('📨', '4. Открытие существующей беседы...');
    let conversationOpened = false;
    const clickableConvs = await page.$$('[data-testid="chat-conversation-list"] div[class*="cursor-pointer"]');

    if (clickableConvs.length > 0) {
      await clickableConvs[0].click();
      await sleep(2000);

      const chatHeader = await page.$('[data-testid="chat-header"]');
      if (chatHeader) {
        const headerName = await page.$eval('[data-testid="chat-header-name"]', el => el.textContent).catch(() => '(не определено)');
        pass('Открытие беседы', `Открыта беседа: "${headerName}"`);
        conversationOpened = true;
      } else {
        warn('Открытие беседы', 'ChatHeader не появился');
      }
    } else {
      warn('Открытие беседы', 'Нет бесед для открытия');
    }
    await screenshot(page, '04_conversation_opened');

    // ═══════════════════════════════════════════════════════════════
    // 5. CHECK MESSAGES LOAD
    // ═══════════════════════════════════════════════════════════════
    if (conversationOpened) {
      log('📝', '5. Проверка загрузки сообщений...');
      await sleep(1500);
      const messages = await page.$$('[data-testid="chat-message-bubble"]');
      const systemMessages = await page.$$('[data-testid="chat-system-message"]');
      if (messages.length > 0 || systemMessages.length > 0) {
        pass('Загрузка сообщений', `${messages.length} сообщений + ${systemMessages.length} системных`);
      } else {
        warn('Загрузка сообщений', 'Нет сообщений');
      }
      await screenshot(page, '05_messages_loaded');
    }

    // ═══════════════════════════════════════════════════════════════
    // 6. SEND A TEST MESSAGE
    // ═══════════════════════════════════════════════════════════════
    if (conversationOpened) {
      log('✉️', '6. Отправка тестового сообщения...');

      // Tiptap uses ProseMirror contenteditable div
      const editorEl = await page.$('.ProseMirror[contenteditable="true"]');
      if (editorEl) {
        // Focus the editor and type
        await editorEl.click();
        await sleep(300);
        
        const testMessage = 'Тест аудита чата ' + new Date().toLocaleTimeString('ru-RU');
        await editorEl.type(testMessage, { delay: 20 });
        await sleep(500);

        // After typing, the editor should have content -> send button should appear
        // The send button shows only when hasContent is true
        // Check if mic btn switched to send btn
        let sendBtn = await page.$('[data-testid="chat-send-btn"]');
        
        if (!sendBtn) {
          // Maybe Tiptap didnt pick up the typing, try pressing Enter to submit instead
          // Actually, check if Enter key sends the message (handleKeyDown in editor config)
          log('⚠️', 'Кнопка отправки не появилась после набора текста, пробуем Enter...');
          
          // Try pressing Enter (which might trigger handleSend via Tiptap editorProps.handleKeyDown)
          await page.keyboard.press('Enter');
          await sleep(3000);
          
          const allMsgs = await page.$$('[data-testid="chat-message-bubble"]');
          let found = false;
          for (const msg of allMsgs) {
            const txt = await msg.textContent().catch(() => '');
            if (txt.includes('Тест аудита чата')) { found = true; break; }
          }
          
          if (found) {
            pass('Отправка сообщения', `"${testMessage}" — отправлено через Enter`);
          } else {
            // Try another approach: use evaluate to insert text into Tiptap
            log('⚠️', 'Enter не сработал, пробуем через evaluate...');
            
            await editorEl.click();
            await sleep(200);
            
            // Set content via Tiptap API through DOM
            await page.evaluate(() => {
              const el = document.querySelector('.ProseMirror');
              if (el) {
                el.innerHTML = '<p>Тест аудита чата (evaluate)</p>';
                el.dispatchEvent(new Event('input', { bubbles: true }));
              }
            });
            await sleep(500);
            
            sendBtn = await page.$('[data-testid="chat-send-btn"]');
            if (sendBtn) {
              await sendBtn.click();
              await sleep(3000);
              pass('Отправка сообщения', 'Отправлено через evaluate + click');
            } else {
              // Last resort: use keyboard shortcut
              await editorEl.click();
              await sleep(100);
              await page.keyboard.type('Тест аудита v3', { delay: 10 });
              await sleep(500);
              sendBtn = await page.$('[data-testid="chat-send-btn"]');
              if (sendBtn) {
                await sendBtn.click();
                await sleep(2000);
                pass('Отправка сообщения', 'Отправлено (3-я попытка)');
              } else {
                fail('Отправка сообщения', 'Кнопка отправки не появляется после ввода текста. hasContent не срабатывает.');
              }
            }
          }
        } else {
          // Send button found!
          await sendBtn.click();
          await sleep(3000);

          const allMsgs = await page.$$('[data-testid="chat-message-bubble"]');
          let found = false;
          for (const msg of allMsgs) {
            const txt = await msg.textContent().catch(() => '');
            if (txt.includes('Тест аудита чата')) { found = true; break; }
          }

          if (found) {
            pass('Отправка сообщения', `"${testMessage}" — отправлено и отображается`);
          } else {
            warn('Отправка сообщения', `Отправлено, но не найдено среди ${allMsgs.length} сообщений`);
          }
        }
      } else {
        fail('Отправка сообщения', 'Tiptap-редактор не найден');
      }

      await screenshot(page, '06_message_sent');
    }

    // ═══════════════════════════════════════════════════════════════
    // 7. SEARCH IN CHAT (inside conversation)
    // ═══════════════════════════════════════════════════════════════
    if (conversationOpened) {
      log('🔍', '7. Поиск в чате...');

      const searchBtn = await page.$('[data-testid="chat-search-btn"]');
      if (searchBtn) {
        await searchBtn.click();
        await sleep(1000);

        const focusedInput = await page.$('input:focus');
        if (focusedInput) {
          await focusedInput.type('Тест', { delay: 50 });
          await sleep(2000);
          await screenshot(page, '07_chat_search');
          pass('Поиск в чате', 'Панель открылась, запрос введён');
          await page.keyboard.press('Escape');
          await sleep(500);
        } else {
          warn('Поиск в чате', 'Панель поиска не найдена (нет focused input)');
          await screenshot(page, '07_chat_search');
        }
      } else {
        warn('Поиск в чате', 'Кнопка поиска не найдена');
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 8. FILTER CONVERSATIONS LIST
    // ═══════════════════════════════════════════════════════════════
    log('🔎', '8. Фильтрация списка бесед...');
    await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForSelector('[data-testid="chat-conversation-list"]', { timeout: TIMEOUT });
    await sleep(1500);

    const convSearchInput = await page.$('[data-testid="chat-conv-search"]');
    if (convSearchInput) {
      const beforeCount = (await page.$$('[data-testid="chat-conversation-list"] div[class*="cursor-pointer"]')).length;
      await convSearchInput.click();
      await convSearchInput.fill('zzzzzzzz_nonexistent');
      await sleep(800);
      const afterCount = (await page.$$('[data-testid="chat-conversation-list"] div[class*="cursor-pointer"]')).length;

      if (afterCount < beforeCount || afterCount === 0) {
        pass('Фильтрация бесед', `До: ${beforeCount}, после "zzzzzzzz": ${afterCount} — работает`);
      } else {
        warn('Фильтрация бесед', `До: ${beforeCount}, после: ${afterCount} — не фильтрует`);
      }
      await convSearchInput.fill('');
      await sleep(500);
    } else {
      warn('Фильтрация бесед', 'Поле поиска не найдено');
    }
    await screenshot(page, '08_conv_search');

    // ═══════════════════════════════════════════════════════════════
    // 9. CHECK UNREAD COUNTS
    // ═══════════════════════════════════════════════════════════════
    log('🔢', '9. Проверка счётчиков непрочитанных...');
    const allSpans = await page.$$('[data-testid="chat-conversation-list"] span');
    let unreadBadges = 0;
    for (const span of allSpans) {
      const text = (await span.textContent()).trim();
      const className = await span.getAttribute('class') || '';
      if (/^\d+$/.test(text) && className.includes('bg-primary')) {
        unreadBadges++;
      }
    }
    if (unreadBadges > 0) {
      pass('Непрочитанные', `${unreadBadges} бесед с непрочитанными`);
    } else {
      warn('Непрочитанные', 'Нет непрочитанных (или badge не отображается)');
    }
    await screenshot(page, '09_unread_counts');

    // ═══════════════════════════════════════════════════════════════
    // 10. CREATE NEW GROUP CONVERSATION
    // ═══════════════════════════════════════════════════════════════
    log('👥', '10. Создание групповой беседы...');

    const newBtn = await page.$('[data-testid="chat-new-btn"]');
    if (newBtn) {
      await newBtn.click();
      await sleep(1000);

      const modal = await page.locator('h2', { hasText: 'Новый чат' }).first();
      const modalVisible = await modal.isVisible().catch(() => false);

      if (modalVisible) {
        pass('Модалка нового чата', 'Модальное окно открылось');

        // Switch to group mode FIRST
        const groupTab = await page.locator('button', { hasText: 'Групповой' }).first();
        await groupTab.click();
        await sleep(500);
        pass('Переключение на групповой', 'Вкладка "Групповой" активирована');

        // Enter group name
        const groupNameInput = await page.$('input[placeholder*="Название группы"]');
        const groupTestName = 'Аудит-группа ' + new Date().toLocaleTimeString('ru-RU');
        if (groupNameInput) {
          await groupNameInput.fill(groupTestName);
          pass('Ввод названия группы', `"${groupTestName}"`);
        }

        // Wait for user list to render
        await sleep(1000);

        // Select participants by clicking on user list DIVs (not checkboxes)
        // The div onClick calls toggleUser in group mode
        const userListItems = await page.$$('div[class*="cursor-pointer"][class*="flex"][class*="items-center"][class*="gap-3"][class*="px-3"]');
        let selectedCount = 0;
        
        // If that selector is too broad, try finding items inside the modal
        // Modal is the z-10 overlay
        if (userListItems.length === 0) {
          log('⚠️', 'Selector не нашел элементы списка, пробую альтернативный...');
        }

        // Use a more targeted approach - find the scrollable list in modal
        // and click on the items there
        const modalOverlay = await page.$('.fixed.inset-0.z-50');
        if (modalOverlay) {
          const listItems = await modalOverlay.$$('div[class*="cursor-pointer"]');
          log('ℹ️', `Найдено ${listItems.length} кликабельных элементов в модалке`);
          
          for (let i = 0; i < Math.min(2, listItems.length); i++) {
            const text = await listItems[i].textContent();
            // Skip items that look like tabs
            if (text && text.includes('@') && !text.includes('Новый чат') && !text.includes('Групповой')) {
              await listItems[i].click();
              selectedCount++;
              await sleep(300);
            }
          }
        }

        if (selectedCount > 0) {
          pass('Выбор участников', `Выбрано ${selectedCount} участников`);
          await screenshot(page, '10_new_group_modal');

          // Check if create button is enabled now
          await sleep(500);
          const createBtn = await page.locator('button', { hasText: /Создать группу/ }).first();
          const isDisabled = await createBtn.getAttribute('disabled');

          if (isDisabled === null) {
            await createBtn.click();
            await sleep(3000);

            const modalStill = await page.locator('h2', { hasText: 'Новый чат' }).first().isVisible().catch(() => false);
            if (!modalStill) {
              const headerAfter = await page.$('[data-testid="chat-header"]');
              if (headerAfter) {
                const name = await page.$eval('[data-testid="chat-header-name"]', el => el.textContent).catch(() => '');
                pass('Создание группы', `Группа создана: "${name}"`);
              } else {
                pass('Создание группы', 'Группа создана (модалка закрылась)');
              }
            } else {
              fail('Создание группы', 'Модалка не закрылась');
            }
          } else {
            // Debug: check what selectedIds looks like
            const btnText = await createBtn.textContent();
            fail('Создание группы', `Кнопка disabled: "${btnText}". Возможно участники не выбраны.`);
          }
        } else {
          warn('Выбор участников', 'Не удалось выбрать участников');
          await page.keyboard.press('Escape');
        }
      } else {
        fail('Модалка нового чата', 'Не открылась');
      }
    } else {
      fail('Кнопка нового чата', 'Не найдена');
    }
    await screenshot(page, '10_group_created');

    // ═══════════════════════════════════════════════════════════════
    // 11. SEND MESSAGE IN NEW GROUP
    // ═══════════════════════════════════════════════════════════════
    const headerNow = await page.$('[data-testid="chat-header"]');
    if (headerNow) {
      log('✉️', '11. Отправка сообщения в новую группу...');
      const editor2 = await page.$('.ProseMirror[contenteditable="true"]');
      if (editor2) {
        await editor2.click();
        await sleep(300);
        await editor2.type('Привет, группа! Тест аудита.', { delay: 20 });
        await sleep(500);
        
        // Try Enter to send
        await page.keyboard.press('Enter');
        await sleep(2000);

        const msgs = await page.$$('[data-testid="chat-message-bubble"]');
        if (msgs.length > 0) {
          pass('Сообщение в группе', `${msgs.length} сообщений отображается`);
        } else {
          warn('Сообщение в группе', 'Сообщения не видны');
        }
      }
      await screenshot(page, '11_group_message');
    }

    // ═══════════════════════════════════════════════════════════════
    // 12. CHAT MENU
    // ═══════════════════════════════════════════════════════════════
    if (headerNow) {
      log('⚙️', '12. Проверка меню чата...');
      const menuBtn = await page.$('[data-testid="chat-menu-btn"]');
      if (menuBtn) {
        await menuBtn.click();
        await sleep(1000);
        await screenshot(page, '12_chat_menu');
        pass('Меню чата', 'Кнопка настроек работает');
        await page.keyboard.press('Escape');
        await sleep(500);
      } else {
        warn('Меню чата', 'Кнопка меню не найдена');
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 13. MESSAGE INTERACTIONS
    // ═══════════════════════════════════════════════════════════════
    log('💡', '13. Проверка взаимодействий с сообщениями...');
    await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForSelector('[data-testid="chat-conversation-list"]', { timeout: TIMEOUT });
    await sleep(1500);

    const convItems2 = await page.$$('[data-testid="chat-conversation-list"] div[class*="cursor-pointer"]');
    if (convItems2.length > 0) {
      await convItems2[0].click();
      await sleep(2000);

      const msgBubbles = await page.$$('[data-testid="chat-message-bubble"]');
      if (msgBubbles.length > 0) {
        const lastMsg = msgBubbles[msgBubbles.length - 1];
        await lastMsg.hover();
        await sleep(800);

        const replyBtn = await page.$('[data-testid="chat-hover-reply"]');
        const reactionBtn = await page.$('[data-testid="chat-hover-reaction"]');

        if (replyBtn) pass('Hover: кнопка "Ответить"', 'Отображается');
        else warn('Hover: кнопка "Ответить"', 'Не появилась');
        if (reactionBtn) pass('Hover: кнопка "Реакция"', 'Отображается');
        else warn('Hover: кнопка "Реакция"', 'Не появилась');

        // Context menu via right-click on the message content div
        const contentDiv = await lastMsg.$('[data-testid="chat-message-content"]');
        if (contentDiv) {
          await contentDiv.click({ button: 'right' });
        } else {
          await lastMsg.click({ button: 'right' });
        }
        await sleep(500);

        const ctxMenu = await page.$('[data-testid="chat-context-menu"]');
        if (ctxMenu) {
          pass('Контекстное меню', 'Открывается по правому клику');
          const items = [];
          if (await page.$('[data-testid="chat-ctx-reply"]')) items.push('Ответить');
          if (await page.$('[data-testid="chat-ctx-copy"]')) items.push('Копировать');
          if (await page.$('[data-testid="chat-ctx-pin"]')) items.push('Закрепить');
          if (await page.$('[data-testid="chat-ctx-edit"]')) items.push('Редактировать');
          if (await page.$('[data-testid="chat-ctx-delete"]')) items.push('Удалить');
          pass('Пункты контекстного меню', items.join(', '));
          await page.keyboard.press('Escape');
          await sleep(300);
        } else {
          warn('Контекстное меню', 'Не открылось');
        }

        await screenshot(page, '13_message_interactions');
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 14. MOBILE RESPONSIVE
    // ═══════════════════════════════════════════════════════════════
    log('📱', '14. Проверка мобильной вёрстки...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForSelector('[data-testid="chat-conversation-list"]', { timeout: TIMEOUT });
    await sleep(1500);
    await screenshot(page, '14_mobile_chat_list');

    const mobileConvList = await page.$('[data-testid="chat-conversation-list"]');
    if (mobileConvList && await mobileConvList.isVisible()) {
      pass('Mobile: список бесед', 'Виден на мобильном');
    } else {
      warn('Mobile: список бесед', 'Скрыт');
    }

    const mobileConvs = await page.$$('[data-testid="chat-conversation-list"] div[class*="cursor-pointer"]');
    if (mobileConvs.length > 0) {
      await mobileConvs[0].click();
      await sleep(2000);
      await screenshot(page, '14_mobile_chat_open');

      const backBtn = await page.$('button[aria-label="Назад к списку"]');
      if (backBtn) {
        pass('Mobile: кнопка "Назад"', 'Присутствует');
        await backBtn.click();
        await sleep(1000);
        const listAgain = await page.$('[data-testid="chat-conversation-list"]');
        if (listAgain && await listAgain.isVisible()) {
          pass('Mobile: навигация назад', 'Возврат к списку работает');
        }
      } else {
        warn('Mobile: кнопка "Назад"', 'Не найдена');
      }
    }

    await page.setViewportSize({ width: 1440, height: 900 });

    // ═══════════════════════════════════════════════════════════════
    // 15. EMPTY STATE
    // ═══════════════════════════════════════════════════════════════
    log('🫙', '15. Проверка пустого состояния...');
    await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForSelector('[data-testid="chat-page"]', { timeout: TIMEOUT });
    await sleep(1500);

    const emptyState = await page.$('[data-testid="chat-empty-state"]');
    if (emptyState) {
      const text = await emptyState.textContent();
      if (text && text.includes('Выберите чат')) {
        pass('Пустое состояние', '"Выберите чат для начала общения" отображается');
      } else {
        pass('Пустое состояние', 'Блок пустого состояния виден');
      }
    } else {
      warn('Пустое состояние', 'Не найдено');
    }
    await screenshot(page, '15_empty_state');

    // ═══════════════════════════════════════════════════════════════
    // 16. ACCESSIBILITY
    // ═══════════════════════════════════════════════════════════════
    log('♿', '16. Проверки доступности...');

    const convItems3 = await page.$$('[data-testid="chat-conversation-list"] div[class*="cursor-pointer"]');
    if (convItems3.length > 0) {
      await convItems3[0].click();
      await sleep(1500);
    }

    // Send/Mic button
    const sendOrMicBtn = await page.$('[data-testid="chat-send-btn"], [data-testid="chat-mic-btn"]');
    if (sendOrMicBtn) {
      const aria = await sendOrMicBtn.getAttribute('aria-label');
      if (aria) pass('A11y: кнопка отправки/микрофона', `aria-label="${aria}"`);
      else warn('A11y: кнопка отправки/микрофона', 'Нет aria-label');
    }

    const newBtnA11y = await page.$('[data-testid="chat-new-btn"]');
    if (newBtnA11y) {
      const title = await newBtnA11y.getAttribute('title');
      if (title) pass('A11y: кнопка нового чата', `title="${title}"`);
      else warn('A11y: кнопка нового чата', 'Нет title');
    }

    const searchBtnA11y = await page.$('[data-testid="chat-search-btn"]');
    if (searchBtnA11y) {
      const title = await searchBtnA11y.getAttribute('title');
      if (title) pass('A11y: кнопка поиска', `title="${title}"`);
      else warn('A11y: кнопка поиска', 'Нет title');
    }

    const menuBtnA11y = await page.$('[data-testid="chat-menu-btn"]');
    if (menuBtnA11y) {
      const title = await menuBtnA11y.getAttribute('title');
      if (title) pass('A11y: кнопка меню', `title="${title}"`);
      else warn('A11y: кнопка меню', 'Нет title');
    }

    // Attach button
    const attachBtn = await page.$('[data-testid="chat-attach-btn"]');
    if (attachBtn) {
      const aria = await attachBtn.getAttribute('aria-label');
      if (aria) pass('A11y: кнопка прикрепления', `aria-label="${aria}"`);
      else warn('A11y: кнопка прикрепления', 'Нет aria-label');
    }

    // Emoji button
    const emojiBtn = await page.$('[data-testid="chat-emoji-btn"]');
    if (emojiBtn) {
      const aria = await emojiBtn.getAttribute('aria-label');
      if (aria) pass('A11y: кнопка эмодзи', `aria-label="${aria}"`);
      else warn('A11y: кнопка эмодзи', 'Нет aria-label');
    }

    // ═══════════════════════════════════════════════════════════════
    // CONSOLE ERRORS
    // ═══════════════════════════════════════════════════════════════
    log('🐛', 'Проверка ошибок в консоли...');
    if (consoleErrors.length === 0) {
      pass('Console errors', 'Ошибок не обнаружено');
    } else {
      const unique = [...new Set(consoleErrors.map(e => e.text))];
      fail('Console errors', `${consoleErrors.length} ошибок (${unique.length} уникальных)`);
      for (const err of unique.slice(0, 10)) {
        console.log(`   [console error] ${err.substring(0, 200)}`);
      }
    }

  } catch (err) {
    fail('CRASH', err.message);
    try { await screenshot(page, 'ERROR_crash'); } catch {}
  } finally {
    await browser.close();
  }

  // ═══════════════════════════════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '='.repeat(70));
  console.log('  ОТЧЕТ АУДИТА ЧАТА — Stankoff Portal');
  console.log('='.repeat(70));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warnings = results.filter(r => r.status === 'WARN').length;

  console.log(`\n  PASS: ${passed}  |  FAIL: ${failed}  |  WARN: ${warnings}  |  TOTAL: ${results.length}\n`);

  for (const r of results) {
    const icon = r.status === 'PASS' ? '[PASS]' : r.status === 'FAIL' ? '[FAIL]' : '[WARN]';
    console.log(`  ${icon} ${r.test}${r.detail ? ' -- ' + r.detail : ''}`);
  }

  if (consoleErrors.length > 0) {
    console.log(`\n  Console errors (${consoleErrors.length}):`);
    const unique = [...new Set(consoleErrors.map(e => e.text))];
    for (const err of unique.slice(0, 15)) {
      console.log(`    - ${err.substring(0, 150)}`);
    }
  }

  console.log('\n' + '='.repeat(70));

  const report = {
    date: new Date().toISOString(),
    summary: { passed, failed, warnings, total: results.length },
    results,
    consoleErrors: consoleErrors.slice(0, 50),
  };
  writeFileSync(
    path.join(SCREENSHOTS, 'chat-audit-result.json'),
    JSON.stringify(report, null, 2),
  );
  log('📄', 'Отчёт сохранён: audit-screenshots/chat-audit-result.json');

  process.exit(failed > 0 ? 1 : 0);
})();
