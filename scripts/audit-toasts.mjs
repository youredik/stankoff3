#!/usr/bin/env node
/**
 * Toast Redesign Audit — проверка нового дизайна тостов
 * Проверяет: позицию (bottom-center), компактность, прогресс-бар,
 * hover-паузу, лимит видимых (max 3), анимацию, dismiss
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3001';
const ADMIN_EMAIL = 'youredik@gmail.com';
const SCREENSHOT_DIR = join(process.cwd(), 'audit-screenshots');

if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

const results = [];
function log(emoji, msg) { console.log(`${emoji} ${msg}`); }
function pass(test) { results.push({ test, status: 'PASS' }); log('✅', test); }
function fail(test, reason) { results.push({ test, status: 'FAIL', reason }); log('❌', `${test}: ${reason}`); }
function warn(test) { results.push({ test, status: 'WARN' }); log('⚠️', test); }

async function loginViaUI(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Dev mode: click the button card containing admin email
  const userBtn = page.locator('button', { hasText: ADMIN_EMAIL });
  const count = await userBtn.count();
  if (count > 0) {
    await userBtn.first().click();
    // Wait for navigation to workspace
    await page.waitForURL('**/workspace**', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);
  } else {
    // Fallback: try any user card
    const anyBtn = page.locator('button').filter({ hasText: '@' });
    if (await anyBtn.count() > 0) {
      await anyBtn.first().click();
      await page.waitForURL('**/workspace**', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1000);
    }
  }
  log('🔐', `Залогинены, URL: ${page.url()}`);
}

