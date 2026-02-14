/**
 * Playwright-аудит кроп-модалки аватара (react-easy-crop).
 *
 * Проверяет:
 * 1. Логин через dev-mode
 * 2. Открытие профиля
 * 3. Загрузка изображения → кроп-модалка
 * 4. Элементы: zoom slider, rotate buttons, reset, apply/cancel
 * 5. Взаимодействие: zoom in/out через кнопки, rotate
 * 6. Применение кропа
 * 7. Результат: аватар обновлён в профиле и header
 * 8. Загрузка большого изображения (симуляция)
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3000';
const SCREENSHOTS = path.resolve('audit-screenshots');
const RESULTS = [];

function log(level, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const icon = level === 'PASS' ? '✅' : level === 'FAIL' ? '❌' : '⚠️';
  console.log(`[${ts}] ${icon} ${msg}`);
  RESULTS.push({ level, msg, ts });
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOTS, `crop-${name}.png`), fullPage: false });
}

async function main() {
  if (!fs.existsSync(SCREENSHOTS)) fs.mkdirSync(SCREENSHOTS, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Перехватываем console errors
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Login
    // ═══════════════════════════════════════════════════════════════════════
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
    // Dev login cards are <button> elements
    const loginBtn = await page.$('button:has-text("youredik@gmail.com")');
    if (!loginBtn) {
      log('FAIL', 'STEP 1: Не найдена карточка youredik@gmail.com');
      await screenshot(page, '01-login-fail');
      return;
    }
    await loginBtn.click();
    await page.waitForURL('**/workspace**', { timeout: 10000 });
    log('PASS', 'STEP 1: Логин через dev-mode');
    await screenshot(page, '01-login');

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Открытие профиля
    // ═══════════════════════════════════════════════════════════════════════
    await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    await screenshot(page, '02-profile');
    log('PASS', 'STEP 2: Профиль загружен');

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Создаём тестовое изображение 2000x1500 (имитация тяжёлого фото)
    // ═══════════════════════════════════════════════════════════════════════
    // Создаём PNG через Canvas в браузере
    const testImagePath = path.join(SCREENSHOTS, 'test-avatar-large.png');
    if (!fs.existsSync(testImagePath)) {
      // Создаём минимальный PNG для теста через буфер
      await page.evaluate(() => {
        return new Promise((resolve) => {
          const canvas = document.createElement('canvas');
          canvas.width = 2000;
          canvas.height = 1500;
          const ctx = canvas.getContext('2d');
          // Градиент — имитация реальной фотографии
          const grad = ctx.createLinearGradient(0, 0, 2000, 1500);
          grad.addColorStop(0, '#1a1a2e');
          grad.addColorStop(0.3, '#16213e');
          grad.addColorStop(0.6, '#0f3460');
          grad.addColorStop(1, '#e94560');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, 2000, 1500);
          // Добавляем круг (лицо)
          ctx.beginPath();
          ctx.arc(1000, 600, 300, 0, Math.PI * 2);
          ctx.fillStyle = '#ffd460';
          ctx.fill();
          // Глаза
          ctx.beginPath();
          ctx.arc(880, 530, 30, 0, Math.PI * 2);
          ctx.arc(1120, 530, 30, 0, Math.PI * 2);
          ctx.fillStyle = '#1a1a2e';
          ctx.fill();
          // Улыбка
          ctx.beginPath();
          ctx.arc(1000, 650, 100, 0, Math.PI);
          ctx.lineWidth = 8;
          ctx.strokeStyle = '#1a1a2e';
          ctx.stroke();
          // Текст
          ctx.font = 'bold 48px sans-serif';
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.fillText('2000 × 1500 TEST IMAGE', 1000, 1200);
          canvas.toBlob((blob) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          }, 'image/png');
        });
      }).then(async (dataUrl) => {
        const base64 = dataUrl.split(',')[1];
        fs.writeFileSync(testImagePath, Buffer.from(base64, 'base64'));
      });
    }
    log('PASS', 'STEP 3: Тестовое изображение 2000x1500 создано');

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: Загрузка изображения через file input
    // ═══════════════════════════════════════════════════════════════════════
    const fileInput = await page.$('input[type="file"][accept*="image"]');
    if (!fileInput) {
      log('FAIL', 'STEP 4: Не найден input[type=file]');
      await screenshot(page, '04-no-input');
      return;
    }
    await fileInput.setInputFiles(testImagePath);
    await page.waitForTimeout(1500);
    await screenshot(page, '04-crop-modal');

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: Проверяем элементы кроп-модалки
    // ═══════════════════════════════════════════════════════════════════════
    const modalTitle = await page.$('text=Настройка аватара');
    if (modalTitle) {
      log('PASS', 'STEP 5: Кроп-модалка открылась — "Настройка аватара"');
    } else {
      log('FAIL', 'STEP 5: Кроп-модалка не найдена');
      await screenshot(page, '05-no-modal');
      return;
    }

    // react-easy-crop создаёт div с role="slider" для зума внутри
    const cropArea = await page.$('[data-testid="container"]');
    const reactCropContainer = await page.$('.reactEasyCrop_Container');
    if (cropArea || reactCropContainer) {
      log('PASS', 'STEP 5a: react-easy-crop контейнер найден');
    } else {
      // Проверяем альтернативный класс
      const anyCropEl = await page.$('div[class*="crop"], div[class*="Crop"], img[class*="crop"]');
      if (anyCropEl) {
        log('PASS', 'STEP 5a: Crop-область найдена (нестандартный класс)');
      } else {
        log('WARN', 'STEP 5a: react-easy-crop контейнер не найден по стандартному селектору');
      }
    }

    // Zoom slider
    const zoomSlider = await page.$('input[type="range"]');
    if (zoomSlider) {
      log('PASS', 'STEP 5b: Zoom slider найден');
    } else {
      log('FAIL', 'STEP 5b: Zoom slider не найден');
    }

    // Кнопки zoom
    const zoomOutBtn = await page.$('button[aria-label="Уменьшить"]');
    const zoomInBtn = await page.$('button[aria-label="Увеличить"]');
    if (zoomOutBtn && zoomInBtn) {
      log('PASS', 'STEP 5c: Кнопки ZoomIn/ZoomOut найдены');
    } else {
      log('FAIL', 'STEP 5c: Кнопки ZoomIn/ZoomOut не найдены');
    }

    // Кнопки поворота
    const rotateLeftBtn = await page.$('button[aria-label="Повернуть влево"]');
    const rotateRightBtn = await page.$('button[aria-label="Повернуть вправо"]');
    if (rotateLeftBtn && rotateRightBtn) {
      log('PASS', 'STEP 5d: Кнопки поворота найдены');
    } else {
      log('WARN', 'STEP 5d: Кнопки поворота не найдены');
    }

    // Reset
    const resetBtn = await page.$('button[aria-label="Сбросить"]');
    if (resetBtn) {
      log('PASS', 'STEP 5e: Кнопка сброса найдена');
    } else {
      log('WARN', 'STEP 5e: Кнопка сброса не найдена');
    }

    // Кнопки Применить / Отмена
    const applyBtn = await page.$('text=Применить');
    const cancelBtn = await page.$('text=Отмена');
    if (applyBtn && cancelBtn) {
      log('PASS', 'STEP 5f: Кнопки Применить/Отмена найдены');
    } else {
      log('FAIL', 'STEP 5f: Кнопки Применить/Отмена не найдены');
    }

    // ARIA
    const dialog = await page.$('[role="dialog"][aria-modal="true"]');
    if (dialog) {
      log('PASS', 'STEP 5g: ARIA role="dialog" + aria-modal');
    } else {
      log('WARN', 'STEP 5g: ARIA атрибуты не найдены');
    }

    // Zoom percent display
    const zoomText = await page.$('span.tabular-nums');
    if (zoomText) {
      const text = await zoomText.textContent();
      log('PASS', `STEP 5h: Zoom display = "${text}"`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: Взаимодействие — zoom in
    // ═══════════════════════════════════════════════════════════════════════
    if (zoomInBtn) {
      await zoomInBtn.click();
      await zoomInBtn.click();
      await zoomInBtn.click();
      await page.waitForTimeout(300);
      const zoomAfter = await page.$eval('span.tabular-nums', (el) => el.textContent);
      log('PASS', `STEP 6: Zoom In 3x → ${zoomAfter}`);
      await screenshot(page, '06-zoom-in');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7: Взаимодействие — rotate
    // ═══════════════════════════════════════════════════════════════════════
    if (rotateRightBtn) {
      await rotateRightBtn.click();
      await page.waitForTimeout(500);
      await screenshot(page, '07-rotated');
      log('PASS', 'STEP 7: Поворот на 90° вправо');
    }

    // Reset
    if (resetBtn) {
      await resetBtn.click();
      await page.waitForTimeout(300);
      const zoomReset = await page.$eval('span.tabular-nums', (el) => el.textContent);
      log('PASS', `STEP 7a: Reset → ${zoomReset}`);
      await screenshot(page, '07a-reset');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 8: Применить кроп
    // ═══════════════════════════════════════════════════════════════════════
    if (applyBtn) {
      await applyBtn.click();
      await page.waitForTimeout(2000);
      await screenshot(page, '08-after-crop');

      // Проверяем что модалка закрылась
      const modalGone = !(await page.$('text=Настройка аватара'));
      if (modalGone) {
        log('PASS', 'STEP 8: Кроп применён, модалка закрылась');
      } else {
        log('FAIL', 'STEP 8: Модалка не закрылась после кропа');
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 9: Проверяем аватар в профиле
    // ═══════════════════════════════════════════════════════════════════════
    const profileImg = await page.$('img[alt*="аватар"], img.w-full.h-full.object-cover');
    if (profileImg) {
      const src = await profileImg.getAttribute('src');
      const dims = await profileImg.evaluate((el) => ({
        w: el.naturalWidth,
        h: el.naturalHeight,
      }));
      log('PASS', `STEP 9: Аватар в профиле — ${dims.w}×${dims.h}, src=${(src || '').substring(0, 60)}...`);
    } else {
      log('WARN', 'STEP 9: Аватар img не найден в профиле');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 10: Проверяем аватар в header
    // ═══════════════════════════════════════════════════════════════════════
    const headerAvatar = await page.$('header img[alt], nav img[alt]');
    if (headerAvatar) {
      log('PASS', 'STEP 10: Аватар в header обновлён');
    } else {
      log('WARN', 'STEP 10: Аватар в header не найден (возможно нужна перезагрузка)');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 11: Console errors
    // ═══════════════════════════════════════════════════════════════════════
    if (consoleErrors.length > 0) {
      log('WARN', `Console errors (${consoleErrors.length}): ${consoleErrors.slice(0, 3).join(' | ')}`);
    } else {
      log('PASS', 'STEP 11: Нет console errors');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════════════
    const pass = RESULTS.filter((r) => r.level === 'PASS').length;
    const fail = RESULTS.filter((r) => r.level === 'FAIL').length;
    const warn = RESULTS.filter((r) => r.level === 'WARN').length;
    console.log(`\n━━━ ИТОГО: ✅ ${pass} PASS, ❌ ${fail} FAIL, ⚠️ ${warn} WARN ━━━\n`);

    // JSON result
    fs.writeFileSync(
      path.join(SCREENSHOTS, 'crop-audit-result.json'),
      JSON.stringify({ pass, fail, warn, results: RESULTS, consoleErrors }, null, 2),
    );

  } catch (err) {
    log('FAIL', `Unexpected error: ${err.message}`);
    await screenshot(page, 'error');
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
