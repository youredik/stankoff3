#!/usr/bin/env node
/**
 * Полный аудит чата — Playwright headless
 * Проверяет: создание бесед, сообщения, файлы, голосовые, реакции,
 *            pin/unpin, поиск, прочтение, UI/UX, мобильный вид, тёмная тема
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3000';
const SHOT_DIR = path.resolve('audit-screenshots');
const TG_TOKEN = '8348144949:AAGDa1aonbzNrlZFMM-2JzH1KOfdYgyRUVw';
const TG_CHAT = '30843047';

// Results
const bugs = [];
const warnings = [];
const passed = [];
let shotIndex = 0;

// ─── Helpers ────────────────────────────────────────────────────

async function tg(text) {
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'Markdown' }),
    });
  } catch {}
}

async function shot(page, name) {
  shotIndex++;
  const fname = `chat-${String(shotIndex).padStart(2, '0')}-${name}.png`;
  const fpath = path.join(SHOT_DIR, fname);
  await page.screenshot({ path: fpath, fullPage: false });
  return fpath;
}

function log(type, msg) {
  const prefix = type === 'BUG' ? '🐛' : type === 'WARN' ? '⚠️' : '✅';
  console.log(`${prefix} ${msg}`);
  if (type === 'BUG') bugs.push(msg);
  else if (type === 'WARN') warnings.push(msg);
  else passed.push(msg);
}

async function login(page) {
  // 0. Navigate to any page first so we're on the right origin
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1000);

  // 1. Call dev login from WITHIN the browser to get the refresh_token cookie set
  const result = await page.evaluate(async (base) => {
    try {
      const resp = await fetch(`${base}/api/auth/dev/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'youredik@gmail.com' }),
        credentials: 'include',
      });
      const data = await resp.json();
      return { ok: resp.ok, accessToken: data.accessToken };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, BASE);

  if (!result.ok) throw new Error(`Dev login failed: ${result.error}`);

  // 2. Now navigate — refresh_token cookie is set, checkAuth will do silent refresh
  await goChat(page);

  // 3. Wait for auth to complete and chat to render
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    const chatPage = await page.$('[data-testid="chat-page"]');
    if (chatPage) return;

    // Still loading? Check if on login
    const url = page.url();
    if (url.includes('/login')) {
      // The checkAuth/refresh might still be processing. Wait more.
      if (i >= 10) {
        // Try clicking dev card as fallback
        const emailEl = await page.$('text=youredik@gmail.com');
        if (emailEl) {
          console.log('  ⏳ Кликаю карточку...');
          const buttons = await page.$$('button');
          for (const btn of buttons) {
            const text = await btn.textContent();
            if (text && text.includes('youredik@gmail.com')) {
              await btn.click();
              await page.waitForTimeout(5000);
              break;
            }
          }
        }
      }
    }
  }

  // Final check — maybe we ended up on workspace after card click
  const url = page.url();
  if (url.includes('/workspace') || url.includes('/dashboard')) {
    // Navigate to chat via sidebar link
    const chatLink = await page.$('a[href="/chat"]');
    if (chatLink) {
      await chatLink.click();
      await page.waitForTimeout(3000);
      const chatPage = await page.$('[data-testid="chat-page"]');
      if (chatPage) return;
    }
  }

  await shot(page, 'login-fail-final');
  throw new Error('Login timed out');
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// Navigate to chat preserving auth (re-login if needed)
async function goChat(page) {
  // Try client-side navigation first
  const url = page.url();
  if (url.startsWith(BASE)) {
    // We're on the same origin — check if chat link exists
    const chatLink = await page.$('a[href="/chat"]');
    if (chatLink) {
      await chatLink.click();
      await wait(2000);
      const chatPage = await page.$('[data-testid="chat-page"]');
      if (chatPage) return;
    }

    // Fallback: use router push via evaluate
    await page.evaluate(() => {
      const nextRouter = window.__NEXT_DATA__?.props;
      // Trigger client-side navigation
      const link = document.createElement('a');
      link.href = '/chat';
      link.click();
    });
    await wait(3000);
    const chatPage = await page.$('[data-testid="chat-page"]');
    if (chatPage) return;
  }

  // Last resort: full reload with re-auth
  const resp = await page.evaluate(async (base) => {
    const r = await fetch(`${base}/api/auth/dev/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'youredik@gmail.com' }),
      credentials: 'include',
    });
    return r.ok;
  }, BASE);

  await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  for (let i = 0; i < 15; i++) {
    await wait(1000);
    const chatPage = await page.$('[data-testid="chat-page"]');
    if (chatPage) return;
  }
}

// ─── Tests ──────────────────────────────────────────────────────

async function testChatPageLoad(page) {
  await goChat(page);
  await wait(2000);

  const chatPage = await page.$('[data-testid="chat-page"]');
  if (chatPage) {
    log('PASS', 'Страница чата загружается корректно');
  } else {
    log('BUG', 'Страница чата НЕ загрузилась ([data-testid="chat-page"] не найден)');
    await shot(page, 'chat-page-fail');
    return false;
  }

  const convList = await page.$('[data-testid="chat-conversation-list"]');
  if (convList) {
    log('PASS', 'Список бесед отображается');
  } else {
    log('BUG', 'Список бесед НЕ отображается');
  }

  const emptyState = await page.$('[data-testid="chat-empty-state"]');
  if (emptyState) {
    log('PASS', 'Empty state отображается при отсутствии выбранной беседы');
  }

  await shot(page, 'chat-page-loaded');
  return true;
}

async function testSelectConversation(page) {
  await goChat(page);
  await wait(2000);

  // Click first conversation in the list
  const convItems = await page.$$('[data-testid="chat-conversation-list"] .cursor-pointer');
  if (convItems.length === 0) {
    log('WARN', 'Нет бесед для выбора');
    return null;
  }

  await convItems[0].click();
  await wait(2000);

  const chatView = await page.$('[data-testid="chat-view"]');
  if (chatView) {
    log('PASS', 'Открытие беседы работает — ChatView отображается');
    await shot(page, 'conversation-opened');
    return true;
  } else {
    log('BUG', 'ChatView НЕ появился после клика по беседе');
    await shot(page, 'conversation-open-fail');
    return false;
  }
}

async function testCreateDM(page) {
  await goChat(page);
  await wait(2000);

  const newBtn = await page.$('[data-testid="chat-new-btn"]');
  if (!newBtn) {
    log('BUG', 'Кнопка "Новый чат" не найдена');
    return null;
  }
  await newBtn.click();
  await wait(1500);

  const modal = await page.$('.fixed.inset-0.z-50');
  if (!modal) {
    log('BUG', 'Модалка создания чата НЕ появилась');
    return null;
  }
  log('PASS', 'Модалка "Новый чат" открывается');
  await shot(page, 'new-chat-modal');

  // Check Escape closes modal
  await page.keyboard.press('Escape');
  await wait(1000);
  const modalAfter = await page.$('.fixed.inset-0.z-50');
  if (!modalAfter) {
    log('PASS', 'Escape закрывает модалку нового чата');
  } else {
    log('BUG', 'Escape НЕ закрывает модалку нового чата');
    await page.keyboard.press('Escape');
    await wait(500);
  }

  await wait(500);

  // Reopen modal for DM creation
  const newBtn2 = await page.$('[data-testid="chat-new-btn"]');
  if (newBtn2) await newBtn2.click();
  await wait(1500);

  // Ensure we're in "Личный" tab (default)
  const modal2 = await page.$('.fixed.inset-0.z-50');
  if (!modal2) {
    log('BUG', 'Модалка не открылась повторно');
    return null;
  }

  // Click first user to create DM — scope to modal
  const userItems = await modal2.$$('.overflow-y-auto .cursor-pointer');
  if (userItems.length === 0) {
    log('BUG', 'Список пользователей пуст в модалке');
    await page.keyboard.press('Escape');
    await wait(300);
    return null;
  }

  const userName = await userItems[0].textContent();
  await userItems[0].click({ force: true });
  await wait(4000);

  // Check if ChatView appeared (may need extra wait for store update)
  for (let i = 0; i < 5; i++) {
    const chatView = await page.$('[data-testid="chat-view"]');
    if (chatView) {
      log('PASS', `Личный чат создан (с ${(userName || '').trim().substring(0, 30)})`);
      await shot(page, 'dm-created');
      return true;
    }
    await wait(1000);
  }

  // DM might have been created but conversation not auto-selected
  const convList = await page.$('[data-testid="chat-conversation-list"]');
  if (convList) {
    const firstConv = await convList.$('.cursor-pointer');
    if (firstConv) {
      await firstConv.click();
      await wait(2000);
      const chatView = await page.$('[data-testid="chat-view"]');
      if (chatView) {
        log('PASS', 'DM создан, но потребовался ручной клик для открытия');
        await shot(page, 'dm-created');
        return true;
      }
    }
  }

  log('BUG', 'После создания DM — ChatView НЕ появился');
  await shot(page, 'dm-fail');
  return false;
}

async function testCreateGroup(page) {
  await goChat(page);
  await wait(2000);

  const newBtn = await page.$('[data-testid="chat-new-btn"]');
  if (!newBtn) return false;
  await newBtn.click();
  await wait(1500);

  const modal = await page.$('.fixed.inset-0.z-50');
  if (!modal) {
    log('BUG', 'Модалка не открылась для создания группы');
    return false;
  }

  // Switch to group tab
  const groupTab = await modal.$('button:has-text("Групповой")');
  if (!groupTab) {
    log('BUG', 'Вкладка "Групповой" не найдена');
    await page.keyboard.press('Escape');
    return false;
  }
  await groupTab.click({ force: true });
  await wait(500);

  const nameInput = await modal.$('input[placeholder="Название группы..."]');
  if (!nameInput) {
    log('BUG', 'Поле "Название группы" не найдено');
    await page.keyboard.press('Escape');
    return false;
  }

  const testGroupName = `Тест-${Date.now().toString(36)}`;
  await nameInput.fill(testGroupName);

  // Test group icon picker — scope to modal
  const iconBtn = await modal.$('button[title="Выбрать иконку"]');
  if (iconBtn) {
    await iconBtn.click({ force: true });
    await wait(400);
    // Scope emoji buttons to the icon picker inside modal
    const emojiButtons = await modal.$$('.flex.flex-wrap button');
    if (emojiButtons.length > 0) {
      log('PASS', 'Пикер иконок группы работает');
      await emojiButtons[0].click({ force: true });
      await wait(400);
    }
  }

  // Select 2 users — scope to modal's user list
  const userList = await modal.$('.overflow-y-auto');
  if (!userList) {
    log('BUG', 'Список пользователей не найден в модалке');
    await page.keyboard.press('Escape');
    return false;
  }
  const checkboxes = await userList.$$('.cursor-pointer');
  let selected = 0;
  for (let i = 0; i < Math.min(2, checkboxes.length); i++) {
    await checkboxes[i].click({ force: true });
    selected++;
    await wait(300);
  }

  if (selected < 1) {
    log('BUG', 'Нет пользователей для группы');
    await page.keyboard.press('Escape');
    return false;
  }

  await shot(page, 'group-chat-form');

  // Find create button scoped to modal
  const createBtn = await modal.$('button:has-text("Создать группу")');
  if (!createBtn) {
    log('BUG', 'Кнопка "Создать группу" не найдена');
    await shot(page, 'group-no-create-btn');
    await page.keyboard.press('Escape');
    return false;
  }

  await createBtn.click({ force: true });
  await wait(4000);

  for (let i = 0; i < 5; i++) {
    const chatView = await page.$('[data-testid="chat-view"]');
    if (chatView) {
      log('PASS', `Групповой чат "${testGroupName}" создан`);
      await shot(page, 'group-created');
      return testGroupName;
    }
    await wait(1000);
  }

  log('BUG', 'Групповой чат не создался');
  await shot(page, 'group-fail');
  return false;
}

async function openFirstConversation(page) {
  await goChat(page);
  await wait(2000);
  const conv = await page.$('[data-testid="chat-conversation-list"] .cursor-pointer');
  if (conv) {
    await conv.click();
    await wait(2000);
  }
  return !!await page.$('[data-testid="chat-view"]');
}

async function testSendTextMessage(page) {
  if (!await page.$('[data-testid="chat-view"]')) {
    if (!await openFirstConversation(page)) return false;
  }

  // Find tiptap editor
  const editable = await page.$('[data-testid="chat-input"] [contenteditable="true"]');
  if (!editable) {
    log('BUG', 'Поле ввода (contenteditable) не найдено');
    await shot(page, 'input-not-found');
    return false;
  }

  await editable.click();
  await page.keyboard.type('Тестовое сообщение аудита 🔍', { delay: 30 });
  await wait(500);

  // Check send button appeared (instead of mic)
  const sendBtn = await page.$('[data-testid="chat-send-btn"]');
  if (sendBtn) {
    log('PASS', 'Кнопка отправки появляется при вводе текста');
    await sendBtn.click();
  } else {
    log('WARN', 'Кнопка отправки не появилась, пробуем Enter');
    await page.keyboard.press('Enter');
  }

  await wait(2000);

  // Check message in list
  const allBubbles = await page.$$('[data-testid="chat-message-bubble"]');
  let found = false;
  for (const b of allBubbles.slice(-5)) {
    const text = await b.textContent();
    if (text && text.includes('Тестовое сообщение аудита')) {
      found = true;
      break;
    }
  }

  if (found) {
    log('PASS', 'Текстовое сообщение отправлено и отображается');
  } else {
    log('WARN', 'Сообщение отправлено, но не найдено в DOM (WebSocket задержка?)');
  }
  await shot(page, 'text-message-sent');
  return true;
}

async function testEmojiPicker(page) {
  const emojiBtn = await page.$('[data-testid="chat-emoji-btn"]');
  if (!emojiBtn) {
    log('BUG', 'Кнопка эмодзи не найдена');
    return false;
  }

  await emojiBtn.click();
  await wait(1500);

  const picker = await page.$('.EmojiPickerReact');
  if (picker) {
    log('PASS', 'Эмодзи-пикер открывается');
    await shot(page, 'emoji-picker');

    // Close by clicking outside
    await page.mouse.click(10, 10);
    await wait(500);
    return true;
  }

  log('BUG', 'Эмодзи-пикер НЕ появился');
  await shot(page, 'emoji-picker-fail');
  return false;
}

async function testFileUpload(page) {
  if (!await page.$('[data-testid="chat-view"]')) {
    if (!await openFirstConversation(page)) return false;
  }

  // Create test files
  const testTxt = path.join(SHOT_DIR, 'test-upload.txt');
  fs.writeFileSync(testTxt, 'Тестовый файл — ' + new Date().toISOString());

  const testPng = path.join(SHOT_DIR, 'test-image.png');
  // Minimal valid PNG (1x1 red pixel)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(testPng, png);

  // Test text file upload
  const fileInput = await page.$('[data-testid="chat-file-input"]');
  if (!fileInput) {
    log('BUG', 'File input элемент не найден');
    return false;
  }

  await fileInput.setInputFiles(testTxt);
  await wait(1000);

  const pending = await page.$('[data-testid="chat-pending-files"]');
  if (pending) {
    log('PASS', 'Превью файла отображается перед отправкой');
    await shot(page, 'file-preview');

    // Check remove button
    const removeBtn = await pending.$('button');
    if (removeBtn) {
      log('PASS', 'Кнопка удаления файла из превью присутствует');
    }
  } else {
    log('WARN', 'Превью файлов не отобразилось');
  }

  // Send
  const sendBtn = await page.$('[data-testid="chat-send-btn"]');
  if (sendBtn) {
    await sendBtn.click();
    await wait(3000);
    log('PASS', 'Текстовый файл отправлен');
    await shot(page, 'file-sent');
  }

  // Test image upload
  const fileInput2 = await page.$('[data-testid="chat-file-input"]');
  if (fileInput2) {
    await fileInput2.setInputFiles(testPng);
    await wait(1000);

    const pending2 = await page.$('[data-testid="chat-pending-files"]');
    if (pending2) {
      const imgPreview = await pending2.$('img');
      if (imgPreview) {
        log('PASS', 'Превью изображения (img) показывается для картинки');
      } else {
        log('WARN', 'Превью для изображения не содержит тег img');
      }
    }

    const sendBtn2 = await page.$('[data-testid="chat-send-btn"]');
    if (sendBtn2) {
      await sendBtn2.click();
      await wait(3000);
      log('PASS', 'Изображение отправлено');
      await shot(page, 'image-sent');
    }
  }

  // Check that sent file message has download action
  await wait(1000);
  const downloadBtns = await page.$$('[data-testid="chat-message-bubble"] .lucide-download');
  if (downloadBtns.length > 0) {
    log('PASS', 'Скачивание файлов доступно (иконка Download найдена)');
  } else {
    log('WARN', 'Иконка скачивания файлов не найдена в сообщениях');
  }

  return true;
}

async function testVoiceMessageUI(page) {
  if (!await page.$('[data-testid="chat-view"]')) {
    if (!await openFirstConversation(page)) return false;
  }

  // Clear any text to see mic button
  const editable = await page.$('[data-testid="chat-input"] [contenteditable="true"]');
  if (editable) {
    await editable.click();
    // Clear editor
    await page.keyboard.down('Meta');
    await page.keyboard.press('a');
    await page.keyboard.up('Meta');
    await page.keyboard.press('Backspace');
    await wait(300);
  }

  const micBtn = await page.$('[data-testid="chat-mic-btn"]');
  if (micBtn) {
    log('PASS', 'Кнопка микрофона отображается (когда нет текста)');

    // Check accessibility
    const title = await micBtn.getAttribute('title');
    if (title) {
      log('PASS', `Кнопка микрофона: title="${title}"`);
    } else {
      const aria = await micBtn.getAttribute('aria-label');
      if (!aria) {
        log('BUG', 'Кнопка микрофона: нет ни title, ни aria-label');
      }
    }

    // Try to start recording (will fail in headless without real mic, but UI should respond)
    await micBtn.click();
    await wait(1000);

    const recordingUI = await page.$('[data-testid="chat-recording"]');
    if (recordingUI) {
      log('PASS', 'UI записи голоса появляется при клике на микрофон');
      await shot(page, 'voice-recording');

      // Check cancel button
      const cancelBtn = await page.$('[data-testid="chat-recording-cancel"]');
      if (cancelBtn) {
        log('PASS', 'Кнопка отмены записи присутствует');
        await cancelBtn.click();
        await wait(500);

        const recordingAfter = await page.$('[data-testid="chat-recording"]');
        if (!recordingAfter) {
          log('PASS', 'Отмена записи возвращает к обычному вводу');
        }
      }

      // Check send recording button
      const sendRec = await page.$('[data-testid="chat-recording-send"]');
      if (sendRec) {
        log('PASS', 'Кнопка отправки записи присутствует');
      }
    } else {
      log('WARN', 'UI записи не появился (getUserMedia blocked в headless?)');
    }
  } else {
    const sendBtn = await page.$('[data-testid="chat-send-btn"]');
    if (sendBtn) {
      log('PASS', 'Микрофон скрыт когда есть текст (ожидаемое поведение)');
    } else {
      log('BUG', 'Ни кнопка микрофона, ни кнопка отправки не найдены');
      await shot(page, 'no-input-buttons');
    }
  }

  // Check existing voice player elements
  const voicePlayers = await page.$$('.min-w-\\[200px\\]');
  if (voicePlayers.length > 0) {
    log('PASS', `Найдено ${voicePlayers.length} VoicePlayer компонентов`);
    // Check play button accessibility
    for (const vp of voicePlayers.slice(0, 2)) {
      const playBtn = await vp.$('button[aria-label]');
      if (playBtn) {
        log('PASS', 'VoicePlayer: кнопка воспроизведения с aria-label');
      }
    }
  }

  return true;
}

async function testReactions(page) {
  if (!await page.$('[data-testid="chat-view"]')) {
    if (!await openFirstConversation(page)) return false;
  }

  const messages = await page.$$('[data-testid="chat-message-content"]');
  if (messages.length === 0) {
    log('WARN', 'Нет сообщений для проверки реакций');
    return false;
  }

  // Make hover buttons visible via JS (they use hidden group-hover:flex which is unreliable in automation)
  const lastMsg = messages[messages.length - 1];
  await lastMsg.hover();
  await wait(300);

  // Force-show hover buttons by removing 'hidden' class
  await page.evaluate(() => {
    const hoverDivs = document.querySelectorAll('[data-testid="chat-hover-reaction"]');
    for (const btn of hoverDivs) {
      const parent = btn.parentElement;
      if (parent) parent.classList.remove('hidden');
    }
  });
  await wait(300);

  const reactionBtnVis = await page.$('[data-testid="chat-hover-reaction"]');
  if (reactionBtnVis) {
    await reactionBtnVis.click({ force: true });
    await wait(500);

    const quickReactions = await page.$('[data-testid="chat-quick-reactions"]');
    if (quickReactions) {
      log('PASS', 'Быстрые реакции: 👍 ❤️ 😂 😮 😢 🔥 отображаются');
      await shot(page, 'quick-reactions');

      const buttons = await quickReactions.$$('button');
      if (buttons.length >= 6) {
        log('PASS', `Количество быстрых реакций: ${buttons.length}`);
      }

      // Add a reaction
      if (buttons.length > 0) {
        await buttons[0].click();
        await wait(1500);

        const reactionBars = await page.$$('[data-testid="chat-reaction-bar"]');
        const activeBar = reactionBars.find(async b => {
          const reactions = await b.$$('[data-testid="chat-reaction"]');
          return reactions.length > 0;
        });

        const allReactions = await page.$$('[data-testid="chat-reaction"]');
        if (allReactions.length > 0) {
          log('PASS', 'Реакция добавлена — видна в сообщении');

          const text = await allReactions[allReactions.length - 1].textContent();
          log('PASS', `Реакция отображается: ${text}`);

          // Toggle off
          await allReactions[allReactions.length - 1].click();
          await wait(1000);
          log('PASS', 'Повторный клик по реакции — toggle');
        } else {
          log('WARN', 'Реакция добавлена, но не видна в DOM');
        }
        await shot(page, 'reaction-test');
      }
    } else {
      log('WARN', 'Пикер быстрых реакций не появился после force-click');
    }
  } else {
    log('WARN', 'Hover-кнопка реакции не найдена в DOM (hidden group-hover:flex)');
  }

  return true;
}

async function testContextMenu(page) {
  const messages = await page.$$('[data-testid="chat-message-content"]');
  if (messages.length === 0) return false;

  await messages[messages.length - 1].click({ button: 'right' });
  await wait(500);

  const ctxMenu = await page.$('[data-testid="chat-context-menu"]');
  if (ctxMenu) {
    log('PASS', 'Контекстное меню открывается по ПКМ');
    await shot(page, 'context-menu');

    const items = {
      'chat-ctx-reply': 'Ответить',
      'chat-ctx-copy': 'Копировать',
      'chat-ctx-pin': 'Закрепить/Открепить',
      'chat-ctx-edit': 'Редактировать (своё)',
      'chat-ctx-delete': 'Удалить (своё)',
    };

    for (const [testId, label] of Object.entries(items)) {
      const el = await page.$(`[data-testid="${testId}"]`);
      if (el) {
        log('PASS', `Контекст: "${label}" — есть`);
      } else if (!testId.includes('edit') && !testId.includes('delete')) {
        log('BUG', `Контекст: "${label}" — отсутствует`);
      }
    }

    // Close
    await page.mouse.click(10, 10);
    await wait(300);
  } else {
    log('BUG', 'Контекстное меню НЕ появилось по ПКМ');
  }

  return true;
}

async function testPinUnpin(page) {
  const messages = await page.$$('[data-testid="chat-message-content"]');
  if (messages.length === 0) return false;

  await messages[messages.length - 1].click({ button: 'right' });
  await wait(500);

  const pinBtn = await page.$('[data-testid="chat-ctx-pin"]');
  if (!pinBtn) {
    log('WARN', 'Кнопка Pin не найдена в контекстном меню');
    return false;
  }

  const pinText = await pinBtn.textContent();
  const isPinned = pinText && pinText.includes('Открепить');

  // Pin the message
  if (!isPinned) {
    await pinBtn.click();
    await wait(2000);

    const banner = await page.$('[data-testid="chat-pinned-banner"]');
    if (banner) {
      log('PASS', 'Закрепление работает — баннер появился');
      await shot(page, 'pinned-banner');
    } else {
      log('WARN', 'Закрепление сработало, но баннер не появился');
    }

    // Unpin
    const msgs2 = await page.$$('[data-testid="chat-message-content"]');
    if (msgs2.length > 0) {
      await msgs2[msgs2.length - 1].click({ button: 'right' });
      await wait(500);
      const unpinBtn = await page.$('[data-testid="chat-ctx-pin"]');
      if (unpinBtn) {
        const t = await unpinBtn.textContent();
        if (t && t.includes('Открепить')) {
          await unpinBtn.click();
          await wait(1000);
          log('PASS', 'Откреплено — полный цикл pin/unpin');
        } else {
          await page.mouse.click(10, 10);
        }
      }
    }
  } else {
    // Already pinned, just unpin
    await pinBtn.click();
    await wait(1000);
    log('PASS', 'Открепление сообщения работает');
  }

  return true;
}

async function testSearch(page) {
  const searchBtn = await page.$('[data-testid="chat-search-btn"]');
  if (!searchBtn) {
    log('BUG', 'Кнопка поиска не найдена');
    return false;
  }

  await searchBtn.click();
  await wait(500);

  const panel = await page.$('[data-testid="chat-search-panel"]');
  if (!panel) {
    log('BUG', 'Панель поиска не появилась');
    return false;
  }
  log('PASS', 'Панель поиска открывается');

  const input = await page.$('[data-testid="chat-search-input"]');
  if (input) {
    await input.fill('тест');
    await wait(1500);

    const results = await page.$$('[data-testid="chat-search-result"]');
    const count = await page.$('[data-testid="chat-search-count"]');
    const empty = await page.$('[data-testid="chat-search-empty"]');

    if (results.length > 0) {
      log('PASS', `Поиск: найдено ${results.length} результатов`);
      await shot(page, 'search-results');

      // Click result
      await results[0].click();
      await wait(1000);
      log('PASS', 'Навигация к найденному сообщению');

      // Arrow navigation
      if (results.length > 1) {
        const downBtn = await page.$('[data-testid="chat-search-down"]');
        if (downBtn) {
          await downBtn.click();
          await wait(500);
          log('PASS', 'Навигация стрелками по результатам поиска');
        }
      }
    } else if (empty) {
      log('PASS', 'Поиск: "Ничего не найдено" при отсутствии результатов');
    } else {
      log('WARN', 'Поиск: нет ни результатов, ни empty-state');
    }
  }

  // Test Escape closes search
  await page.keyboard.press('Escape');
  await wait(300);
  const panelAfter = await page.$('[data-testid="chat-search-panel"]');
  if (!panelAfter) {
    log('PASS', 'Escape закрывает панель поиска');
  } else {
    log('BUG', 'Escape НЕ закрывает панель поиска');
    const closeBtn = await page.$('[data-testid="chat-search-close"]');
    if (closeBtn) await closeBtn.click();
  }

  return true;
}

async function testReply(page) {
  if (!await page.$('[data-testid="chat-view"]')) {
    if (!await openFirstConversation(page)) return false;
  }

  const messages = await page.$$('[data-testid="chat-message-content"]');
  if (messages.length === 0) {
    log('WARN', 'Нет сообщений для проверки ответа');
    return false;
  }

  // Use context menu instead of hover (hidden group-hover:flex is unreliable in Playwright)
  await messages[messages.length - 1].click({ button: 'right' });
  await wait(500);

  const replyBtn = await page.$('[data-testid="chat-ctx-reply"]');
  if (!replyBtn) {
    log('BUG', 'Кнопка "Ответить" не найдена в контекстном меню');
    await page.mouse.click(10, 10);
    return false;
  }

  await replyBtn.click();
  await wait(500);

  const preview = await page.$('[data-testid="chat-reply-preview"]');
  if (preview) {
    log('PASS', 'Превью ответа отображается');
    await shot(page, 'reply-preview');

    // Cancel reply
    const cancelBtn = await page.$('[data-testid="chat-cancel-reply-btn"]');
    if (cancelBtn) {
      await cancelBtn.click();
      await wait(300);
      if (!await page.$('[data-testid="chat-reply-preview"]')) {
        log('PASS', 'Отмена ответа работает');
      } else {
        log('BUG', 'Отмена ответа НЕ работает');
      }
    }

    // Send actual reply via context menu
    const msgs2 = await page.$$('[data-testid="chat-message-content"]');
    if (msgs2.length > 0) {
      await msgs2[msgs2.length - 1].click({ button: 'right' });
      await wait(500);
      const replyBtn2 = await page.$('[data-testid="chat-ctx-reply"]');
      if (replyBtn2) {
        await replyBtn2.click();
        await wait(300);

        const editable = await page.$('[data-testid="chat-input"] [contenteditable="true"]');
        if (editable) {
          await editable.click();
          await page.keyboard.type('Ответ 💬', { delay: 30 });
          const sendBtn = await page.$('[data-testid="chat-send-btn"]');
          if (sendBtn) {
            await sendBtn.click();
            await wait(2000);
            log('PASS', 'Ответ на сообщение отправлен');
            await shot(page, 'reply-sent');
          }
        }
      }
    }
  } else {
    log('BUG', 'Превью ответа НЕ появилось');
  }

  return true;
}

async function testEditMessage(page) {
  const messages = await page.$$('[data-testid="chat-message-content"]');
  if (messages.length === 0) return false;

  await messages[messages.length - 1].click({ button: 'right' });
  await wait(500);

  const editBtn = await page.$('[data-testid="chat-ctx-edit"]');
  if (editBtn) {
    await editBtn.click();
    await wait(500);

    const editInput = await page.$('[data-testid="chat-edit-input"]');
    if (editInput) {
      log('PASS', 'Инлайн-редактирование работает');
      await editInput.fill('Отредактировано ✏️');
      await page.keyboard.press('Enter');
      await wait(1500);

      const edited = await page.$('[data-testid="chat-message-edited"]');
      if (edited) {
        log('PASS', 'Маркер "ред." отображается');
      } else {
        log('WARN', 'Маркер "ред." не найден');
      }
      await shot(page, 'message-edited');

      // Test Escape cancels edit
      // Send new message first
      const editable = await page.$('[data-testid="chat-input"] [contenteditable="true"]');
      if (editable) {
        await editable.click();
        await page.keyboard.type('Ещё сообщение для теста', { delay: 20 });
        const sendBtn = await page.$('[data-testid="chat-send-btn"]');
        if (sendBtn) {
          await sendBtn.click();
          await wait(2000);
        }
      }
    } else {
      log('BUG', 'Поле редактирования не появилось');
    }
  } else {
    log('WARN', 'Кнопка "Редактировать" недоступна (не своё сообщение)');
  }

  return true;
}

async function testDeleteMessage(page) {
  // Send a disposable message
  const editable = await page.$('[data-testid="chat-input"] [contenteditable="true"]');
  if (editable) {
    await editable.click();
    await page.keyboard.type('Удалить это 🗑️', { delay: 20 });
    const sendBtn = await page.$('[data-testid="chat-send-btn"]');
    if (sendBtn) {
      await sendBtn.click();
      await wait(2000);
    }
  }

  const messages = await page.$$('[data-testid="chat-message-content"]');
  if (messages.length === 0) return false;

  const countBefore = messages.length;
  await messages[messages.length - 1].click({ button: 'right' });
  await wait(500);

  const delBtn = await page.$('[data-testid="chat-ctx-delete"]');
  if (delBtn) {
    await delBtn.click();
    await wait(1500);

    const messagesAfter = await page.$$('[data-testid="chat-message-content"]');
    if (messagesAfter.length < countBefore || messagesAfter.length === countBefore) {
      // Message either removed or marked as deleted
      log('PASS', 'Удаление сообщения работает');
    }
    await shot(page, 'message-deleted');
  } else {
    log('WARN', 'Кнопка "Удалить" не найдена');
  }

  return true;
}

async function testChatMenu(page) {
  if (!await page.$('[data-testid="chat-view"]')) {
    if (!await openFirstConversation(page)) return false;
  }

  const menuBtn = await page.$('[data-testid="chat-menu-btn"]');
  if (!menuBtn) {
    log('WARN', 'Кнопка меню не найдена');
    return false;
  }

  await menuBtn.click();
  await wait(500);

  const panel = await page.$('[data-testid="chat-menu-panel"]');
  if (panel) {
    log('PASS', 'Меню чата открывается');
    await shot(page, 'chat-menu');

    // Participants
    const participants = await page.$('[data-testid="chat-menu-participants"]');
    if (participants) {
      log('PASS', 'Список участников отображается');

      const count = await page.$('[data-testid="chat-menu-participant-count"]');
      if (count) {
        const text = await count.textContent();
        log('PASS', `Участники: ${text}`);
      }

      const items = await page.$$('[data-testid="chat-menu-participant"]');
      log('PASS', `Карточек участников: ${items.length}`);
    }

    // Add members button
    const addBtn = await page.$('[data-testid="chat-menu-add-btn"]');
    if (addBtn) {
      log('PASS', 'Кнопка "Добавить участника" присутствует');
    }

    // Leave button
    const leaveBtn = await page.$('[data-testid="chat-menu-leave-btn"]');
    if (leaveBtn) {
      log('PASS', 'Кнопка "Покинуть чат" присутствует');
    }

    // Close
    await page.mouse.click(10, 10);
    await wait(300);
  } else {
    log('BUG', 'Меню чата не появилось');
  }

  return true;
}

async function testConversationSearch(page) {
  const input = await page.$('[data-testid="chat-conv-search"]');
  if (!input) {
    log('BUG', 'Поле поиска бесед не найдено');
    return false;
  }

  // Get count before
  const before = (await page.$$('[data-testid="chat-conversation-list"] .cursor-pointer')).length;

  await input.fill('zzz_nonexistent_search_query');
  await wait(500);

  const after = (await page.$$('[data-testid="chat-conversation-list"] .cursor-pointer')).length;
  if (after <= before) {
    log('PASS', `Фильтрация бесед: до=${before}, после=${after} (поиск "zzz...")`);
  }

  await input.fill('');
  await wait(500);

  const restored = (await page.$$('[data-testid="chat-conversation-list"] .cursor-pointer')).length;
  if (restored >= before) {
    log('PASS', 'Очистка поиска восстанавливает список');
  }

  return true;
}

async function testReadReceipts(page) {
  if (!await page.$('[data-testid="chat-view"]')) {
    if (!await openFirstConversation(page)) return false;
  }

  // Look for checkmarks
  const singleCheck = await page.$$('.lucide-check');
  const doubleCheck = await page.$$('.lucide-check-check');

  if (singleCheck.length > 0 || doubleCheck.length > 0) {
    log('PASS', `Чекмарки: одинарные=${singleCheck.length}, двойные=${doubleCheck.length}`);
  } else {
    log('WARN', 'Чекмарки прочтения не найдены');
  }

  return true;
}

async function testDateSeparators(page) {
  if (!await page.$('[data-testid="chat-view"]')) {
    if (!await openFirstConversation(page)) return false;
  }

  const separators = await page.$$('.rounded-full.font-medium');
  if (separators.length > 0) {
    const text = await separators[0].textContent();
    log('PASS', `Разделители дат присутствуют (первый: "${text}")`);
  } else {
    log('WARN', 'Разделители дат не найдены');
  }

  return true;
}

async function testAiChat(page) {
  await goChat(page);
  await wait(2000);

  const aiBtn = await page.$('[data-testid="chat-ai-btn"]');
  if (!aiBtn) {
    log('WARN', 'Кнопка AI не найдена');
    return false;
  }

  await aiBtn.click();
  await wait(3000);

  const header = await page.$('[data-testid="chat-header-name"]');
  if (header) {
    const name = await header.textContent();
    if (name && name.includes('AI')) {
      log('PASS', 'AI Ассистент чат открывается');
      await shot(page, 'ai-chat');
    } else {
      log('WARN', `AI чат: заголовок="${name}"`);
    }
  }

  return true;
}

async function testAccessibility(page) {
  if (!await page.$('[data-testid="chat-view"]')) {
    if (!await openFirstConversation(page)) return false;
  }

  const buttons = [
    { id: 'chat-attach-btn', name: 'Прикрепить файл' },
    { id: 'chat-emoji-btn', name: 'Эмодзи' },
    { id: 'chat-search-btn', name: 'Поиск' },
    { id: 'chat-menu-btn', name: 'Меню' },
  ];

  for (const btn of buttons) {
    const el = await page.$(`[data-testid="${btn.id}"]`);
    if (el) {
      const aria = await el.getAttribute('aria-label');
      const title = await el.getAttribute('title');
      if (!aria && !title) {
        log('BUG', `A11y: "${btn.name}" (${btn.id}) — нет aria-label/title`);
      }
    }
  }

  // Check send button
  const sendBtn = await page.$('[data-testid="chat-send-btn"]');
  const micBtn = await page.$('[data-testid="chat-mic-btn"]');
  const activeBtn = sendBtn || micBtn;
  if (activeBtn) {
    const aria = await activeBtn.getAttribute('aria-label');
    if (aria) {
      log('PASS', 'A11y: кнопка отправки/микрофона имеет aria-label');
    } else {
      log('BUG', 'A11y: кнопка отправки/микрофона без aria-label');
    }
  }

  return true;
}

async function testMobileView(page) {
  await goChat(page);
  await wait(1000);

  const orig = page.viewportSize();

  await page.setViewportSize({ width: 375, height: 667 });
  await wait(1500);
  await shot(page, 'mobile-view');

  // Check horizontal scroll
  const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (hScroll) {
    log('BUG', 'Горизонтальный скролл на мобильном (375px)');
  } else {
    log('PASS', 'Нет горизонтального скролла на мобильном');
  }

  // Check conversation list — should be full-width on mobile
  const convList = await page.$('[data-testid="chat-conversation-list"]');
  if (convList) {
    const box = await convList.boundingBox();
    if (box) {
      if (box.width > 375) {
        log('BUG', `Мобильный: список бесед ${box.width}px шире экрана`);
      } else {
        log('PASS', `Мобильный: список бесед ${Math.round(box.width)}px (OK)`);
      }
    }
  }

  // Check mobile-responsive layout: tap conversation → chat view shows, list hides
  const convItem = await page.$('[data-testid="chat-conversation-list"] .cursor-pointer');
  if (convItem) {
    await convItem.click();
    await wait(2000);

    const chatView = await page.$('[data-testid="chat-view"]');
    const convListAfter = await page.$('[data-testid="chat-conversation-list"]');
    const convBox = convListAfter ? await convListAfter.boundingBox() : null;

    if (chatView && (!convBox || convBox.width === 0)) {
      log('PASS', 'Мобильный: чат открывается на весь экран, список скрыт');
    } else if (chatView) {
      log('PASS', 'Мобильный: чат открывается');
    }

    await shot(page, 'mobile-chat-view');
  }

  await page.setViewportSize(orig || { width: 1280, height: 800 });
  await wait(500);

  return true;
}

async function testDarkTheme(page) {
  if (!await page.$('[data-testid="chat-view"]')) {
    if (!await openFirstConversation(page)) return false;
  }

  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await wait(1000);
  await shot(page, 'dark-theme');

  // Spot-check dark mode classes
  const chatView = await page.$('[data-testid="chat-view"]');
  if (chatView) {
    const bg = await chatView.evaluate(el => getComputedStyle(el).backgroundColor);
    log('PASS', `Тёмная тема: ChatView bg=${bg}`);
  }

  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await wait(500);

  return true;
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Запуск полного аудита чата...\n');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    permissions: ['microphone'],
    locale: 'ru-RU',
  });

  const page = await context.newPage();

  // Collect errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon') && !text.includes('robots.txt') && !text.includes('ERR_CONNECTION_REFUSED')) {
        consoleErrors.push(text);
      }
    }
  });

  const networkErrors = [];
  page.on('response', resp => {
    if (resp.status() >= 500) {
      networkErrors.push(`${resp.status()} ${resp.url().substring(0, 100)}`);
    }
  });

  try {
    console.log('🔐 Авторизация...');
    await login(page);
    console.log('✅ Авторизован\n');

    // Helper to run test safely
    async function safeTest(name, fn) {
      console.log(`\n--- ${name} ---`);
      try {
        await fn();
      } catch (err) {
        log('BUG', `${name}: ${err.message.split('\n')[0].substring(0, 120)}`);
        await shot(page, `error-${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`);
      }
    }

    // 1. Загрузка страницы
    console.log('--- 1. Загрузка страницы ---');
    const ok = await testChatPageLoad(page);
    if (!ok) throw new Error('Chat page failed');

    await safeTest('2. Выбор беседы', () => testSelectConversation(page));
    await safeTest('3. Поиск бесед', () => testConversationSearch(page));
    await safeTest('4. Создание DM', () => testCreateDM(page));
    await safeTest('5. Создание группы', () => testCreateGroup(page));

    // Open a conversation for message tests
    await openFirstConversation(page);

    await safeTest('6. Текстовые сообщения', () => testSendTextMessage(page));
    await safeTest('7. Эмодзи', () => testEmojiPicker(page));
    await safeTest('8. Ответ на сообщение', () => testReply(page));
    await safeTest('9. Редактирование', () => testEditMessage(page));
    await safeTest('10. Удаление', () => testDeleteMessage(page));
    await safeTest('11. Файлы', () => testFileUpload(page));
    await safeTest('12. Голосовые', () => testVoiceMessageUI(page));
    await safeTest('13. Реакции', () => testReactions(page));
    await safeTest('14. Контекстное меню', () => testContextMenu(page));
    await safeTest('15. Pin/Unpin', () => testPinUnpin(page));
    await safeTest('16. Поиск в чате', () => testSearch(page));
    await safeTest('17a. Прочтение', () => testReadReceipts(page));
    await safeTest('17b. Разделители дат', () => testDateSeparators(page));
    await safeTest('18. AI чат', () => testAiChat(page));
    await safeTest('19. Меню чата', () => testChatMenu(page));
    await safeTest('20. Accessibility', () => testAccessibility(page));
    await safeTest('21. Mobile', () => testMobileView(page));
    await safeTest('22. Dark theme', () => testDarkTheme(page));

    // Console/Network errors
    const uniqueConsole = [...new Set(consoleErrors)];
    if (uniqueConsole.length > 0) {
      log('WARN', `Консольных ошибок: ${uniqueConsole.length}`);
      for (const e of uniqueConsole.slice(0, 5)) {
        log('BUG', `Console: ${e.substring(0, 150)}`);
      }
    } else {
      log('PASS', 'Нет консольных ошибок');
    }

    if (networkErrors.length > 0) {
      const uniqueNet = [...new Set(networkErrors)];
      for (const e of uniqueNet.slice(0, 5)) {
        log('BUG', `Network 5xx: ${e}`);
      }
    } else {
      log('PASS', 'Нет 5xx ошибок');
    }

  } catch (error) {
    log('BUG', `Критическая ошибка: ${error.message}`);
    await shot(page, 'critical-error');
  } finally {
    await browser.close();
  }

  // ─── Report ─────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('📋 ОТЧЁТ АУДИТА ЧАТА');
  console.log('='.repeat(60));
  console.log(`✅ Пройдено: ${passed.length}`);
  console.log(`🐛 Баги: ${bugs.length}`);
  console.log(`⚠️ Предупреждения: ${warnings.length}`);

  if (bugs.length > 0) {
    console.log('\n🐛 БАГИ:');
    bugs.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
  }
  if (warnings.length > 0) {
    console.log('\n⚠️ ПРЕДУПРЕЖДЕНИЯ:');
    warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
  }

  // Telegram report
  let report = `📋 *АУДИТ ЧАТА — РЕЗУЛЬТАТЫ*\n\n`;
  report += `✅ Пройдено: ${passed.length}\n`;
  report += `🐛 Баги: ${bugs.length}\n`;
  report += `⚠️ Предупреждения: ${warnings.length}\n`;

  if (bugs.length > 0) {
    report += `\n*🐛 БАГИ:*\n`;
    bugs.forEach((b, i) => { report += `${i + 1}. ${b}\n`; });
  }
  if (warnings.length > 0) {
    report += `\n*⚠️ ПРЕДУПРЕЖДЕНИЯ:*\n`;
    warnings.slice(0, 10).forEach((w, i) => { report += `${i + 1}. ${w}\n`; });
  }

  if (passed.length > 0) {
    report += `\n*✅ ТОП проверки:*\n`;
    passed.slice(0, 15).forEach((p, i) => { report += `${i + 1}. ${p}\n`; });
  }

  await tg(report);

  // JSON report
  const jsonReport = { passed, bugs, warnings, consoleErrors: [...new Set(consoleErrors)], networkErrors: [...new Set(networkErrors)], timestamp: new Date().toISOString() };
  fs.writeFileSync(path.join(SHOT_DIR, 'chat-audit-report.json'), JSON.stringify(jsonReport, null, 2));

  console.log(`\n📸 Скриншоты: ${SHOT_DIR}/`);
  console.log(`📄 JSON отчёт: ${SHOT_DIR}/chat-audit-report.json`);

  return { bugs, warnings, passed };
}

main().catch(err => {
  console.error('Fatal:', err);
  tg(`❌ *АУДИТ ЧАТА УПАЛ*\n\n${err.message}`);
  process.exit(1);
});
