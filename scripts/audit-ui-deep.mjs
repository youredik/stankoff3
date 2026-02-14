#!/usr/bin/env node
/**
 * Deep UI Audit — Comprehensive Playwright-based portal audit
 *
 * Tests:
 * 1. Login flow (dev card click -> dashboard redirect)
 * 2. Dashboard rendering, console errors
 * 3. Sidebar navigation — every link, screenshots
 * 4. Entity detail panel — title, status, comments, fields, close
 * 5. Create entity modal — title input, submit button
 * 6. Chat interactions — open conversation, type message
 * 7. Keyboard shortcuts — Escape closes modals/panels
 * 8. Dark mode toggle — verify theme switch
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3001';
const ADMIN_EMAIL = 'youredik@gmail.com';
const SCREENSHOT_DIR = join(process.cwd(), 'audit-screenshots', 'ui-deep');

if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ===== Result tracking =====
const findings = {
  bugs: [],
  warnings: [],
  ok: [],
  info: [],
};

function bug(msg) { findings.bugs.push(msg); console.log(`  [BUG] ${msg}`); }
function warn(msg) { findings.warnings.push(msg); console.log(`  [WARN] ${msg}`); }
function ok(msg) { findings.ok.push(msg); console.log(`  [OK] ${msg}`); }
function info(msg) { findings.info.push(msg); console.log(`  [INFO] ${msg}`); }

// ===== Helpers =====
async function getToken() {
  const res = await fetch(`${API_URL}/api/auth/dev/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  return (await res.json()).accessToken;
}

async function apiGet(path, token) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

async function screenshot(page, name) {
  const path = join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

// ===== TEST 1: Login Flow =====
async function testLoginFlow(page, consoleErrors) {
  console.log('\n=== TEST 1: Login Flow ===');
  const errorsBefore = consoleErrors.length;

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '01-login-page');

    // Check login page rendered
    const hasCards = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      return Array.from(buttons).some(b => b.textContent?.includes('Эдуард') || b.textContent?.includes('youredik') || b.textContent?.includes('Сарваров'));
    });

    if (!hasCards) {
      // Try broader search — div with cursor-pointer
      const hasClickable = await page.evaluate(() => {
        const elements = document.querySelectorAll('div[class*="cursor-pointer"], button, [role="button"]');
        return Array.from(elements).some(el => {
          const text = el.textContent || '';
          return text.includes('Эдуард') || text.includes('youredik') || text.includes('Сарваров');
        });
      });
      if (!hasClickable) {
        bug('Login page: admin card not found (no element with "Эдуард"/"youredik"/"Сарваров")');
        return false;
      }
    }

    ok('Login page: admin card visible');

    // Click admin card
    const adminCard = page.locator('button, [role="button"], div[class*="cursor-pointer"]')
      .filter({ hasText: /youredik|Эдуард|Сарваров/i }).first();

    const visible = await adminCard.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) {
      bug('Login page: admin card found in DOM but not visible');
      return false;
    }

    await adminCard.click();

    // Wait for redirect
    const redirected = await page.waitForURL('**/dashboard**', { timeout: 15000 })
      .then(() => true)
      .catch(() => false);

    if (redirected) {
      ok(`Login redirect: ${page.url()}`);
    } else {
      // Maybe redirected somewhere else?
      const currentUrl = page.url();
      if (currentUrl.includes('/login')) {
        bug(`Login redirect FAILED: still on ${currentUrl}`);
        await screenshot(page, '01-login-redirect-fail');
        return false;
      } else {
        warn(`Login redirected to unexpected URL: ${currentUrl} (expected /dashboard)`);
      }
    }

    await page.waitForTimeout(2000);
    await screenshot(page, '01-login-success');

    // Check console errors during login
    const newErrors = consoleErrors.slice(errorsBefore);
    if (newErrors.length > 0) {
      warn(`Login produced ${newErrors.length} console error(s): ${newErrors.slice(0, 3).map(e => e.slice(0, 100)).join('; ')}`);
    }

    return true;
  } catch (e) {
    bug(`Login flow crashed: ${e.message.slice(0, 200)}`);
    return false;
  }
}

