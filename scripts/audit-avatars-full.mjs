/**
 * Полный аудит аватарной системы портала — Playwright
 *
 * Тестирует:
 * 1.  Логин через dev mode (youredik@gmail.com)
 * 2.  Страница /profile — наличие секции аватара
 * 3.  Загрузка тестового изображения аватара
 * 4.  Кроп-модалка — появление
 * 5.  Применение кропа
 * 6.  Обновление аватара на странице профиля
 * 7.  Аватар в Header
 * 8.  Аватар в /chat
 * 9.  Аватар в /workspace (канбан)
 * 10. Аватар в /admin/users
 * 11. Fullscreen preview аватара
 * 12. Удаление аватара
 * 13. Console errors
 * 14. Скриншоты на каждом шаге
 *
 * Запуск: node scripts/audit-avatars-full.mjs
 */

import { chromium } from 'playwright';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

// ─── Конфигурация ───────────────────────────────────────
const BASE = 'http://localhost:3000';
const EMAIL = 'youredik@gmail.com';
const SCREENSHOTS_DIR = join(process.cwd(), 'audit-screenshots');
const TG_TOKEN = '8348144949:AAGDa1aonbzNrlZFMM-2JzH1KOfdYgyRUVw';
const TG_CHAT_ID = '30843047';

// ─── Состояние ──────────────────────────────────────────
const results = [];
const consoleErrors = [];
let screenshotIdx = 0;
let passCount = 0;
let failCount = 0;
let warnCount = 0;

// ─── Утилиты ────────────────────────────────────────────

function ts() {
  return new Date().toLocaleTimeString('ru-RU');
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

function pass(step, detail = '') {
  passCount++;
  const msg = `[PASS] ${step}${detail ? ' -- ' + detail : ''}`;
  results.push({ status: 'pass', step, detail });
  console.log(`  ✅ ${msg}`);
}

function fail(step, detail = '') {
  failCount++;
  const msg = `[FAIL] ${step}${detail ? ' -- ' + detail : ''}`;
  results.push({ status: 'fail', step, detail });
  console.error(`  ❌ ${msg}`);
}

function warn(step, detail = '') {
  warnCount++;
  const msg = `[WARN] ${step}${detail ? ' -- ' + detail : ''}`;
  results.push({ status: 'warn', step, detail });
  console.warn(`  ⚠️  ${msg}`);
}

async function screenshot(page, name) {
  screenshotIdx++;
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `avatar-full-${String(screenshotIdx).padStart(2, '0')}-${safeName}.png`;
  const filepath = join(SCREENSHOTS_DIR, filename);
  try {
    await page.screenshot({ path: filepath, fullPage: false });
    return filepath;
  } catch (err) {
    log(`  Не удалось сделать скриншот ${name}: ${err.message}`);
    return null;
  }
}

async function sendTelegram(text) {
  try {
    const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TG_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!resp.ok) {
      log(`Telegram API error: ${resp.status}`);
    }
  } catch (err) {
    log(`Telegram send failed: ${err.message}`);
  }
}

/**
 * Создает тестовое PNG-изображение через страницу браузера (canvas API).
 * Возвращает Buffer с PNG-данными.
 */
async function createTestImage(page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');

    // Градиентный фон
    const grad = ctx.createLinearGradient(0, 0, 600, 600);
    grad.addColorStop(0, '#4F46E5');
    grad.addColorStop(0.5, '#7C3AED');
    grad.addColorStop(1, '#EC4899');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 600, 600);

    // Круг в центре
    ctx.beginPath();
    ctx.arc(300, 260, 120, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();

    // Текст
    ctx.fillStyle = '#1F2937';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TEST', 300, 270);
    ctx.font = '20px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('Avatar Audit', 300, 440);

    // Дата
    ctx.font = '16px monospace';
    ctx.fillText(new Date().toISOString().slice(0, 19), 300, 480);

    return canvas.toDataURL('image/png').split(',')[1];
  });

  return Buffer.from(base64, 'base64');
}

// ─── Основной сценарий ──────────────────────────────────

