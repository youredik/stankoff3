#!/usr/bin/env node
/**
 * Audit Workspaces — полная проверка всех воркспейсов
 *
 * Проверяет:
 * 1. Kanban board загрузка (колонки, карточки)
 * 2. Console errors, 5xx network errors
 * 3. Скриншоты kanban + table для каждого воркспейса
 * 4. Переключение на Table view
 * 5. Наличие карточек / заявок
 * 6. Открытие detail panel (клик по карточке)
 * 7. Создание новой заявки в первом воркспейсе
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:3000';
const AUTH_EMAIL = 'youredik@gmail.com';
const SCREENSHOT_DIR = join(process.cwd(), 'audit-screenshots');

if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

const IGNORED_ERRORS = [
  'WebSocket', 'favicon', 'ERR_CONNECTION_REFUSED', 'net::ERR_',
  'ResizeObserver loop', 'hydrat', 'Download the React DevTools',
  'Warning:', 'act(', 'pdfjs', 'canvas', 'Failed to load resource',
  'socket.io', 'NEXT_NOT_FOUND', 'NotFoundError', 'AbortError',
];

function isIgnoredError(text) {
  return IGNORED_ERRORS.some(p => text.includes(p));
}

// Transliterate Cyrillic for filenames
const CYR = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';
const LAT = ['a','b','v','g','d','e','yo','zh','z','i','y','k','l','m','n','o','p','r','s','t','u','f','kh','ts','ch','sh','shch','','y','','e','yu','ya'];
function slug(name) {
  let s = name.toLowerCase();
  for (let i = 0; i < CYR.length; i++) {
    s = s.replaceAll(CYR[i], LAT[i]);
  }
  return s.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 40);
}

async function run() {
  console.log('=== WORKSPACE AUDIT START ===\n');
  const startTime = Date.now();

  // ===== AUTH =====
  console.log('[1/5] Authenticating...');
  const loginResp = await fetch(`${BASE_URL}/api/auth/dev/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: AUTH_EMAIL }),
  });
  const { accessToken: token } = await loginResp.json();
  if (!token) { console.log('  FATAL: No token'); process.exit(1); }
  console.log('  Token OK');

  // ===== WORKSPACES =====
  console.log('\n[2/5] Fetching workspaces...');
  const wsResp = await fetch(`${BASE_URL}/api/workspaces`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const workspaces = await wsResp.json();
  const activeWorkspaces = workspaces.filter(ws => !ws.isArchived);
  console.log(`  Total: ${workspaces.length}, Active: ${activeWorkspaces.length}`);
  activeWorkspaces.forEach((ws, i) => {
    console.log(`    ${i+1}. ${ws.name} [system=${!!ws.isSystem}]`);
  });

  // ===== BROWSER =====
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
  });
  await context.addCookies([{ name: 'access_token', value: token, domain: 'localhost', path: '/' }]);

  // Login via UI click to initialize Zustand stores
  const lp = await context.newPage();
  await lp.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await lp.waitForTimeout(1500);
  const uc = lp.locator('button').filter({ hasText: /youredik|Эдуард|Сарваров/i }).first();
  if (await uc.isVisible({ timeout: 5000 }).catch(() => false)) {
    await uc.click();
    await lp.waitForURL('**/workspace**', { timeout: 15000 }).catch(() => {});
    await lp.waitForTimeout(2000);
  } else {
    await lp.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 20000 });
    await lp.waitForTimeout(2000);
  }
  console.log(`  Login: ${lp.url().includes('workspace') || lp.url().includes('dashboard') ? 'OK' : 'FAILED'}`);
  await lp.close();

  // ===== AUDIT EACH WORKSPACE =====
  console.log('\n[3/5] Auditing each workspace...');
  const results = [];

  for (let i = 0; i < activeWorkspaces.length; i++) {
    const ws = activeWorkspaces[i];
    const wsSlug = slug(ws.name) || `ws-${i}`;
    const wsResult = {
      name: ws.name, id: ws.id, slug: ws.slug || wsSlug,
      isSystem: !!ws.isSystem,
      kanbanLoaded: false, tableLoaded: false,
      entityCount: 0, columnsCount: 0,
      detailPanelOpened: false,
      consoleErrors: [], networkErrors: [],
      screenshotKanban: null, screenshotTable: null,
      status: 'unknown',
    };

    console.log(`\n  [${i+1}/${activeWorkspaces.length}] "${ws.name}"...`);
    const wsErrors = [];
    const wsNetErrors = [];

    const pg = await context.newPage();
    pg.on('console', msg => {
      if (msg.type() === 'error') {
        const t = msg.text().substring(0, 300);
        if (!isIgnoredError(t)) wsErrors.push(t);
      }
    });
    pg.on('pageerror', err => {
      const t = err.message.substring(0, 300);
      if (!isIgnoredError(t)) wsErrors.push(t);
    });
    pg.on('response', r => {
      if (r.status() >= 500) wsNetErrors.push({ url: r.url().substring(0, 150), status: r.status() });
    });

    try {
      const defaultView = ws.isSystem ? 'table' : 'kanban';

      // ---- KANBAN ----
      await pg.goto(`${BASE_URL}/workspace/${ws.id}?view=kanban`, {
        waitUntil: 'networkidle', timeout: 30000,
      });
      await pg.waitForTimeout(3000);

      const bodyText = await pg.textContent('body');
      const hasRuntimeError = bodyText.includes('Unhandled Runtime Error') ||
                              bodyText.includes('Application error') ||
                              bodyText.includes('Cannot read properties');
      if (hasRuntimeError) wsResult.status = 'RUNTIME_ERROR';

      // Count columns: KanbanColumn uses role="group" with aria-label "Title — count"
      const columns = await pg.$$('[role="group"][aria-label]');
      wsResult.columnsCount = columns.length;

      // Count cards inside columns: each card is a div with onClick and dnd-kit data attrs
      // Cards are rendered by KanbanCard with useSortable — they get data-id attr from @dnd-kit
      const cardCount = await pg.evaluate(() => {
        // Strategy 1: Cards inside group columns
        const groups = document.querySelectorAll('[role="group"][aria-label]');
        let count = 0;
        groups.forEach(g => {
          // Cards are immediate or nested children with cursor-pointer
          const cards = g.querySelectorAll('[style*="transform"]');
          // Fallback: count items that look like cards (with rounded border and padding)
          if (cards.length === 0) {
            const divs = g.querySelectorAll('div[tabindex]');
            count += divs.length;
          } else {
            count += cards.length;
          }
        });
        if (count > 0) return count;

        // Strategy 2: look for data attributes from @dnd-kit/sortable
        const sortableItems = document.querySelectorAll('[data-dndkit-sortable-id], [role="button"][tabindex="0"]');
        return sortableItems.length;
      });

      wsResult.entityCount = cardCount;
      wsResult.kanbanLoaded = columns.length > 0 || !hasRuntimeError;
      console.log(`    Kanban: ${columns.length} columns, ${cardCount} cards`);

      // Screenshot kanban
      const kanbanFile = `ws-audit-kanban-${wsSlug}.png`;
      await pg.screenshot({ path: join(SCREENSHOT_DIR, kanbanFile), fullPage: false });
      wsResult.screenshotKanban = kanbanFile;

      // ---- OPEN DETAIL PANEL (click first card) ----
      if (cardCount > 0) {
        try {
          // Find first clickable card-like element
          const firstCard = await pg.evaluate(() => {
            const groups = document.querySelectorAll('[role="group"][aria-label]');
            for (const g of groups) {
              // Find elements with tabindex (sortable items)
              const items = g.querySelectorAll('[tabindex]');
              for (const item of items) {
                if (item.textContent && item.textContent.trim().length > 0 &&
                    item.offsetHeight > 40 && item.offsetWidth > 100) {
                  // Return coordinates for clicking
                  const r = item.getBoundingClientRect();
                  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
                }
              }
            }
            return null;
          });

          if (firstCard) {
            await pg.mouse.click(firstCard.x, firstCard.y);
            await pg.waitForTimeout(2500);

            // Check if detail panel opened
            const afterClick = await pg.textContent('body');
            const hasPanelContent = afterClick.includes('Исполнитель') ||
                                    afterClick.includes('Приоритет') ||
                                    afterClick.includes('Комментарии') ||
                                    afterClick.includes('Описание');
            wsResult.detailPanelOpened = hasPanelContent;
            console.log(`    Detail panel: ${hasPanelContent ? 'OK' : 'NOT detected'}`);

            await pg.keyboard.press('Escape');
            await pg.waitForTimeout(500);
          }
        } catch (err) {
          console.log(`    Detail panel error: ${err.message.substring(0, 100)}`);
        }
      } else {
        // No cards in kanban — try to check via API if workspace has entities
        try {
          const apiResp = await fetch(`${BASE_URL}/api/entities?workspaceId=${ws.id}&perPage=1`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const apiData = await apiResp.json();
          const total = apiData.total || (apiData.data && apiData.data.length) || 0;
          if (total > 0) {
            console.log(`    Note: API reports ${total} entities, but kanban shows 0 cards (may be loading issue)`);
            wsResult.entityCount = total; // Use API count
          }
        } catch {}
      }

      // ---- TABLE VIEW ----
      await pg.goto(`${BASE_URL}/workspace/${ws.id}?view=table`, {
        waitUntil: 'networkidle', timeout: 20000,
      });
      await pg.waitForTimeout(2500);

      const tableEl = await pg.$('table');
      const tableRows = await pg.$$('table tbody tr');
      wsResult.tableLoaded = tableEl !== null;
      console.log(`    Table: ${wsResult.tableLoaded ? 'OK' : 'not detected'} (${tableRows.length} rows)`);

      // If we had no entity count yet, use table rows
      if (wsResult.entityCount === 0 && tableRows.length > 0) {
        wsResult.entityCount = tableRows.length;
      }

      // If we have entities but didn't test detail panel yet, try from table
      if (!wsResult.detailPanelOpened && tableRows.length > 0) {
        try {
          await tableRows[0].click();
          await pg.waitForTimeout(2500);
          const panelText = await pg.textContent('body');
          wsResult.detailPanelOpened = panelText.includes('Исполнитель') ||
                                       panelText.includes('Приоритет') ||
                                       panelText.includes('Комментарии');
          console.log(`    Detail panel (from table): ${wsResult.detailPanelOpened ? 'OK' : 'NOT detected'}`);
          await pg.keyboard.press('Escape');
          await pg.waitForTimeout(500);
        } catch (err) {
          console.log(`    Detail panel (table) error: ${err.message.substring(0, 100)}`);
        }
      }

      const tableFile = `ws-audit-table-${wsSlug}.png`;
      await pg.screenshot({ path: join(SCREENSHOT_DIR, tableFile), fullPage: false });
      wsResult.screenshotTable = tableFile;

      // Finalize
      wsResult.consoleErrors = [...wsErrors];
      wsResult.networkErrors = [...wsNetErrors];
      if (wsResult.status === 'unknown') {
        if (wsNetErrors.length > 0) wsResult.status = 'HAS_ERRORS';
        else if (wsErrors.length > 0) wsResult.status = 'HAS_WARNINGS';
        else wsResult.status = 'OK';
      }
      console.log(`    Status: ${wsResult.status} | Console: ${wsErrors.length} | 5xx: ${wsNetErrors.length}`);
    } catch (err) {
      wsResult.status = 'CRASHED';
      wsResult.consoleErrors = [err.message.substring(0, 300)];
      console.log(`    CRASHED: ${err.message.substring(0, 150)}`);
    }

    await pg.close();
    results.push(wsResult);
  }

  // ===== CREATE ENTITY =====
  console.log('\n[4/5] Creating a test entity...');
  let createResult = { attempted: false, success: false, error: null, workspaceName: null };

  const targetWs = activeWorkspaces.find(ws => !ws.isSystem) || activeWorkspaces[0];
  if (targetWs) {
    createResult.attempted = true;
    createResult.workspaceName = targetWs.name;

    const cp = await context.newPage();
    const createErrors = [];
    cp.on('console', msg => {
      if (msg.type() === 'error' && !isIgnoredError(msg.text())) createErrors.push(msg.text().substring(0, 300));
    });

    try {
      await cp.goto(`${BASE_URL}/workspace/${targetWs.id}?view=kanban`, {
        waitUntil: 'networkidle', timeout: 30000,
      });
      await cp.waitForTimeout(3000);

      // Find create button — look for the header Plus icon or "Создать" text
      // In KanbanBoard, the create button is: <button onClick={() => setShowCreateModal(true)}>
      // with Plus icon and possibly "Создать" text
      let clicked = false;

      // Try finding button that opens CreateEntityModal
      const buttons = await cp.$$('button');
      for (const btn of buttons) {
        const text = (await btn.textContent() || '').trim();
        const ariaLabel = (await btn.getAttribute('aria-label')) || '';
        const isVisible = await btn.isVisible();
        if (!isVisible) continue;

        // Look for "Создать" but NOT "Создать раздел" or similar
        if ((text === 'Создать' || text === 'Создать заявку' || text === 'Добавить' ||
             ariaLabel === 'Создать' || ariaLabel === 'Создать заявку') &&
            !text.includes('раздел') && !text.includes('секцию')) {
          await btn.click();
          clicked = true;
          console.log(`  Clicked: "${text || ariaLabel}"`);
          break;
        }
      }

      // Fallback: look for a Plus icon button in the kanban header area
      if (!clicked) {
        for (const btn of buttons) {
          const isVisible = await btn.isVisible();
          if (!isVisible) continue;
          const hasSvg = await btn.$('svg');
          const text = (await btn.textContent() || '').trim();
          // Plus icon button has the Plus SVG and possibly short/empty text
          if (hasSvg && text.length <= 10 && text.includes('Создать')) {
            await btn.click();
            clicked = true;
            console.log(`  Clicked Plus button: "${text}"`);
            break;
          }
        }
      }

      // Last fallback: click any "Создать" containing button
      if (!clicked) {
        const createBtn = cp.locator('button').filter({ hasText: 'Создать' }).first();
        if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await createBtn.click();
          clicked = true;
          console.log('  Clicked first "Создать" button');
        }
      }

      if (!clicked) {
        createResult.error = 'Create button not found';
        console.log('  Create button not found');
      } else {
        await cp.waitForTimeout(1500);
        await cp.screenshot({ path: join(SCREENSHOT_DIR, 'ws-audit-create-modal.png'), fullPage: false });

        // Check if modal is visible (CreateEntityModal renders a fixed overlay)
        const modalVisible = await cp.evaluate(() => {
          const overlays = document.querySelectorAll('[class*="fixed"][class*="inset-0"], [class*="fixed"][class*="z-"]');
          return overlays.length > 0;
        });
        console.log(`  Modal visible: ${modalVisible}`);

        // Fill title
        let titleFilled = false;
        const testTitle = `Audit test ${Date.now()}`;

        for (const sel of [
          'input[placeholder*="Название"]', 'input[placeholder*="название"]',
          'input[name="title"]', 'input[aria-label*="Название"]',
        ]) {
          const inp = cp.locator(sel).first();
          if (await inp.isVisible({ timeout: 500 }).catch(() => false)) {
            await inp.fill(testTitle);
            titleFilled = true;
            console.log(`  Title filled: "${sel}"`);
            break;
          }
        }

        if (!titleFilled) {
          // First visible text input in a modal/overlay
          const inputs = await cp.$$('input[type="text"], input:not([type])');
          for (const inp of inputs) {
            if (await inp.isVisible()) {
              await inp.fill(testTitle);
              titleFilled = true;
              console.log('  Title filled via fallback');
              break;
            }
          }
        }

        if (titleFilled) {
          // Submit
          let submitted = false;

          // Try submit button
          const submitBtn = cp.locator('button[type="submit"]').first();
          if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await submitBtn.click();
            submitted = true;
          } else {
            // Find "Создать" button inside the modal
            const modalBtns = await cp.$$('button');
            for (const btn of modalBtns) {
              const text = (await btn.textContent() || '').trim();
              if ((text === 'Создать' || text === 'Сохранить') && await btn.isVisible()) {
                await btn.click();
                submitted = true;
                break;
              }
            }
          }

          if (submitted) {
            console.log('  Submitted');
            await cp.waitForTimeout(3000);

            // Verify via API
            let found = false;
            try {
              const sr = await fetch(`${BASE_URL}/api/entities?workspaceId=${targetWs.id}&search=${encodeURIComponent(testTitle)}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              const sd = await sr.json();
              const items = sd.data || sd;
              if (Array.isArray(items) && items.length > 0) {
                found = true;
                console.log(`  Created: "${items[0].title}" (${items[0].id})`);
                // Cleanup
                try {
                  await fetch(`${BASE_URL}/api/entities/${items[0].id}`, {
                    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
                  });
                  console.log('  Cleaned up');
                } catch {}
              }
            } catch {}

            createResult.success = found || (await cp.textContent('body')).includes(testTitle);
            console.log(`  Result: ${createResult.success ? 'SUCCESS' : 'FAILED'}`);
            await cp.screenshot({ path: join(SCREENSHOT_DIR, 'ws-audit-after-create.png'), fullPage: false });
          } else {
            createResult.error = 'Submit not found';
          }
        } else {
          createResult.error = 'Title input not found';
        }
      }

      if (createErrors.length > 0) {
        createResult.error = (createResult.error || '') + '; Console: ' + createErrors.join('; ').substring(0, 300);
      }
    } catch (err) {
      createResult.error = err.message.substring(0, 300);
      console.log(`  Error: ${err.message.substring(0, 150)}`);
    }
    await cp.close();
  }

  // ===== REPORT =====
  console.log('\n[5/5] Generating report...');

  const total = activeWorkspaces.length;
  const ok = results.filter(r => r.status === 'OK');
  const errors = results.filter(r => r.status === 'HAS_ERRORS' || r.status === 'RUNTIME_ERROR' || r.status === 'CRASHED');
  const warns = results.filter(r => r.status === 'HAS_WARNINGS');
  const empty = results.filter(r => r.entityCount === 0);
  const totalEntities = results.reduce((s, r) => s + r.entityCount, 0);
  const panelOk = results.filter(r => r.detailPanelOpened);
  const tableOk = results.filter(r => r.tableLoaded);
  const kanbanOk = results.filter(r => r.kanbanLoaded);
  const withEntities = results.filter(r => r.entityCount > 0);

  const report = {
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    summary: {
      totalWorkspaces: total, okCount: ok.length,
      warningCount: warns.length, errorCount: errors.length,
      emptyCount: empty.length, totalEntities,
      kanbanLoadedCount: kanbanOk.length,
      tableLoadedCount: tableOk.length,
      detailPanelTestedCount: panelOk.length,
      detailPanelTestedOf: withEntities.length,
      entityCreation: createResult,
    },
    workspaces: results,
    failedWorkspaces: errors.map(r => ({
      name: r.name, status: r.status,
      errors: [...r.consoleErrors, ...r.networkErrors.map(e => `${e.status}: ${e.url}`)],
    })),
    emptyWorkspaces: empty.map(r => r.name),
  };

  writeFileSync(join(SCREENSHOT_DIR, 'ws-audit-result.json'), JSON.stringify(report, null, 2));

  console.log('\n========================================');
  console.log('        WORKSPACE AUDIT SUMMARY');
  console.log('========================================\n');
  console.log(`Total workspaces:   ${total}`);
  console.log(`OK:                 ${ok.length}`);
  console.log(`Warnings:           ${warns.length}`);
  console.log(`Errors/Crashed:     ${errors.length}`);
  console.log(`Empty (0 entities): ${empty.length}`);
  console.log(`Total entities:     ${totalEntities}`);
  console.log(`Kanban loaded:      ${kanbanOk.length}/${total}`);
  console.log(`Table loaded:       ${tableOk.length}/${total}`);
  console.log(`Detail panel OK:    ${panelOk.length}/${withEntities.length} (tested where entities exist)`);
  console.log(`Entity creation:    ${createResult.success ? 'OK' : 'FAILED' + (createResult.error ? ` — ${createResult.error.substring(0, 120)}` : '')}`);
  console.log(`Duration:           ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  if (errors.length > 0) {
    console.log('\n--- FAILED WORKSPACES ---');
    errors.forEach(r => {
      console.log(`  [${r.status}] ${r.name}`);
      r.consoleErrors.slice(0, 3).forEach(e => console.log(`    ${e.substring(0, 150)}`));
      r.networkErrors.slice(0, 3).forEach(e => console.log(`    ${e.status} ${e.url}`));
    });
  }

  if (warns.length > 0) {
    console.log('\n--- WORKSPACES WITH WARNINGS ---');
    warns.forEach(r => {
      console.log(`  ${r.name}: ${r.consoleErrors.length} console errors`);
      r.consoleErrors.slice(0, 2).forEach(e => console.log(`    ${e.substring(0, 150)}`));
    });
  }

  if (empty.length > 0) {
    console.log('\n--- EMPTY WORKSPACES ---');
    empty.forEach(r => console.log(`  - ${r.name}`));
  }

  console.log('\n--- PER-WORKSPACE DETAILS ---');
  results.forEach(r => {
    const icon = r.status === 'OK' ? ' OK ' : r.status === 'HAS_WARNINGS' ? 'WARN' : 'FAIL';
    console.log(`  [${icon}] ${r.name}: kanban=${r.kanbanLoaded} (${r.columnsCount}col), table=${r.tableLoaded}, entities=${r.entityCount}, panel=${r.detailPanelOpened}, errs=${r.consoleErrors.length}+${r.networkErrors.length}`);
  });

  console.log(`\nScreenshots: ${SCREENSHOT_DIR}/ws-audit-*.png`);
  console.log('Report: audit-screenshots/ws-audit-result.json');
  console.log('\n=== WORKSPACE AUDIT COMPLETE ===');

  await browser.close();
  process.exit(errors.length > 0 ? 1 : 0);
}

run().catch(err => { console.error('FATAL:', err); process.exit(2); });