// ===== TEST 2: Dashboard =====
async function testDashboard(page, consoleErrors) {
  console.log('\n=== TEST 2: Dashboard ===');
  const errorsBefore = consoleErrors.length;

  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Check for error boundaries
    const hasError = await page.locator('text=/error boundary|что-то пошло не так|unhandled|500/i')
      .first().isVisible({ timeout: 1000 }).catch(() => false);
    if (hasError) {
      bug('Dashboard shows error boundary');
      await screenshot(page, '02-dashboard-error');
      return;
    }

    // Check main content rendered (sidebar + main area)
    const hasSidebar = await page.locator('[data-testid="sidebar"]').isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasSidebar) {
      warn('Dashboard: sidebar not visible (data-testid="sidebar" not found)');
    } else {
      ok('Dashboard: sidebar visible');
    }

    // Check if any content exists in main area
    const bodyText = await page.evaluate(() => document.body.innerText.length);
    if (bodyText < 50) {
      bug('Dashboard: page appears blank (< 50 chars of text)');
    } else {
      ok(`Dashboard: content rendered (${bodyText} chars)`);
    }

    // Check for loading spinners stuck
    const hasSpinner = await page.locator('[class*="animate-spin"]').first().isVisible({ timeout: 500 }).catch(() => false);
    if (hasSpinner) {
      warn('Dashboard: loading spinner still visible after 2s');
    }

    // Check for horizontal overflow
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5);
    if (overflow) {
      bug('Dashboard: horizontal overflow detected');
    }

    // Check broken images
    const brokenImgs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img'))
        .filter(img => img.naturalWidth === 0 && img.src && !img.src.includes('data:'))
        .map(img => img.src);
    });
    if (brokenImgs.length > 0) {
      bug(`Dashboard: ${brokenImgs.length} broken image(s): ${brokenImgs.slice(0, 3).join(', ')}`);
    }

    // Inaccessible buttons
    const badButtons = await page.evaluate(() => {
      let count = 0;
      document.querySelectorAll('button').forEach(btn => {
        const text = btn.textContent?.trim();
        const ariaLabel = btn.getAttribute('aria-label');
        const title = btn.getAttribute('title');
        if (!text && !ariaLabel && !title) count++;
      });
      return count;
    });
    if (badButtons > 0) {
      warn(`Dashboard: ${badButtons} button(s) without accessible text (no textContent, aria-label, or title)`);
    }

    await screenshot(page, '02-dashboard');

    // Console errors
    const newErrors = consoleErrors.slice(errorsBefore);
    if (newErrors.length > 0) {
      const unique = [...new Set(newErrors)].slice(0, 5);
      bug(`Dashboard: ${newErrors.length} console error(s):\n    ${unique.map(e => e.slice(0, 150)).join('\n    ')}`);
    } else {
      ok('Dashboard: no console errors');
    }
  } catch (e) {
    bug(`Dashboard test crashed: ${e.message.slice(0, 200)}`);
  }
}

// ===== TEST 3: Sidebar Navigation =====
async function testSidebarNavigation(page, consoleErrors) {
  console.log('\n=== TEST 3: Sidebar Navigation ===');

  // Routes that should be accessible from sidebar
  const sidebarRoutes = [
    { name: 'Tasks (Входящие задания)', testid: 'sidebar-inbox-button', path: '/tasks' },
    { name: 'Chat (Чат)', text: 'Чат', path: '/chat' },
    { name: 'Knowledge Base (База знаний)', text: 'База знаний', path: '/knowledge-base' },
    { name: 'Admin Users (Пользователи)', text: 'Пользователи', path: '/admin/users' },
    { name: 'Admin Invitations (Приглашения)', text: 'Приглашения', path: '/admin/invitations' },
    { name: 'Admin Roles (Роли)', text: 'Роли и права', path: '/admin/roles' },
  ];

  // First go to dashboard to have sidebar
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(2000);

  for (const route of sidebarRoutes) {
    const errorsBefore = consoleErrors.length;
    try {
      let clicked = false;

      // Try by data-testid first
      if (route.testid) {
        const el = page.locator(`[data-testid="${route.testid}"]`);
        const vis = await el.isVisible({ timeout: 2000 }).catch(() => false);
        if (vis) {
          await el.click();
          clicked = true;
        }
      }

      // Try by text content
      if (!clicked && route.text) {
        const el = page.locator('[data-testid="sidebar"] button, [data-testid="sidebar"] a')
          .filter({ hasText: route.text }).first();
        const vis = await el.isVisible({ timeout: 2000 }).catch(() => false);
        if (vis) {
          await el.click();
          clicked = true;
        }
      }

      if (!clicked) {
        // Fallback: direct navigation
        warn(`Sidebar: "${route.name}" link not found in sidebar, navigating directly`);
        await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 20000 });
      } else {
        await page.waitForTimeout(2000);
      }

      // Verify we're on the right page
      const currentUrl = page.url();
      if (!currentUrl.includes(route.path)) {
        warn(`Sidebar "${route.name}": expected path ${route.path} but got ${currentUrl}`);
      }

      // Check for errors on page
      const hasError = await page.locator('text=/error boundary|что-то пошло не так|500|unhandled/i')
        .first().isVisible({ timeout: 1000 }).catch(() => false);
      if (hasError) {
        bug(`Sidebar "${route.name}": error displayed on page`);
      }

      // Check HTTP status (might need to handle redirect)
      const bodyLen = await page.evaluate(() => document.body.innerText.length);
      if (bodyLen < 30) {
        warn(`Sidebar "${route.name}": page appears nearly blank (${bodyLen} chars)`);
      }

      const screenshotName = route.path.replace(/\//g, '_').replace(/^_/, '') || 'root';
      await screenshot(page, `03-nav-${screenshotName}`);

      // Console errors
      const newErrors = consoleErrors.slice(errorsBefore);
      if (newErrors.length > 0) {
        const unique = [...new Set(newErrors)];
        warn(`Sidebar "${route.name}": ${unique.length} unique console error(s): ${unique.slice(0, 2).map(e => e.slice(0, 80)).join('; ')}`);
      } else {
        ok(`Sidebar "${route.name}": loads OK`);
      }

      // Go back to dashboard for next iteration
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000);
    } catch (e) {
      bug(`Sidebar "${route.name}": crashed: ${e.message.slice(0, 150)}`);
    }
  }

  // Also test workspace sidebar items
  console.log('\n  Testing workspace sidebar items...');
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);

    const wsItems = await page.locator('[data-testid="sidebar-workspace-button"]').all();
    info(`Sidebar: ${wsItems.length} workspace(s) listed`);

    if (wsItems.length > 0) {
      // Click first workspace
      const firstName = await wsItems[0].textContent().catch(() => 'unknown');
      await wsItems[0].click();
      await page.waitForTimeout(2000);

      const currentUrl = page.url();
      if (currentUrl.includes('/workspace/')) {
        ok(`Sidebar workspace click: navigated to ${currentUrl}`);
      } else {
        warn(`Sidebar workspace click: expected /workspace/ URL, got ${currentUrl}`);
      }
      await screenshot(page, '03-nav-workspace-first');
    }
  } catch (e) {
    warn(`Sidebar workspace test: ${e.message.slice(0, 100)}`);
  }
}