/** Wait for __toastStore to be available (toast.ts module must be loaded) */
async function waitForToastStore(page, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const exists = await page.evaluate(() => typeof window.__toastStore !== 'undefined');
    if (exists) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

/** Trigger a toast via __toastStore */
async function triggerToast(page, type, text, duration = 4000) {
  return page.evaluate(({ type, text, duration }) => {
    if (!window.__toastStore) return false;
    window.__toastStore.getState().addToast({ text, type, duration });
    return true;
  }, { type, text, duration });
}

async function main() {
  log('🚀', 'Toast Redesign Audit — начинаем проверку');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    // === LOGIN ===
    await loginViaUI(page);
    pass('Логин выполнен');

    // === Navigate to workspace ===
    const token = await getToken();
    const res = await fetch(`${API_URL}/api/workspaces`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const workspaces = await res.json();
    const ws = workspaces[0];
    log('📂', `Workspace: ${ws.name}`);

    await page.goto(`${BASE_URL}/workspace/${ws.id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // === Wait for toast store ===
    const storeReady = await waitForToastStore(page);
    if (!storeReady) {
      fail('Toast store не найден', 'window.__toastStore недоступен');
      throw new Error('Toast store not available');
    }
    pass('Toast store доступен (window.__toastStore)');

    // ═══════════════════════════════════════
    // TEST 1: Single toast — position & style
    // ═══════════════════════════════════════
    log('🧪', 'Тест 1: Одиночный тост — позиция и стиль');

    await triggerToast(page, 'success', 'Заявка успешно создана');
    await page.waitForTimeout(500);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'toast-single-success.png'), fullPage: false });
    log('📸', 'toast-single-success.png');

    // Find toast container
    const container = await page.$('div.fixed.bottom-6');
    if (container) {
      const cBox = await container.boundingBox();
      if (cBox) {
        const centerX = 1440 / 2;
        const containerCenterX = cBox.x + cBox.width / 2;
        const isCenter = Math.abs(containerCenterX - centerX) < 50;
        const isBottom = cBox.y + cBox.height > 800; // near bottom of 900px viewport

        if (isCenter) pass('Контейнер по центру горизонтально');
        else fail('Контейнер не по центру', `centerX=${Math.round(containerCenterX)}, expected ~${centerX}`);

        if (isBottom) pass('Контейнер внизу экрана');
        else fail('Контейнер не внизу', `bottom=${Math.round(cBox.y + cBox.height)}, viewport=900`);
      }
    } else {
      fail('Контейнер не найден', 'div.fixed.bottom-6 отсутствует');
    }

    // Check toast element
    const toasts = await page.$$('[data-toast]');
    if (toasts.length > 0) {
      const tBox = await toasts[0].boundingBox();
      if (tBox) {
        log('📐', `Размер тоста: ${Math.round(tBox.width)}x${Math.round(tBox.height)}px`);

        if (tBox.width >= 300 && tBox.width <= 400) {
          pass(`Ширина тоста оптимальна: ${Math.round(tBox.width)}px`);
        } else {
          fail('Ширина тоста', `${Math.round(tBox.width)}px — ожидалось 300-400px`);
        }

        if (tBox.height >= 30 && tBox.height <= 70) {
          pass(`Высота тоста компактная: ${Math.round(tBox.height)}px`);
        } else {
          fail('Высота тоста', `${Math.round(tBox.height)}px — ожидалось 30-70px`);
        }
      }

      // Check left accent stripe
      const accent = await toasts[0].$('.absolute.left-0');
      if (accent) {
        const accentBox = await accent.boundingBox();
        if (accentBox && accentBox.width <= 5) {
          pass(`Левая accent-полоса: ${Math.round(accentBox.width)}px`);
        }
      } else {
        warn('Accent-полоса не найдена');
      }

      // Check progress bar
      const progressTrack = await toasts[0].$('div.h-\\[2px\\]');
      if (progressTrack) {
        pass('Прогресс-бар присутствует');
        // Check progress bar is animated (width should be < 100% after 500ms)
        const progressBar = await progressTrack.$('div');
        if (progressBar) {
          const width = await progressBar.evaluate(el => el.style.width);
          const pct = parseFloat(width);
          if (pct < 100 && pct > 0) {
            pass(`Прогресс-бар анимирован: ${width}`);
          }
        }
      } else {
        warn('Прогресс-бар не найден');
      }

      // Check close button (hidden by default, visible on hover)
      const closeBtn = await toasts[0].$('button[aria-label="Закрыть"]');
      if (closeBtn) {
        pass('Кнопка закрытия имеет aria-label');
        const opacity = await closeBtn.evaluate(el => getComputedStyle(el).opacity);
        if (opacity === '0') {
          pass('Кнопка закрытия скрыта по умолчанию');
        }
      }

      // Check animation class
      const hasAnimation = await toasts[0].evaluate(el => el.classList.contains('toast-enter'));
      if (hasAnimation) pass('Анимация входа (toast-enter) применена');

    } else {
      fail('Тост не найден', 'role="alert" не обнаружен после triggerToast');
    }

    // Wait for toast to auto-dismiss
    await page.waitForTimeout(4000);
    const toastsAfter = await page.$$('[data-toast]');
    if (toastsAfter.length === 0) {
      pass('Тост автоматически скрыт через ~4 сек');
    }

    // ═══════════════════════════════════════
    // TEST 2: Multiple toasts — stacking & limit
    // ═══════════════════════════════════════
    log('🧪', 'Тест 2: Множественные тосты — стекинг и лимит');

    // Trigger 5 toasts rapidly
    await triggerToast(page, 'error', 'Ошибка сохранения данных', 8000);
    await page.waitForTimeout(200);
    await triggerToast(page, 'warning', 'Срок SLA скоро истечёт', 8000);
    await page.waitForTimeout(200);
    await triggerToast(page, 'success', 'Задача выполнена', 8000);
    await page.waitForTimeout(200);
    await triggerToast(page, 'info', 'Новое обновление доступно', 8000);
    await page.waitForTimeout(200);
    await triggerToast(page, 'error', 'Нет подключения к серверу', 8000);
    await page.waitForTimeout(500);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'toast-stacking.png'), fullPage: false });
    log('📸', 'toast-stacking.png');

    // Check store count (should be capped at 3 by store-level limit)
    const storeCount = await page.evaluate(() => window.__toastStore.getState().toasts.length);
    log('📊', `Тостов в store: ${storeCount} (из 5 отправленных)`);

    const stackedToasts = await page.$$('[data-toast]');
    log('📊', `Видимых DOM элементов [data-toast]: ${stackedToasts.length}`);

    if (stackedToasts.length <= 3) {
      pass(`Лимит соблюдён: ${stackedToasts.length} видимых (max 3)`);
    } else {
      fail('Лимит превышен', `${stackedToasts.length} > 3`);
    }

    // Check stacking gap
    if (stackedToasts.length >= 2) {
      const box1 = await stackedToasts[0].boundingBox();
      const box2 = await stackedToasts[1].boundingBox();
      if (box1 && box2) {
        const gap = Math.abs(box1.y - (box2.y + box2.height));
        log('📐', `Отступ между тостами: ${Math.round(gap)}px`);
        if (gap >= 4 && gap <= 16) {
          pass(`Отступ между тостами: ${Math.round(gap)}px`);
        }
      }
    }

    // Clear all toasts
    await page.evaluate(() => {
      const store = window.__toastStore;
      if (store) {
        const toasts = store.getState().toasts;
        toasts.forEach(t => store.getState().removeToast(t.id));
      }
    });
    await page.waitForTimeout(500);

    // ═══════════════════════════════════════
    // TEST 3: All toast types visual check
    // ═══════════════════════════════════════
    log('🧪', 'Тест 3: Все типы тостов');

    await triggerToast(page, 'success', '✓ Операция выполнена успешно', 10000);
    await page.waitForTimeout(300);
    await triggerToast(page, 'error', '✗ Не удалось сохранить изменения', 10000);
    await page.waitForTimeout(300);
    await triggerToast(page, 'warning', '⚠ Превышен лимит запросов', 10000);
    await page.waitForTimeout(500);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'toast-all-types.png'), fullPage: false });
    log('📸', 'toast-all-types.png');

    const allTypes = await page.$$('[data-toast]');
    if (allTypes.length === 3) {
      pass('Все 3 типа тостов отображаются одновременно');
    } else {
      log('📊', `Видимых: ${allTypes.length} (ожидалось 3, лимит max 3)`);
    }

    // Check distinct accent colors
    const accentColors = new Set();
    for (const t of allTypes) {
      const accentEl = await t.$('.absolute.left-0');
      if (accentEl) {
        const bg = await accentEl.evaluate(el => getComputedStyle(el).backgroundColor);
        accentColors.add(bg);
      }
    }
    if (accentColors.size >= 2) {
      pass(`Разные accent-цвета для разных типов: ${accentColors.size} уникальных`);
    }

    // Clear
    await page.evaluate(() => {
      const store = window.__toastStore;
      if (store) {
        store.getState().toasts.forEach(t => store.getState().removeToast(t.id));
      }
    });
    await page.waitForTimeout(500);

    // ═══════════════════════════════════════
    // TEST 4: Hover pause
    // ═══════════════════════════════════════
    log('🧪', 'Тест 4: Hover-пауза таймера');

    await triggerToast(page, 'info', 'Наведите мышку — таймер встанет на паузу', 6000);
    await page.waitForTimeout(800);

    const hoverToast = await page.$('[data-toast]');
    if (hoverToast) {
      // Read progress width before hover
      const widthBefore = await hoverToast.evaluate(el => {
        const bar = el.querySelector('div.h-\\[2px\\] > div');
        return bar ? parseFloat(bar.style.width) : null;
      });

      // Hover
      const hBox = await hoverToast.boundingBox();
      if (hBox) {
        await page.mouse.move(hBox.x + hBox.width / 2, hBox.y + hBox.height / 2);
        await page.waitForTimeout(300);

        // Check close button became visible
        const closeBtnOpacity = await hoverToast.evaluate(el => {
          const btn = el.querySelector('button[aria-label="Закрыть"]');
          return btn ? getComputedStyle(btn).opacity : '0';
        });
        if (closeBtnOpacity !== '0') {
          pass('Кнопка закрытия видна при hover');
        }

        // Wait and check progress paused
        await page.waitForTimeout(1000);
        const widthAfterHover = await hoverToast.evaluate(el => {
          const bar = el.querySelector('div.h-\\[2px\\] > div');
          return bar ? parseFloat(bar.style.width) : null;
        });

        await page.waitForTimeout(500);
        const widthAfterHover2 = await hoverToast.evaluate(el => {
          const bar = el.querySelector('div.h-\\[2px\\] > div');
          return bar ? parseFloat(bar.style.width) : null;
        });

        if (widthAfterHover !== null && widthAfterHover2 !== null) {
          const drift = Math.abs(widthAfterHover - widthAfterHover2);
          if (drift < 2) {
            pass(`Hover паузит прогресс: ${widthAfterHover?.toFixed(1)}% → ${widthAfterHover2?.toFixed(1)}% (drift ${drift.toFixed(1)}%)`);
          } else {
            fail('Hover не паузит', `drift=${drift.toFixed(1)}%`);
          }
        }

        // Screenshot with hover
        await page.screenshot({ path: join(SCREENSHOT_DIR, 'toast-hover.png'), fullPage: false });
        log('📸', 'toast-hover.png');

        // Move mouse away — toast should resume & eventually dismiss
        await page.mouse.move(0, 0);
      }
    } else {
      warn('Нет тоста для hover-теста');
    }

    // Clear
    await page.evaluate(() => {
      const store = window.__toastStore;
      if (store) {
        store.getState().toasts.forEach(t => store.getState().removeToast(t.id));
      }
    });
    await page.waitForTimeout(500);

    // ═══════════════════════════════════════
    // TEST 5: Dismiss by click
    // ═══════════════════════════════════════
    log('🧪', 'Тест 5: Закрытие тоста кликом');

    await triggerToast(page, 'error', 'Этот тост можно закрыть', 30000);
    await page.waitForTimeout(500);

    // Check store count before
    const countBefore = await page.evaluate(() => window.__toastStore.getState().toasts.length);
    log('📊', `Тостов в store до dismiss: ${countBefore}`);

    const dismissToast = await page.$('[data-toast]');
    if (dismissToast) {
      const dBox = await dismissToast.boundingBox();
      if (dBox) {
        // Hover to show close button
        await page.mouse.move(dBox.x + dBox.width / 2, dBox.y + dBox.height / 2);
        await page.waitForTimeout(400);

        const closeBtn = await dismissToast.$('button[aria-label="Закрыть"]');
        if (closeBtn) {
          await closeBtn.click({ force: true });
          await page.waitForTimeout(500);

          const countAfter = await page.evaluate(() => window.__toastStore.getState().toasts.length);
          if (countAfter < countBefore) {
            pass(`Тост закрыт по клику на ✕ (store: ${countBefore} → ${countAfter})`);
          } else {
            fail('Тост не закрылся', `store: ${countBefore} → ${countAfter}`);
          }
        }
      }
    }

    // ═══════════════════════════════════════
    // TEST 6: Mobile responsiveness
    // ═══════════════════════════════════════
    log('🧪', 'Тест 6: Мобильная адаптивность (375x667)');

    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    await triggerToast(page, 'success', 'Мобильный тост — компактный и аккуратный', 8000);
    await page.waitForTimeout(500);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'toast-mobile.png'), fullPage: false });
    log('📸', 'toast-mobile.png');

    const mobileToast = await page.$('[data-toast]');
    if (mobileToast) {
      const mBox = await mobileToast.boundingBox();
      if (mBox) {
        if (mBox.width <= 375 - 16) { // max-w-[calc(100vw-2rem)] = 375-32
          pass(`Мобильная ширина адаптивна: ${Math.round(mBox.width)}px (<= ${375 - 16}px)`);
        } else {
          fail('Мобильная ширина', `${Math.round(mBox.width)}px выходит за экран`);
        }

        // Check centered
        const mCenterX = mBox.x + mBox.width / 2;
        if (Math.abs(mCenterX - 375 / 2) < 30) {
          pass('Мобильный тост по центру');
        }

        // Check at bottom
        if (mBox.y + mBox.height > 600) {
          pass('Мобильный тост внизу экрана');
        }
      }
    }

    // Clear & restore
    await page.evaluate(() => {
      const store = window.__toastStore;
      if (store) {
        store.getState().toasts.forEach(t => store.getState().removeToast(t.id));
      }
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);

    // ═══════════════════════════════════════
    // TEST 7: Action button (undo)
    // ═══════════════════════════════════════
    log('🧪', 'Тест 7: Тост с кнопкой действия');

    await page.evaluate(() => {
      window.__toastStore.getState().addToast({
        text: 'Заявка удалена',
        type: 'info',
        duration: 10000,
        action: { label: 'Отменить', onClick: () => { window.__undoCalled = true; } },
      });
    });
    await page.waitForTimeout(500);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'toast-with-action.png'), fullPage: false });
    log('📸', 'toast-with-action.png');

    const actionToast = await page.$('[data-toast]');
    if (actionToast) {
      const actionBtn = await actionToast.$('button:not([aria-label])');
      if (actionBtn) {
        const label = await actionBtn.textContent();
        if (label?.includes('Отменить')) {
          pass('Кнопка "Отменить" присутствует');
          await actionBtn.click();
          await page.waitForTimeout(200);
          const undoCalled = await page.evaluate(() => window.__undoCalled);
          if (undoCalled) pass('Callback кнопки действия работает');
        }
      } else {
        warn('Кнопка действия не найдена');
      }
    }

    // ═══════════════════════════════════════
    // TEST 8: Accessibility
    // ═══════════════════════════════════════
    log('🧪', 'Тест 8: Доступность (a11y)');

    // Check aria-live
    await triggerToast(page, 'info', 'Тест доступности', 5000);
    await page.waitForTimeout(300);

    const a11yToast = await page.$('[data-toast]');
    if (a11yToast) {
      const ariaLive = await a11yToast.getAttribute('aria-live');
      if (ariaLive === 'polite') {
        pass('aria-live="polite" на тосте');
      }
    }

    // Check prefers-reduced-motion
    const styles = await page.$$('style');
    let hasReducedMotion = false;
    for (const style of styles) {
      const content = await style.textContent();
      if (content?.includes('prefers-reduced-motion')) {
        hasReducedMotion = true;
        break;
      }
    }
    if (hasReducedMotion) {
      pass('prefers-reduced-motion учитывается');
    } else {
      warn('prefers-reduced-motion не найден (стили могут быть в CSS-файле)');
    }

    // ═══════════════════════════════════════
    // TEST 9: Console errors
    // ═══════════════════════════════════════
    log('🧪', 'Тест 9: Ошибки консоли');

    const toastErrors = consoleErrors.filter(e =>
      e.toLowerCase().includes('toast') ||
      e.includes('TypeError') ||
      e.includes('ReferenceError')
    );
    if (toastErrors.length === 0) {
      pass('Нет ошибок в консоли связанных с тостами');
    } else {
      fail('Ошибки консоли', toastErrors.slice(0, 3).join('; '));
    }

    // === FINAL SCREENSHOT ===
    // Clear all toasts and trigger a "showcase" set
    await page.evaluate(() => {
      const store = window.__toastStore;
      store.getState().toasts.forEach(t => store.getState().removeToast(t.id));
    });
    await page.waitForTimeout(300);

    await triggerToast(page, 'success', 'Заявка HR-165 успешно создана', 15000);
    await page.waitForTimeout(200);
    await triggerToast(page, 'info', 'Статус изменён на «В обработке»', 15000);
    await page.waitForTimeout(200);
    await triggerToast(page, 'warning', 'Срок SLA истекает через 2 часа', 15000);
    await page.waitForTimeout(500);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'toast-final-showcase.png'), fullPage: false });
    log('📸', 'toast-final-showcase.png (финальная витрина)');

    // Cleanup test toast store reference
    await page.evaluate(() => {
      const store = window.__toastStore;
      store.getState().toasts.forEach(t => store.getState().removeToast(t.id));
    });

  } catch (err) {
    fail('Критическая ошибка', err.message);
    console.error(err);
    await page.screenshot({ path: join(SCREENSHOT_DIR, 'toast-error.png') }).catch(() => {});
  } finally {
    await browser.close();
  }

  // === REPORT ===
  console.log('\n' + '═'.repeat(60));
  console.log('📊 РЕЗУЛЬТАТЫ АУДИТА ТОСТОВ');
  console.log('═'.repeat(60));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${r.test}${r.reason ? ` — ${r.reason}` : ''}`);
  }

  console.log(`\n📈 Итого: ${passed} passed, ${failed} failed, ${warned} warnings из ${results.length}`);

  writeFileSync(
    join(SCREENSHOT_DIR, 'toast-audit-result.json'),
    JSON.stringify({ results, passed, failed, warned, total: results.length }, null, 2)
  );

  process.exit(failed > 0 ? 1 : 0);
}

async function getToken() {
  const res = await fetch(`${API_URL}/api/auth/dev/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL }),
  });
  return (await res.json()).accessToken;
}

main().catch(console.error);