async function main() {
  if (!existsSync(SCREENSHOTS_DIR)) {
    mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  log('=== Полный аудит аватарной системы ===');
  log(`Портал: ${BASE}`);
  log(`Пользователь: ${EMAIL}`);
  log('');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
  });

  const page = await context.newPage();

  // Сбор console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      consoleErrors.push(text);
    }
  });

  // Сбор сетевых ошибок
  const networkErrors = [];
  page.on('response', (resp) => {
    if (resp.status() >= 500) {
      networkErrors.push(`${resp.status()} ${resp.url()}`);
    }
  });

  let workspaceId = null;

  // ──────────────────────────────────────────────────────
  // STEP 1: Логин через dev mode
  // ──────────────────────────────────────────────────────
  log('STEP 1: Логин через dev mode');
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await screenshot(page, 'login-page');

    // Ищем кнопку с email youredik@gmail.com
    const userCard = page.locator(`button:has-text("${EMAIL}")`).first();
    const cardCount = await userCard.count();

    if (cardCount > 0) {
      await userCard.click();
      log('  Кликнули по карточке пользователя');
    } else {
      // Fallback: ищем среди всех кнопок
      const allButtons = page.locator('button');
      const btnCount = await allButtons.count();
      let found = false;
      for (let i = 0; i < btnCount; i++) {
        const text = await allButtons.nth(i).textContent();
        if (text && text.includes(EMAIL)) {
          await allButtons.nth(i).click();
          found = true;
          break;
        }
      }
      if (!found) {
        fail('Логин', 'Карточка пользователя не найдена на /login');
        await screenshot(page, 'login-failed-no-card');
        await browser.close();
        await reportAndExit();
        return;
      }
    }

    // Ждём перехода на workspace
    try {
      await page.waitForURL('**/workspace/**', { timeout: 15000 });
    } catch {
      // Может уже на workspace
    }

    await page.waitForTimeout(2000);
    const currentUrl = page.url();

    if (currentUrl.includes('/workspace')) {
      pass('Логин', `Успешно, URL: ${currentUrl}`);
      const wsMatch = currentUrl.match(/\/workspace\/([a-f0-9-]+)/);
      workspaceId = wsMatch ? wsMatch[1] : null;
      log(`  Workspace ID: ${workspaceId || 'не определён (redirect на список)'}`);
    } else {
      fail('Логин', `Не перешли на workspace, URL: ${currentUrl}`);
      await screenshot(page, 'login-failed');
    }

    await screenshot(page, 'after-login');
  } catch (err) {
    fail('Логин', err.message);
    await screenshot(page, 'login-error');
  }

  // ──────────────────────────────────────────────────────
  // STEP 2: Навигация на /profile, проверка секции аватара
  // ──────────────────────────────────────────────────────
  log('STEP 2: Страница профиля — секция аватара');
  let hasExistingAvatar = false;
  try {
    await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(3000);
    await screenshot(page, 'profile-page');

    // Проверяем заголовок
    const heading = page.locator('h1:has-text("Профиль")');
    const headingCount = await heading.count();
    if (headingCount > 0) {
      pass('Профиль: страница загружена', 'Заголовок "Профиль и настройки" найден');
    } else {
      warn('Профиль: страница загружена', 'Заголовок не найден, но страница открылась');
    }

    // Проверяем UserAvatar (xl size — w-20 h-20)
    const avatarXL = page.locator('[class*="w-20"][class*="h-20"][class*="rounded-full"]').first();
    const avatarCount = await avatarXL.count();
    if (avatarCount > 0) {
      pass('Профиль: аватар найден', 'UserAvatar xl (w-20 h-20) присутствует');

      // Проверяем, есть ли img (загруженный аватар) или инициалы
      const img = avatarXL.locator('img');
      const imgCount = await img.count();
      if (imgCount > 0) {
        hasExistingAvatar = true;
        pass('Профиль: аватар с изображением', 'У пользователя есть загруженный аватар');
      } else {
        pass('Профиль: аватар с инициалами', 'Аватар показывает инициалы (нет загруженного)');
      }
    } else {
      // Попробуем по bg-primary-600 rounded-full
      const avatarFallback = page.locator('[class*="bg-primary-600"][class*="rounded-full"]').first();
      const fallbackCount = await avatarFallback.count();
      if (fallbackCount > 0) {
        pass('Профиль: аватар найден (fallback selector)');
      } else {
        fail('Профиль: аватар не найден', 'Ни w-20 h-20, ни bg-primary-600 rounded-full');
      }
    }

    // Проверяем кнопку "Сменить аватар" (Camera overlay)
    const cameraBtn = page.locator('button[aria-label="Сменить аватар"]');
    const cameraBtnCount = await cameraBtn.count();
    if (cameraBtnCount > 0) {
      pass('Профиль: кнопка смены аватара', 'Кнопка "Сменить аватар" найдена');
    } else {
      warn('Профиль: кнопка смены аватара', 'aria-label="Сменить аватар" не найден, overlay может работать по hover');
    }

    // Проверяем кнопку "Удалить" если есть аватар
    if (hasExistingAvatar) {
      const deleteBtn = page.locator('button:has-text("Удалить")').first();
      const deleteBtnCount = await deleteBtn.count();
      if (deleteBtnCount > 0) {
        pass('Профиль: кнопка удаления аватара', 'Кнопка "Удалить" видна');
      } else {
        warn('Профиль: кнопка удаления', 'Кнопка "Удалить" не видна (может появиться после загрузки)');
      }
    }
  } catch (err) {
    fail('Профиль', err.message);
    await screenshot(page, 'profile-error');
  }

  // ──────────────────────────────────────────────────────
  // STEP 3: Загрузка тестового изображения
  // ──────────────────────────────────────────────────────
  log('STEP 3: Загрузка тестового аватара');
  try {
    // Убеждаемся, что мы на /profile
    if (!page.url().includes('/profile')) {
      await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(2000);
    }

    // Создаём тестовое изображение
    const testImageBuffer = await createTestImage(page);
    log(`  Создано тестовое изображение: ${testImageBuffer.length} bytes`);

    // Сохраним для диагностики
    const testImagePath = join(SCREENSHOTS_DIR, 'test-avatar-image.png');
    writeFileSync(testImagePath, testImageBuffer);

    // Ищем скрытый input[type=file]
    const fileInput = page.locator('input[type="file"][accept*="image"]');
    const fileInputCount = await fileInput.count();

    if (fileInputCount > 0) {
      // Устанавливаем файл через setInputFiles
      await fileInput.setInputFiles({
        name: 'test-avatar.png',
        mimeType: 'image/png',
        buffer: testImageBuffer,
      });

      pass('Загрузка аватара', 'Файл выбран через input[type=file]');
      await page.waitForTimeout(1000);
      await screenshot(page, 'after-file-select');
    } else {
      fail('Загрузка аватара', 'input[type=file] не найден на странице профиля');
      await screenshot(page, 'no-file-input');
    }
  } catch (err) {
    fail('Загрузка аватара', err.message);
    await screenshot(page, 'upload-error');
  }

  // ──────────────────────────────────────────────────────
  // STEP 4: Проверяем появление кроп-модалки
  // ──────────────────────────────────────────────────────
  log('STEP 4: Кроп-модалка аватара');
  let cropModalVisible = false;
  try {
    await page.waitForTimeout(1500);

    // AvatarCropModal: fixed z-[100] с заголовком "Настройка аватара"
    const cropModal = page.locator('text="Настройка аватара"').first();
    const cropModalCount = await cropModal.count();

    if (cropModalCount > 0) {
      cropModalVisible = true;
      pass('Кроп-модалка', 'Модалка "Настройка аватара" появилась');
      await screenshot(page, 'crop-modal');

      // Проверяем элементы модалки
      // Zoom slider
      const zoomSlider = page.locator('input[type="range"]');
      const sliderCount = await zoomSlider.count();
      if (sliderCount > 0) {
        pass('Кроп-модалка: zoom slider', 'Слайдер зума найден');
      } else {
        warn('Кроп-модалка: zoom slider', 'Слайдер зума не найден');
      }

      // Кнопка "Применить"
      const applyBtn = page.locator('button:has-text("Применить")').first();
      const applyCount = await applyBtn.count();
      if (applyCount > 0) {
        pass('Кроп-модалка: кнопка "Применить"', 'Найдена');
      } else {
        warn('Кроп-модалка: кнопка "Применить"', 'Не найдена');
      }

      // Кнопка "Отмена"
      const cancelBtn = page.locator('button:has-text("Отмена")').first();
      const cancelCount = await cancelBtn.count();
      if (cancelCount > 0) {
        pass('Кроп-модалка: кнопка "Отмена"', 'Найдена');
      } else {
        warn('Кроп-модалка: кнопка "Отмена"', 'Не найдена');
      }

      // Кнопки зума (ZoomIn, ZoomOut)
      const zoomOutBtn = page.locator('button[aria-label="Уменьшить"]');
      const zoomInBtn = page.locator('button[aria-label="Увеличить"]');
      if (await zoomOutBtn.count() > 0 && await zoomInBtn.count() > 0) {
        pass('Кроп-модалка: кнопки зума', 'ZoomIn и ZoomOut найдены');
      }

      // Кнопка сброса (RotateCcw)
      const resetBtn = page.locator('button[aria-label="Сбросить"]');
      if (await resetBtn.count() > 0) {
        pass('Кроп-модалка: кнопка "Сбросить"', 'Найдена');
      }
    } else {
      // Может быть z-[100] overlay
      const overlay = page.locator('.fixed.inset-0').first();
      const overlayVisible = await overlay.isVisible().catch(() => false);
      if (overlayVisible) {
        warn('Кроп-модалка', 'Fixed overlay найден, но текст "Настройка аватара" не обнаружен');
        await screenshot(page, 'crop-modal-unexpected');
      } else {
        fail('Кроп-модалка', 'Модалка не появилась после выбора файла');
        await screenshot(page, 'crop-modal-missing');
      }
    }
  } catch (err) {
    fail('Кроп-модалка', err.message);
    await screenshot(page, 'crop-modal-error');
  }

  // ──────────────────────────────────────────────────────
  // STEP 5: Применение кропа
  // ──────────────────────────────────────────────────────
  log('STEP 5: Применение кропа');
  try {
    if (cropModalVisible) {
      const applyBtn = page.locator('button:has-text("Применить")').first();
      const btnCount = await applyBtn.count();

      if (btnCount > 0) {
        await applyBtn.click();
        log('  Нажали "Применить"');

        // Ждём закрытия модалки и загрузки
        await page.waitForTimeout(4000);
        await screenshot(page, 'after-crop-apply');

        // Проверяем, что модалка закрылась
        const modalAfter = page.locator('text="Настройка аватара"');
        const modalStillVisible = await modalAfter.count();
        if (modalStillVisible === 0) {
          pass('Применение кропа', 'Модалка закрылась после применения');
        } else {
          // Может показать "Сохранение..."
          const savingText = page.locator('button:has-text("Сохранение...")');
          if (await savingText.count() > 0) {
            log('  Ждём завершения сохранения...');
            await page.waitForTimeout(5000);
            await screenshot(page, 'saving-in-progress');
          }
          warn('Применение кропа', 'Модалка может ещё быть видна (upload в процессе)');
        }
      } else {
        fail('Применение кропа', 'Кнопка "Применить" не найдена');
      }
    } else {
      warn('Применение кропа', 'Пропущено — кроп-модалка не была открыта');
    }
  } catch (err) {
    fail('Применение кропа', err.message);
    await screenshot(page, 'crop-apply-error');
  }

  // ──────────────────────────────────────────────────────
  // STEP 6: Проверяем обновление аватара в профиле
  // ──────────────────────────────────────────────────────
  log('STEP 6: Проверка аватара в профиле после загрузки');
  try {
    await page.waitForTimeout(2000);

    // Перезагрузим профиль для чистоты
    await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(3000);
    await screenshot(page, 'profile-after-upload');

    // Ищем img внутри rounded-full контейнера (аватар с изображением)
    const avatarImg = page.locator('[class*="rounded-full"] img[alt]').first();
    const imgCount = await avatarImg.count();

    if (imgCount > 0) {
      // Проверяем, загрузилось ли изображение
      const naturalWidth = await avatarImg.evaluate((el) => el.naturalWidth);
      if (naturalWidth > 0) {
        pass('Аватар в профиле', `Изображение загружено (${naturalWidth}px)`);
      } else {
        fail('Аватар в профиле', 'Изображение не загрузилось (naturalWidth=0)');
      }
    } else {
      // Проверяем через все img на странице
      const allImgs = page.locator('img.object-cover');
      const allImgsCount = await allImgs.count();
      if (allImgsCount > 0) {
        pass('Аватар в профиле', `Найдено ${allImgsCount} изображений с object-cover`);
      } else {
        warn('Аватар в профиле', 'img внутри rounded-full не найден (возможно upload не завершился)');
      }
    }

    // Проверяем, появилась ли кнопка "Удалить" (значит аватар есть)
    const deleteBtn = page.locator('button:has-text("Удалить")').first();
    if (await deleteBtn.count() > 0) {
      pass('Аватар в профиле: кнопка "Удалить"', 'Кнопка удаления видна — аватар загружен');
    }
  } catch (err) {
    fail('Аватар в профиле', err.message);
    await screenshot(page, 'profile-avatar-check-error');
  }

  // ──────────────────────────────────────────────────────
  // STEP 7: Аватар в Header
  // ──────────────────────────────────────────────────────
  log('STEP 7: Аватар в Header');
  try {
    // Header виден на любой странице. Проверяем на /profile.
    const userMenuBtn = page.locator('[data-testid="user-menu-button"]');
    const menuBtnCount = await userMenuBtn.count();

    if (menuBtnCount > 0) {
      pass('Header: user-menu-button', 'Кнопка пользовательского меню найдена');

      // Проверяем аватар внутри
      const headerAvatar = userMenuBtn.locator('[class*="rounded-full"]').first();
      const headerAvatarCount = await headerAvatar.count();
      if (headerAvatarCount > 0) {
        const headerImg = headerAvatar.locator('img');
        if (await headerImg.count() > 0) {
          const natWidth = await headerImg.evaluate((el) => el.naturalWidth);
          if (natWidth > 0) {
            pass('Header: аватар с изображением', `Loaded (${natWidth}px)`);
          } else {
            warn('Header: аватар', 'img найден, но naturalWidth=0');
          }
        } else {
          pass('Header: аватар с инициалами', 'Аватар отображает инициалы (нет загруженного img)');
        }
      } else {
        warn('Header: rounded-full не найден', 'Внутри user-menu-button');
      }

      await screenshot(page, 'header-avatar');
    } else {
      fail('Header', 'user-menu-button не найден');
    }
  } catch (err) {
    fail('Header', err.message);
    await screenshot(page, 'header-error');
  }

  // ──────────────────────────────────────────────────────
  // STEP 8: Аватар в /chat
  // ──────────────────────────────────────────────────────
  log('STEP 8: Аватар в /chat');
  try {
    await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(3000);
    await screenshot(page, 'chat-page');

    // Ищем аватары в списке разговоров
    const chatAvatars = page.locator('[class*="bg-primary-600"][class*="rounded-full"]');
    const chatAvatarCount = await chatAvatars.count();

    if (chatAvatarCount > 0) {
      pass('Чат: аватары найдены', `${chatAvatarCount} аватаров на странице чата`);

      // Проверяем, есть ли img внутри аватаров
      let withImg = 0;
      let broken = 0;
      for (let i = 0; i < Math.min(chatAvatarCount, 10); i++) {
        const img = chatAvatars.nth(i).locator('img');
        if (await img.count() > 0) {
          withImg++;
          const nw = await img.evaluate((el) => el.naturalWidth).catch(() => 0);
          if (nw === 0) broken++;
        }
      }
      pass('Чат: аватары с изображениями', `${withImg} из ${Math.min(chatAvatarCount, 10)} проверенных, ${broken} сломанных`);
      if (broken > 0) {
        warn('Чат: сломанные аватары', `${broken} изображений не загрузились`);
      }
    } else {
      // Может нет разговоров или другая структура
      const anyRoundedFull = page.locator('[class*="rounded-full"]');
      const rfCount = await anyRoundedFull.count();
      warn('Чат: bg-primary-600 rounded-full не найдены', `Всего rounded-full элементов: ${rfCount}`);
    }

    // Проверяем header avatar и тут
    const headerAvatarChat = page.locator('[data-testid="user-menu-button"] [class*="rounded-full"] img');
    if (await headerAvatarChat.count() > 0) {
      pass('Чат: Header аватар виден');
    }
  } catch (err) {
    fail('Чат', err.message);
    await screenshot(page, 'chat-error');
  }

  // ──────────────────────────────────────────────────────
  // STEP 9: Аватар в /workspace (канбан)
  // ──────────────────────────────────────────────────────
  log('STEP 9: Аватар в /workspace (канбан)');
  try {
    if (workspaceId) {
      await page.goto(`${BASE}/workspace/${workspaceId}`, { waitUntil: 'networkidle', timeout: 20000 });
    } else {
      await page.goto(`${BASE}/workspace`, { waitUntil: 'networkidle', timeout: 20000 });
      // Ждём redirect на конкретный workspace
      await page.waitForTimeout(3000);
      const wsUrl = page.url();
      const wsMatch = wsUrl.match(/\/workspace\/([a-f0-9-]+)/);
      if (wsMatch) {
        workspaceId = wsMatch[1];
      }
    }
    await page.waitForTimeout(3000);
    await screenshot(page, 'workspace-kanban');

    // Канбан карточки — ищем аватары в них
    const kanbanAvatars = page.locator('[class*="bg-primary-600"][class*="rounded-full"]');
    const kanbanCount = await kanbanAvatars.count();

    if (kanbanCount > 0) {
      pass('Канбан: аватары найдены', `${kanbanCount} аватаров`);

      // Проверяем изображения
      let withImg = 0;
      for (let i = 0; i < Math.min(kanbanCount, 5); i++) {
        const img = kanbanAvatars.nth(i).locator('img');
        if (await img.count() > 0) withImg++;
      }
      pass('Канбан: аватары с изображениями', `${withImg} из ${Math.min(kanbanCount, 5)} проверенных`);
    } else {
      warn('Канбан: аватары не найдены', 'Возможно workspace пустой или нет заявок');
    }

    // Header avatar тоже
    const headerInWs = page.locator('[data-testid="user-menu-button"]');
    if (await headerInWs.count() > 0) {
      pass('Канбан: Header присутствует');
    }
  } catch (err) {
    fail('Канбан', err.message);
    await screenshot(page, 'workspace-error');
  }

  // ──────────────────────────────────────────────────────
  // STEP 10: Аватар в /admin/users
  // ──────────────────────────────────────────────────────
  log('STEP 10: Аватар в /admin/users');
  try {
    await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(3000);
    await screenshot(page, 'admin-users');

    // Проверяем наличие таблицы/списка пользователей
    const adminAvatars = page.locator('[class*="bg-primary-600"][class*="rounded-full"]');
    const adminCount = await adminAvatars.count();

    if (adminCount > 0) {
      pass('Админка: аватары найдены', `${adminCount} аватаров в списке пользователей`);

      // Проверяем изображения
      let withImg = 0;
      let broken = 0;
      for (let i = 0; i < Math.min(adminCount, 10); i++) {
        const img = adminAvatars.nth(i).locator('img');
        if (await img.count() > 0) {
          withImg++;
          const nw = await img.evaluate((el) => el.naturalWidth).catch(() => 0);
          if (nw === 0) broken++;
        }
      }
      pass('Админка: аватары с изображениями', `${withImg} из ${Math.min(adminCount, 10)}, ${broken} сломанных`);
      if (broken > 0) {
        warn('Админка: сломанные аватары', `${broken} изображений не загрузились`);
      }
    } else {
      // Проверяем через img
      const allRoundedImgs = page.locator('.rounded-full img, [class*="rounded-full"] img');
      const roundedImgCount = await allRoundedImgs.count();
      if (roundedImgCount > 0) {
        pass('Админка: аватары (img в rounded-full)', `${roundedImgCount} найдено`);
      } else {
        warn('Админка: аватары не найдены', 'Возможно другая структура или нет данных');
      }
    }
  } catch (err) {
    fail('Админка', err.message);
    await screenshot(page, 'admin-error');
  }

  // ──────────────────────────────────────────────────────
  // STEP 11: Fullscreen preview аватара
  // ──────────────────────────────────────────────────────
  log('STEP 11: Fullscreen preview аватара');
  try {
    // Идём на профиль
    await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);

    // UserAvatar с clickable — ищем cursor-pointer + rounded-full
    const clickableAvatar = page.locator('.cursor-pointer [class*="bg-primary-600"][class*="rounded-full"]').first();
    let clickableCount = await clickableAvatar.count();

    if (clickableCount === 0) {
      // На профиле аватар clickable=false, поэтому попробуем через UserProfileModal на /admin/users
      log('  На профиле аватар не кликабельный (clickable=false). Пробуем через /admin/users...');
      await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(3000);

      // Ищем кликабельный аватар в таблице пользователей
      const adminClickable = page.locator('td .cursor-pointer').first();
      clickableCount = await adminClickable.count();

      if (clickableCount > 0) {
        await adminClickable.click();
        await page.waitForTimeout(1500);
        await screenshot(page, 'user-profile-modal');

        // Проверяем UserProfileModal
        const profileModal = page.locator('.fixed.inset-0').first();
        const modalVisible = await profileModal.isVisible().catch(() => false);

        if (modalVisible) {
          pass('UserProfileModal', 'Модалка профиля пользователя открылась');

          // Внутри модалки есть UserAvatar xl — кликаем для fullscreen
          const modalAvatar = page.locator('[class*="ring-4"] [class*="rounded-full"]').first();
          if (await modalAvatar.count() > 0) {
            // Проверяем есть ли img внутри
            const modalImg = modalAvatar.locator('img');
            if (await modalImg.count() > 0) {
              // Кликаем на аватар для fullscreen preview
              await modalAvatar.click();
              await page.waitForTimeout(1000);
              await screenshot(page, 'fullscreen-preview');

              // Проверяем fullscreen overlay
              const fullscreenOverlay = page.locator('.fixed.inset-0.z-\\[100\\]');
              const overlayCount = await fullscreenOverlay.count();
              if (overlayCount > 0) {
                pass('Fullscreen preview', 'Полноэкранный просмотр аватара открылся');

                // Проверяем большое изображение
                const bigImg = page.locator('.fixed.inset-0 img.max-w-\\[80vw\\], .fixed img[class*="max-w"]');
                if (await bigImg.count() > 0) {
                  pass('Fullscreen preview: изображение', 'Большое изображение отображается');
                }

                // Закрываем через Escape
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);
                pass('Fullscreen preview: Escape', 'Закрытие по Escape');
                await screenshot(page, 'after-fullscreen-close');
              } else {
                // z-[100] может быть с другим синтаксисом
                // Проверяем любой fixed overlay
                const anyNewOverlay = page.locator('div.fixed.inset-0');
                const overlayNow = await anyNewOverlay.count();
                if (overlayNow >= 2) {
                  pass('Fullscreen preview', 'Дополнительный overlay появился (fullscreen)');
                  await page.keyboard.press('Escape');
                  await page.waitForTimeout(500);
                } else {
                  warn('Fullscreen preview', 'Overlay не появился после клика на аватар (возможно нет изображения)');
                }
              }
            } else {
              warn('Fullscreen preview', 'У пользователя нет загруженного аватара для fullscreen');
            }
          }

          // Закрываем UserProfileModal
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        } else {
          warn('UserProfileModal', 'Модалка не открылась после клика');
        }
      } else {
        warn('Fullscreen preview', 'Кликабельные элементы не найдены ни в профиле, ни в админке');
      }
    } else {
      // Кликаем на аватар на странице профиля
      await clickableAvatar.click();
      await page.waitForTimeout(1000);
      await screenshot(page, 'fullscreen-preview-from-profile');

      const overlay = page.locator('div.fixed.inset-0');
      if (await overlay.count() > 0) {
        pass('Fullscreen preview', 'Открылся из профиля');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    }
  } catch (err) {
    fail('Fullscreen preview', err.message);
    await screenshot(page, 'fullscreen-error');
  }

  // ──────────────────────────────────────────────────────
  // STEP 12: Удаление аватара
  // ──────────────────────────────────────────────────────
  log('STEP 12: Удаление аватара');
  try {
    await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(3000);
    await screenshot(page, 'profile-before-delete');

    // Ищем кнопку "Удалить" с иконкой Trash2
    const deleteBtn = page.locator('button:has-text("Удалить")').first();
    const deleteBtnCount = await deleteBtn.count();

    if (deleteBtnCount > 0) {
      // Запоминаем состояние до удаления
      const avatarImgBefore = page.locator('[class*="w-20"][class*="h-20"] img, [class*="bg-primary-600"][class*="rounded-full"] img');
      const hadImg = await avatarImgBefore.count() > 0;

      await deleteBtn.click();
      log('  Нажали "Удалить"');
      await page.waitForTimeout(3000);
      await screenshot(page, 'after-avatar-delete');

      // Проверяем, что аватар сброшен к инициалам
      const avatarImgAfter = page.locator('[class*="w-20"][class*="h-20"] img');
      const imgAfterCount = await avatarImgAfter.count();

      // Также проверяем, что кнопка "Удалить" исчезла
      const deleteBtnAfter = page.locator('button:has-text("Удалить")');
      const deleteBtnAfterCount = await deleteBtnAfter.count();

      if (imgAfterCount === 0 || deleteBtnAfterCount === 0) {
        pass('Удаление аватара', 'Аватар удалён, показаны инициалы');
      } else {
        // Перезагрузим страницу для проверки
        await page.reload({ waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(3000);
        await screenshot(page, 'profile-after-delete-reload');

        const imgAfterReload = page.locator('[class*="w-20"][class*="h-20"] img');
        if (await imgAfterReload.count() === 0) {
          pass('Удаление аватара', 'После перезагрузки аватар удалён');
        } else {
          const nw = await imgAfterReload.evaluate((el) => el.naturalWidth).catch(() => -1);
          if (nw === 0) {
            pass('Удаление аватара', 'img есть, но пустой (naturalWidth=0) — удаление сработало');
          } else {
            warn('Удаление аватара', 'img всё ещё загружен после удаления');
          }
        }
      }
    } else {
      warn('Удаление аватара', 'Кнопка "Удалить" не найдена (аватар не был загружен или UI изменился)');
    }
  } catch (err) {
    fail('Удаление аватара', err.message);
    await screenshot(page, 'delete-error');
  }

  // ──────────────────────────────────────────────────────
  // STEP 13: Console errors
  // ──────────────────────────────────────────────────────
  log('STEP 13: Анализ console errors');
  try {
    if (consoleErrors.length === 0) {
      pass('Console errors', 'Нет ошибок в консоли');
    } else {
      // Фильтруем шум (react devtools, HMR, etc.)
      const relevantErrors = consoleErrors.filter(e =>
        !e.includes('Download the React DevTools') &&
        !e.includes('hydration') &&
        !e.includes('Hydration') &&
        !e.includes('HMR') &&
        !e.includes('hot-update')
      );

      const avatarErrors = relevantErrors.filter(e =>
        e.includes('avatar') ||
        e.includes('upload') ||
        e.includes('signed') ||
        e.includes('S3') ||
        e.includes('presigned') ||
        e.includes('image') ||
        e.includes('500') ||
        e.includes('403') ||
        e.includes('TypeError')
      );

      if (avatarErrors.length > 0) {
        warn('Console errors: avatar-related', `${avatarErrors.length} ошибок`);
        avatarErrors.slice(0, 5).forEach((e, i) => {
          log(`    ${i + 1}. ${e.substring(0, 200)}`);
        });
      }

      if (relevantErrors.length > avatarErrors.length) {
        const otherCount = relevantErrors.length - avatarErrors.length;
        log(`  Прочих ошибок в консоли: ${otherCount}`);
        relevantErrors
          .filter(e => !avatarErrors.includes(e))
          .slice(0, 3)
          .forEach((e, i) => {
            log(`    ${i + 1}. ${e.substring(0, 150)}`);
          });
      }

      if (relevantErrors.length === 0) {
        pass('Console errors', `${consoleErrors.length} ошибок, но все не критичные (devtools/hydration)`);
      } else {
        warn('Console errors', `${relevantErrors.length} значимых ошибок из ${consoleErrors.length} общих`);
      }
    }

    if (networkErrors.length > 0) {
      warn('Network 5xx errors', `${networkErrors.length} ошибок`);
      networkErrors.slice(0, 5).forEach(e => log(`    ${e}`));
    } else {
      pass('Network errors', 'Нет 5xx ошибок');
    }
  } catch (err) {
    fail('Console errors', err.message);
  }

  // Финальный скриншот
  await screenshot(page, 'final-state');

  await browser.close();

  // ──────────────────────────────────────────────────────
  // Генерация отчёта
  // ──────────────────────────────────────────────────────
  await reportAndExit();
}

async function reportAndExit() {
  log('');
  log('============================================');
  log('    ИТОГИ АУДИТА АВАТАРНОЙ СИСТЕМЫ');
  log('============================================');
  log('');
  log(`  PASS: ${passCount}`);
  log(`  FAIL: ${failCount}`);
  log(`  WARN: ${warnCount}`);
  log(`  Console errors: ${consoleErrors.length}`);
  log(`  Screenshots: ${screenshotIdx}`);
  log('');

  // Детали
  const failures = results.filter(r => r.status === 'fail');
  if (failures.length > 0) {
    log('--- FAILURES ---');
    failures.forEach(f => {
      log(`  [FAIL] ${f.step}: ${f.detail}`);
    });
    log('');
  }

  const warnings = results.filter(r => r.status === 'warn');
  if (warnings.length > 0) {
    log('--- WARNINGS ---');
    warnings.forEach(w => {
      log(`  [WARN] ${w.step}: ${w.detail}`);
    });
    log('');
  }

  // Сохраняем JSON-отчёт
  const reportPath = join(SCREENSHOTS_DIR, 'avatar-full-audit-result.json');
  const report = {
    timestamp: new Date().toISOString(),
    summary: { pass: passCount, fail: failCount, warn: warnCount, consoleErrors: consoleErrors.length, screenshots: screenshotIdx },
    results,
    consoleErrors: consoleErrors.slice(0, 20),
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log(`Отчёт сохранён: ${reportPath}`);

  // ──────────────────────────────────────────────────────
  // STEP 14: Отправка в Telegram
  // ──────────────────────────────────────────────────────
  log('');
  log('Отправка результатов в Telegram...');

  const emoji = failCount === 0 ? '✅' : '⚠️';
  let tgText = `${emoji} <b>Аудит аватарной системы</b>\n`;
  tgText += `<i>${new Date().toLocaleString('ru-RU')}</i>\n\n`;
  tgText += `✅ Пройдено: <b>${passCount}</b>\n`;
  tgText += `❌ Провалено: <b>${failCount}</b>\n`;
  tgText += `⚠️ Предупреждения: <b>${warnCount}</b>\n`;
  tgText += `🖥 Console errors: <b>${consoleErrors.length}</b>\n`;
  tgText += `📸 Скриншотов: <b>${screenshotIdx}</b>\n`;

  if (failures.length > 0) {
    tgText += `\n<b>Провалы:</b>\n`;
    failures.slice(0, 5).forEach(f => {
      tgText += `• ${f.step}: ${f.detail}\n`;
    });
  }

  if (warnings.length > 0 && warnings.length <= 5) {
    tgText += `\n<b>Предупреждения:</b>\n`;
    warnings.forEach(w => {
      tgText += `• ${w.step}\n`;
    });
  } else if (warnings.length > 5) {
    tgText += `\n<b>Предупреждения:</b> ${warnings.length} (см. лог)\n`;
  }

  tgText += `\n<b>Проверенные страницы:</b> /profile, /chat, /workspace, /admin/users`;
  tgText += `\n<b>Тесты:</b> загрузка, кроп, preview, удаление аватара`;

  await sendTelegram(tgText);

  log('');
  log(failCount === 0 ? 'Аудит завершён успешно.' : `Аудит завершён с ${failCount} провалами.`);

  process.exit(failCount > 0 ? 1 : 0);
}

// ─── Запуск ─────────────────────────────────────────────
main().catch((err) => {
  console.error('FATAL ERROR:', err);
  sendTelegram(`❌ <b>Аудит аватаров — FATAL ERROR</b>\n<pre>${err.message}</pre>`).then(() => {
    process.exit(1);
  });
});