// ===== TEST 4: Entity Detail Panel =====
async function testEntityDetailPanel(page, consoleErrors, token) {
  console.log('\n=== TEST 4: Entity Detail Panel ===');
  const errorsBefore = consoleErrors.length;

  try {
    // Get first workspace with entities
    const workspaces = await apiGet('/api/workspaces', token);
    if (!workspaces.length) {
      warn('Entity detail: no workspaces found');
      return;
    }

    let targetWsId = null;
    let targetEntity = null;

    for (const ws of workspaces.slice(0, 5)) {
      try {
        const entities = await apiGet(`/api/entities?workspaceId=${ws.id}&limit=5`, token);
        const list = Array.isArray(entities) ? entities : entities?.data || entities?.items || [];
        if (list.length > 0) {
          targetWsId = ws.id;
          targetEntity = list[0];
          info(`Entity detail: using workspace "${ws.name}", entity "${targetEntity.title || targetEntity.customId}"`);
          break;
        }
      } catch (e) { /* try next */ }
    }

    if (!targetWsId || !targetEntity) {
      warn('Entity detail: no entities found in any workspace');
      return;
    }

    // Navigate to workspace
    await page.goto(`${BASE_URL}/workspace/${targetWsId}`, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(3000);
    await screenshot(page, '04-workspace-board');

    // Try clicking on an entity card in kanban
    // NOTE: kanban cards use @dnd-kit sortable which intercepts pointer events.
    // We use dispatchEvent('click') to bypass dnd-kit's onPointerDown handler.
    let clicked = false;

    // Try kanban card click — use dispatchEvent to bypass dnd-kit
    const kanbanCardCount = await page.locator('[data-testid="kanban-card"]').count();
    if (kanbanCardCount > 0) {
      info(`Entity detail: found ${kanbanCardCount} kanban card(s)`);
      await page.locator('[data-testid="kanban-card"]').first().dispatchEvent('click');
      clicked = true;
    }

    // Try table row if no kanban cards
    if (!clicked) {
      const tableRows = await page.locator('table tbody tr, [role="row"]').all();
      if (tableRows.length > 0) {
        info(`Entity detail: found ${tableRows.length} table row(s), clicking first`);
        await tableRows[0].click({ timeout: 5000 });
        clicked = true;
      }
    }

    // Fallback: click any clickable element that looks like entity
    if (!clicked) {
      const entityEl = await page.locator(`text="${targetEntity.title}"`)
        .first().isVisible({ timeout: 2000 }).catch(() => false);
      if (entityEl) {
        await page.locator(`text="${targetEntity.title}"`).first().dispatchEvent('click');
        clicked = true;
      }
    }

    if (!clicked) {
      warn('Entity detail: could not click any entity card/row');
      await screenshot(page, '04-entity-no-cards');
      return;
    }

    await page.waitForTimeout(2000);

    // Check detail panel opened
    const panelVisible = await page.locator('[data-testid="entity-detail-panel"]')
      .isVisible({ timeout: 5000 }).catch(() => false);

    if (!panelVisible) {
      // Maybe it opened full page or different component
      const anyPanel = await page.locator('[data-testid*="detail"], [class*="detail-panel"], [class*="slideOver"]')
        .first().isVisible({ timeout: 2000 }).catch(() => false);
      if (anyPanel) {
        warn('Entity detail: panel opened but without expected data-testid="entity-detail-panel"');
      } else {
        bug('Entity detail: panel did NOT open after clicking entity card');
        await screenshot(page, '04-entity-panel-not-opened');
        return;
      }
    } else {
      ok('Entity detail: panel opened');
    }

    await screenshot(page, '04-entity-detail-open');

    // Check: Title visible
    const titleVisible = await page.locator('[data-testid="entity-title"], [data-testid="entity-title-input"]')
      .first().isVisible({ timeout: 2000 }).catch(() => false);
    if (titleVisible) {
      ok('Entity detail: title visible');
    } else {
      bug('Entity detail: title NOT visible');
    }

    // Check: Status visible
    const statusVisible = await page.locator('[data-testid="entity-status-section"]')
      .first().isVisible({ timeout: 2000 }).catch(() => false);
    if (statusVisible) {
      ok('Entity detail: status section visible');
    } else {
      // Try scrolling the right sidebar panel
      const rightPanel = page.locator('[data-testid="entity-detail-panel"]');
      const scrollable = await rightPanel.locator('[class*="overflow-y"]').first();
      if (await scrollable.isVisible().catch(() => false)) {
        await scrollable.evaluate(el => el.scrollTop = el.scrollHeight);
        await page.waitForTimeout(500);
        const statusAfterScroll = await page.locator('[data-testid="entity-status-section"]')
          .first().isVisible({ timeout: 1000 }).catch(() => false);
        if (statusAfterScroll) {
          ok('Entity detail: status section visible after scroll');
        } else {
          warn('Entity detail: status section NOT visible even after scroll');
        }
      } else {
        warn('Entity detail: status section NOT visible');
      }
    }

    // Check: Comments section
    const commentsVisible = await page.locator('[data-testid="entity-comments-section"]')
      .first().isVisible({ timeout: 2000 }).catch(() => false);
    if (commentsVisible) {
      ok('Entity detail: comments section visible');
    } else {
      warn('Entity detail: comments section NOT visible');
    }

    // Check: Custom ID visible
    const customIdVisible = await page.locator('[data-testid="entity-custom-id"]')
      .first().isVisible({ timeout: 1000 }).catch(() => false);
    if (customIdVisible) {
      ok('Entity detail: custom ID badge visible');
    } else {
      warn('Entity detail: custom ID badge NOT visible');
    }

    // Check: Assignee section
    const assigneeVisible = await page.locator('[data-testid="entity-assignee-section"]')
      .first().isVisible({ timeout: 1000 }).catch(() => false);
    if (assigneeVisible) {
      ok('Entity detail: assignee section visible');
    } else {
      info('Entity detail: assignee section NOT visible (may be scrolled)');
    }

    // Check: Close button
    const closeBtn = await page.locator('[data-testid="entity-close-button"]')
      .first().isVisible({ timeout: 2000 }).catch(() => false);
    if (closeBtn) {
      ok('Entity detail: close button (X) visible');

      // Click close and verify panel closes
      await page.locator('[data-testid="entity-close-button"]').first().click();
      await page.waitForTimeout(1000);

      const panelAfterClose = await page.locator('[data-testid="entity-detail-panel"]')
        .isVisible({ timeout: 1000 }).catch(() => false);
      if (!panelAfterClose) {
        ok('Entity detail: panel closed after clicking X');
      } else {
        bug('Entity detail: panel did NOT close after clicking X button');
      }
    } else {
      bug('Entity detail: close button (X) NOT found');
    }

    // Console errors
    const newErrors = consoleErrors.slice(errorsBefore);
    if (newErrors.length > 0) {
      const unique = [...new Set(newErrors)];
      warn(`Entity detail: ${unique.length} unique console error(s):\n    ${unique.slice(0, 3).map(e => e.slice(0, 120)).join('\n    ')}`);
    }
  } catch (e) {
    bug(`Entity detail test crashed: ${e.message.slice(0, 200)}`);
  }
}

// ===== TEST 5: Create Entity Modal =====
async function testCreateEntityModal(page, consoleErrors, token) {
  console.log('\n=== TEST 5: Create Entity Modal ===');
  const errorsBefore = consoleErrors.length;

  try {
    const workspaces = await apiGet('/api/workspaces', token);
    if (!workspaces.length) {
      warn('Create entity: no workspaces');
      return;
    }

    const ws = workspaces[0];
    await page.goto(`${BASE_URL}/workspace/${ws.id}`, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(2000);

    // Find "Create" / "+" / "Создать" button
    let createBtn = null;

    // Try data-testid
    const newEntityBtn = page.locator('[data-testid="kanban-new-entity-button"]').first();
    if (await newEntityBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      createBtn = newEntityBtn;
      info('Create entity: found [data-testid="kanban-new-entity-button"]');
    }

    // Try by text
    if (!createBtn) {
      const byText = page.locator('button').filter({ hasText: /Создать|Добавить|Новая заявка|New/i }).first();
      if (await byText.isVisible({ timeout: 2000 }).catch(() => false)) {
        createBtn = byText;
        info('Create entity: found create button by text');
      }
    }

    // Try by + icon button (plus icon)
    if (!createBtn) {
      const plusBtns = await page.locator('button').all();
      for (const btn of plusBtns) {
        const svg = await btn.locator('svg').count();
        const text = await btn.textContent().catch(() => '');
        if (svg > 0 && text.trim() === '') {
          // Icon-only button, could be +
          const ariaLabel = await btn.getAttribute('aria-label') || '';
          if (ariaLabel.includes('создат') || ariaLabel.includes('добавит') || ariaLabel.includes('Создать')) {
            createBtn = btn;
            info('Create entity: found create button by aria-label');
            break;
          }
        }
      }
    }

    if (!createBtn) {
      warn('Create entity: no create/add button found on workspace page');
      await screenshot(page, '05-create-no-button');
      return;
    }

    await createBtn.click();
    await page.waitForTimeout(1500);

    // Check modal opened
    const modalVisible = await page.locator('[data-testid="create-entity-modal"]')
      .isVisible({ timeout: 5000 }).catch(() => false);

    if (!modalVisible) {
      const anyModal = await page.locator('[role="dialog"], [class*="modal"], [class*="Modal"]')
        .first().isVisible({ timeout: 2000 }).catch(() => false);
      if (anyModal) {
        warn('Create entity: modal opened but without data-testid="create-entity-modal"');
      } else {
        bug('Create entity: modal did NOT open after clicking create button');
        await screenshot(page, '05-create-modal-not-opened');
        return;
      }
    } else {
      ok('Create entity: modal opened');
    }

    await screenshot(page, '05-create-modal');

    // Check: Title input
    const titleInput = await page.locator('[data-testid="create-entity-title-input"], input[name="title"], input[placeholder*="назван"], input[placeholder*="тем"]')
      .first().isVisible({ timeout: 2000 }).catch(() => false);
    if (titleInput) {
      ok('Create entity: title input visible');

      // Type test text
      const input = page.locator('[data-testid="create-entity-title-input"], input[name="title"], input[placeholder*="назван"], input[placeholder*="тем"]').first();
      await input.fill('AUDIT TEST - can be deleted');
      await page.waitForTimeout(500);

      const value = await input.inputValue();
      if (value.includes('AUDIT TEST')) {
        ok('Create entity: title input accepts text');
      } else {
        bug('Create entity: title input did NOT accept text');
      }

      // Clear
      await input.fill('');
    } else {
      bug('Create entity: title input NOT found in modal');
    }

    // Check: Submit button
    const submitBtn = await page.locator('[data-testid="create-entity-submit"]')
      .first().isVisible({ timeout: 2000 }).catch(() => false);
    if (submitBtn) {
      ok('Create entity: submit button visible');

      // Check if disabled when empty
      const disabled = await page.locator('[data-testid="create-entity-submit"]').first().isDisabled();
      if (disabled) {
        ok('Create entity: submit button disabled when title is empty (good validation)');
      } else {
        info('Create entity: submit button is enabled even with empty title');
      }
    } else {
      const anySubmit = await page.locator('button[type="submit"], button').filter({ hasText: /Создать|Сохранить|Submit/i }).first()
        .isVisible({ timeout: 1000 }).catch(() => false);
      if (anySubmit) {
        warn('Create entity: submit button found by text but not by data-testid');
      } else {
        bug('Create entity: submit button NOT found');
      }
    }

    // Close modal (Escape or X button)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    const modalAfterEsc = await page.locator('[data-testid="create-entity-modal"]')
      .isVisible({ timeout: 1000 }).catch(() => false);
    if (!modalAfterEsc) {
      ok('Create entity: modal closed with Escape');
    } else {
      bug('Create entity: modal did NOT close with Escape key');
      // Try X button
      await page.locator('[data-testid="create-entity-modal"] button[aria-label*="закрыть"], [data-testid="create-entity-modal"] button[aria-label*="Закрыть"]').first().click().catch(() => {});
    }

    // Console errors
    const newErrors = consoleErrors.slice(errorsBefore);
    if (newErrors.length > 0) {
      warn(`Create entity: ${newErrors.length} console error(s)`);
    }
  } catch (e) {
    bug(`Create entity test crashed: ${e.message.slice(0, 200)}`);
  }
}

// ===== TEST 6: Chat Interactions =====
async function testChatInteractions(page, consoleErrors) {
  console.log('\n=== TEST 6: Chat Interactions ===');
  const errorsBefore = consoleErrors.length;

  try {
    await page.goto(`${BASE_URL}/chat`, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(2500);
    await screenshot(page, '06-chat-page');

    // Verify chat page loaded
    const chatPage = await page.locator('[data-testid="chat-page"]')
      .isVisible({ timeout: 5000 }).catch(() => false);
    if (!chatPage) {
      bug('Chat: chat page component not found');
      return;
    }
    ok('Chat: page loaded');

    // Find conversation list
    const conversationItems = await page.locator('[data-testid*="conversation-item"], [data-testid*="chat-conversation"]').all();

    if (conversationItems.length === 0) {
      // Try broader selector — clickable items in the left panel
      const leftPanelItems = await page.evaluate(() => {
        const items = document.querySelectorAll('[class*="conversation"], [class*="chat-list"] > div, aside div[class*="cursor-pointer"]');
        return items.length;
      });

      if (leftPanelItems === 0) {
        // Check for empty state
        const emptyState = await page.locator('[data-testid="chat-empty-state"]')
          .isVisible({ timeout: 1000 }).catch(() => false);
        if (emptyState) {
          info('Chat: empty state shown (no conversations)');
        } else {
          warn('Chat: no conversation items found in sidebar');
        }

        // Try to find conversations by text
        const anyConversation = await page.locator('div[class*="cursor-pointer"]').all();
        info(`Chat: found ${anyConversation.length} clickable div(s) that could be conversations`);

        if (anyConversation.length > 0) {
          await anyConversation[0].click();
          await page.waitForTimeout(2000);
        }
      }
    } else {
      info(`Chat: found ${conversationItems.length} conversation item(s)`);
      await conversationItems[0].click();
      await page.waitForTimeout(2000);
    }

    await screenshot(page, '06-chat-conversation');

    // Check if chat input is visible
    const chatInput = await page.locator('[data-testid="chat-input"]')
      .isVisible({ timeout: 3000 }).catch(() => false);

    if (chatInput) {
      ok('Chat: input area visible');

      // Find the textarea/contenteditable
      const textarea = page.locator('[data-testid="chat-input-textarea"]').first();
      const textareaVisible = await textarea.isVisible({ timeout: 2000 }).catch(() => false);

      if (textareaVisible) {
        // Try to type (but don't send)
        await textarea.click();
        await page.waitForTimeout(300);

        // Type test message
        await page.keyboard.type('Тестовое сообщение для аудита');
        await page.waitForTimeout(500);

        // Check if text was entered
        const inputContent = await textarea.textContent().catch(() => '');
        const inputValue = await textarea.inputValue().catch(() => '');
        const hasText = inputContent.includes('Тестовое') || inputValue.includes('Тестовое');

        if (hasText) {
          ok('Chat: text input works (typed and verified)');
        } else {
          // contentEditable might store differently
          const innerHtml = await textarea.evaluate(el => el.innerHTML).catch(() => '');
          if (innerHtml.includes('Тестовое')) {
            ok('Chat: text input works (contentEditable)');
          } else {
            warn('Chat: typed text but could not verify it was accepted');
          }
        }

        // Check send button appears
        const sendBtn = await page.locator('[data-testid="chat-send-btn"]')
          .isVisible({ timeout: 1000 }).catch(() => false);
        if (sendBtn) {
          ok('Chat: send button visible');
        } else {
          info('Chat: send button not visible (may appear only with text)');
        }

        // Clear the input — triple-click to select all, then delete
        await textarea.click({ clickCount: 3 });
        await page.keyboard.press('Backspace');

        await screenshot(page, '06-chat-input-typed');
      } else {
        warn('Chat: textarea/input not found inside chat-input');
      }
    } else {
      // Chat input not visible — maybe no conversation selected
      warn('Chat: input area NOT visible (no conversation selected?)');
    }

    // Console errors
    const newErrors = consoleErrors.slice(errorsBefore);
    if (newErrors.length > 0) {
      const unique = [...new Set(newErrors)];
      warn(`Chat: ${unique.length} unique console error(s):\n    ${unique.slice(0, 3).map(e => e.slice(0, 120)).join('\n    ')}`);
    } else {
      ok('Chat: no console errors');
    }
  } catch (e) {
    bug(`Chat test crashed: ${e.message.slice(0, 200)}`);
  }
}

// ===== TEST 7: Keyboard Shortcuts (Escape) =====
async function testKeyboardShortcuts(page, consoleErrors, token) {
  console.log('\n=== TEST 7: Keyboard Shortcuts ===');
  const errorsBefore = consoleErrors.length;

  try {
    let workspaces;
    try {
      workspaces = await apiGet('/api/workspaces', token);
    } catch (e) {
      warn(`Keyboard: failed to fetch workspaces (${e.message.slice(0, 60)}), re-authenticating...`);
      // Re-auth
      try {
        token = await getToken();
        workspaces = await apiGet('/api/workspaces', token);
      } catch (e2) {
        bug(`Keyboard: cannot get workspaces even after re-auth: ${e2.message.slice(0, 80)}`);
        return;
      }
    }
    if (!workspaces.length) {
      warn('Keyboard: no workspaces');
      return;
    }

    const ws = workspaces[0];
    await page.goto(`${BASE_URL}/workspace/${ws.id}`, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(2000);

    // Check if session expired (redirected to login)
    if (page.url().includes('/login')) {
      info('Keyboard: session expired, re-logging in...');
      const adminCard = page.locator('button, [role="button"], div[class*="cursor-pointer"]')
        .filter({ hasText: /youredik|Эдуард|Сарваров/i }).first();
      if (await adminCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        await adminCard.click();
        await page.waitForTimeout(3000);
        await page.goto(`${BASE_URL}/workspace/${ws.id}`, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(2000);
      }
    }

    // === Test 7a: Escape closes entity detail panel ===
    // Open detail panel — use dispatchEvent to bypass dnd-kit sortable
    const cardCount = await page.locator('[data-testid="kanban-card"]').count();
    if (cardCount > 0) {
      await page.locator('[data-testid="kanban-card"]').first().dispatchEvent('click');
      await page.waitForTimeout(1500);

      const panelOpen = await page.locator('[data-testid="entity-detail-panel"]')
        .isVisible({ timeout: 3000 }).catch(() => false);

      if (panelOpen) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);

        const panelAfterEsc = await page.locator('[data-testid="entity-detail-panel"]')
          .isVisible({ timeout: 1000 }).catch(() => false);

        if (!panelAfterEsc) {
          ok('Keyboard: Escape closes entity detail panel');
        } else {
          bug('Keyboard: Escape did NOT close entity detail panel');
        }
      } else {
        warn('Keyboard: could not open entity panel to test Escape');
      }
    } else {
      // Try table rows
      const rows = await page.locator('table tbody tr').all();
      if (rows.length > 0) {
        await rows[0].click({ timeout: 5000 });
        await page.waitForTimeout(1500);

        const panelOpen = await page.locator('[data-testid="entity-detail-panel"]')
          .isVisible({ timeout: 3000 }).catch(() => false);

        if (panelOpen) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(1000);

          const panelAfterEsc = await page.locator('[data-testid="entity-detail-panel"]')
            .isVisible({ timeout: 1000 }).catch(() => false);

          if (!panelAfterEsc) {
            ok('Keyboard: Escape closes entity detail panel');
          } else {
            bug('Keyboard: Escape did NOT close entity detail panel');
          }
        }
      } else {
        warn('Keyboard: no entity cards or table rows to click');
      }
    }

    // === Test 7b: Escape closes create entity modal ===
    const createBtn = page.locator('[data-testid="kanban-new-entity-button"]').first();
    if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(1500);

      const modalOpen = await page.locator('[data-testid="create-entity-modal"]')
        .isVisible({ timeout: 3000 }).catch(() => false);

      if (modalOpen) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);

        const modalAfterEsc = await page.locator('[data-testid="create-entity-modal"]')
          .isVisible({ timeout: 1000 }).catch(() => false);

        if (!modalAfterEsc) {
          ok('Keyboard: Escape closes create entity modal');
        } else {
          bug('Keyboard: Escape did NOT close create entity modal');
        }
      }
    }

    // Console errors
    const newErrors = consoleErrors.slice(errorsBefore);
    if (newErrors.length > 0) {
      warn(`Keyboard: ${newErrors.length} console error(s)`);
    }
  } catch (e) {
    bug(`Keyboard test crashed: ${e.message.slice(0, 200)}`);
  }
}

// ===== TEST 8: Dark Mode Toggle =====
async function testDarkModeToggle(page, consoleErrors) {
  console.log('\n=== TEST 8: Dark Mode Toggle ===');
  const errorsBefore = consoleErrors.length;

  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(2000);

    // Check if we got redirected to login (session expired)
    if (page.url().includes('/login')) {
      info('Dark mode: session expired, re-logging in...');
      const adminCard = page.locator('button, [role="button"], div[class*="cursor-pointer"]')
        .filter({ hasText: /youredik|Эдуард|Сарваров/i }).first();
      if (await adminCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        await adminCard.click();
        await page.waitForTimeout(3000);
      }
    }

    // Get initial theme state
    const initialDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    info(`Dark mode: initial state dark=${initialDark}`);

    // Find theme toggle button
    const themeToggle = page.locator('button[aria-label="Переключить тему"]').first();
    const toggleVisible = await themeToggle.isVisible({ timeout: 3000 }).catch(() => false);

    if (!toggleVisible) {
      // Try broader search
      const anyToggle = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const aria = btn.getAttribute('aria-label') || '';
          const title = btn.getAttribute('title') || '';
          if (aria.includes('тем') || title.includes('тем') || aria.includes('theme') || title.includes('theme')) {
            return true;
          }
        }
        return false;
      });

      if (!anyToggle) {
        warn('Dark mode: theme toggle button NOT found on dashboard');
        // Check profile page
        await page.goto(`${BASE_URL}/profile`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(1500);
        const profileToggle = page.locator('button[aria-label="Переключить тему"]').first();
        const profileVisible = await profileToggle.isVisible({ timeout: 2000 }).catch(() => false);
        if (profileVisible) {
          info('Dark mode: toggle found on /profile page instead of dashboard');
        } else {
          warn('Dark mode: toggle not found anywhere');
          return;
        }
      }
    }

    // Click theme toggle
    const toggle = page.locator('button[aria-label="Переключить тему"]').first();
    if (await toggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await toggle.click();
      await page.waitForTimeout(1000);
      await screenshot(page, '08-theme-dropdown');

      // A dropdown should appear with light/dark/system options
      const darkOption = page.locator('button[role="menuitem"]').filter({ hasText: /Тёмная|Dark/i }).first();
      const darkVisible = await darkOption.isVisible({ timeout: 2000 }).catch(() => false);

      if (darkVisible) {
        ok('Dark mode: theme dropdown opened with options');

        // Select dark theme if not already dark
        if (!initialDark) {
          await darkOption.click();
          await page.waitForTimeout(1000);

          const nowDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
          if (nowDark) {
            ok('Dark mode: switched to dark theme successfully');
          } else {
            bug('Dark mode: clicked "Тёмная" but page did not get dark class');
          }
          await screenshot(page, '08-dark-mode-on');

          // Switch back to light
          await toggle.click();
          await page.waitForTimeout(500);
          const lightOption = page.locator('button[role="menuitem"]').filter({ hasText: /Светлая|Light/i }).first();
          if (await lightOption.isVisible({ timeout: 1000 }).catch(() => false)) {
            await lightOption.click();
            await page.waitForTimeout(1000);
            const nowLight = await page.evaluate(() => !document.documentElement.classList.contains('dark'));
            if (nowLight) {
              ok('Dark mode: switched back to light theme');
            } else {
              warn('Dark mode: switched to light but dark class persists');
            }
          }
        } else {
          // Already dark, switch to light
          const lightOption = page.locator('button[role="menuitem"]').filter({ hasText: /Светлая|Light/i }).first();
          if (await lightOption.isVisible({ timeout: 1000 }).catch(() => false)) {
            await lightOption.click();
            await page.waitForTimeout(1000);
            const nowLight = await page.evaluate(() => !document.documentElement.classList.contains('dark'));
            if (nowLight) {
              ok('Dark mode: switched to light theme');
            } else {
              bug('Dark mode: clicked "Светлая" but dark class persists');
            }
            await screenshot(page, '08-light-mode-on');

            // Switch back
            await toggle.click();
            await page.waitForTimeout(500);
            const darkOpt2 = page.locator('button[role="menuitem"]').filter({ hasText: /Тёмная|Dark/i }).first();
            if (await darkOpt2.isVisible({ timeout: 1000 }).catch(() => false)) {
              await darkOpt2.click();
              await page.waitForTimeout(500);
            }
          }
        }
      } else {
        // Maybe it's a direct toggle, not a dropdown
        const afterToggle = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        if (afterToggle !== initialDark) {
          ok('Dark mode: direct toggle switched theme');
          await screenshot(page, '08-theme-toggled');
          // Toggle back
          await toggle.click();
        } else {
          warn('Dark mode: clicking toggle did not change theme or open dropdown');
        }
      }
    }

    await screenshot(page, '08-theme-final');

    // Console errors
    const newErrors = consoleErrors.slice(errorsBefore);
    if (newErrors.length > 0) {
      warn(`Dark mode: ${newErrors.length} console error(s)`);
    } else {
      ok('Dark mode: no console errors');
    }
  } catch (e) {
    bug(`Dark mode test crashed: ${e.message.slice(0, 200)}`);
  }
}

// ===== MAIN =====
async function main() {
  console.log('=================================================');
  console.log('  STANKOFF PORTAL — DEEP UI AUDIT');
  console.log('  ' + new Date().toISOString());
  console.log('=================================================');

  // Pre-check: server available?
  try {
    const healthRes = await fetch(`${API_URL}/api/health`, { timeout: 5000 });
    if (healthRes.ok) {
      console.log(`\nBackend health: OK (${API_URL})`);
    } else {
      console.log(`\nBackend health: ${healthRes.status}`);
    }
  } catch (e) {
    console.error(`\nERROR: Backend not reachable at ${API_URL}: ${e.message}`);
    console.error('Make sure the dev server is running: npm run dev');
    process.exit(1);
  }

  try {
    const frontRes = await fetch(`${BASE_URL}`, { timeout: 10000 });
    console.log(`Frontend: ${frontRes.ok ? 'OK' : frontRes.status} (${BASE_URL})`);
  } catch (e) {
    console.error(`\nERROR: Frontend not reachable at ${BASE_URL}: ${e.message}`);
    process.exit(1);
  }

  // Auth token for API calls
  let token;
  try {
    token = await getToken();
    console.log('Auth token: OK');
  } catch (e) {
    console.error(`Auth failed: ${e.message}`);
    process.exit(1);
  }

  // Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
  });

  const page = await context.newPage();
  const consoleErrors = [];
  const consoleWarnings = [];

  // Collect console messages
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      if (!text.includes('favicon') && !text.includes('DevTools') && !text.includes('third-party cookie') && !text.includes('__nextjs')) {
        consoleErrors.push(text);
      }
    }
    if (msg.type() === 'warning') {
      consoleWarnings.push(text);
    }
  });

  page.on('requestfailed', req => {
    const url = req.url();
    if (!url.includes('favicon') && !url.includes('.hot-update.') && !url.includes('__nextjs')) {
      consoleErrors.push(`[NET FAIL] ${req.failure()?.errorText}: ${url}`);
    }
  });

  page.on('response', res => {
    if (res.status() >= 500) {
      consoleErrors.push(`[HTTP ${res.status()}] ${res.url().replace(BASE_URL, '')}`);
    }
  });

  // ===== RUN ALL TESTS =====
  const loginOk = await testLoginFlow(page, consoleErrors);

  if (!loginOk) {
    // Try fallback login
    console.log('\n  Attempting fallback login via API...');
    try {
      await page.evaluate(async (apiUrl) => {
        const res = await fetch(apiUrl + '/api/auth/dev/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'youredik@gmail.com' }),
          credentials: 'include',
        });
        const data = await res.json();
        if (data.accessToken) {
          document.cookie = `access_token=${data.accessToken}; path=/`;
          localStorage.setItem('auth-storage', JSON.stringify({ state: { accessToken: data.accessToken }, version: 0 }));
        }
      }, API_URL);
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 20000 });
      console.log('  Fallback login OK: ' + page.url());
    } catch (e) {
      console.error('  Fallback login FAILED:', e.message);
      await browser.close();
      process.exit(1);
    }
  }

  await testDashboard(page, consoleErrors);
  await testSidebarNavigation(page, consoleErrors);
  await testEntityDetailPanel(page, consoleErrors, token);
  await testCreateEntityModal(page, consoleErrors, token);
  await testChatInteractions(page, consoleErrors);
  await testKeyboardShortcuts(page, consoleErrors, token);
  await testDarkModeToggle(page, consoleErrors);

  await browser.close();

  // ===== REPORT =====
  console.log('\n=================================================');
  console.log('  AUDIT REPORT');
  console.log('=================================================\n');

  console.log(`BUGS (${findings.bugs.length}):`);
  if (findings.bugs.length === 0) {
    console.log('  None found!\n');
  } else {
    findings.bugs.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
    console.log('');
  }

  console.log(`WARNINGS (${findings.warnings.length}):`);
  if (findings.warnings.length === 0) {
    console.log('  None!\n');
  } else {
    findings.warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
    console.log('');
  }

  console.log(`OK (${findings.ok.length}):`);
  findings.ok.forEach((o, i) => console.log(`  ${i + 1}. ${o}`));
  console.log('');

  console.log(`INFO (${findings.info.length}):`);
  findings.info.forEach((inf, i) => console.log(`  ${i + 1}. ${inf}`));
  console.log('');

  console.log(`Total console errors collected: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    const unique = [...new Set(consoleErrors)].slice(0, 20);
    console.log('Unique console errors:');
    unique.forEach((e, i) => console.log(`  ${i + 1}. ${e.slice(0, 200)}`));
  }

  // Save results
  const result = {
    timestamp: new Date().toISOString(),
    findings,
    totalConsoleErrors: consoleErrors.length,
    uniqueConsoleErrors: [...new Set(consoleErrors)].slice(0, 50),
    consoleWarnings: [...new Set(consoleWarnings)].slice(0, 20),
  };

  writeFileSync(
    join(SCREENSHOT_DIR, 'audit-ui-deep-result.json'),
    JSON.stringify(result, null, 2)
  );

  console.log(`\nScreenshots saved to: ${SCREENSHOT_DIR}`);
  console.log(`Results JSON: ${join(SCREENSHOT_DIR, 'audit-ui-deep-result.json')}`);

  // Exit code based on bugs found
  if (findings.bugs.length > 0) {
    console.log(`\nAudit completed with ${findings.bugs.length} BUG(s) found.`);
    process.exit(1);
  } else {
    console.log('\nAudit completed: no bugs found.');
    process.exit(0);
  }
}

main().catch(e => {
  console.error('Audit CRASHED:', e);
  process.exit(1);
});
