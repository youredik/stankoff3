#!/usr/bin/env node
/**
 * Automated Portal Audit Script
 * Crawls all pages, captures console errors, takes screenshots, reports to Telegram
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3001';
const ADMIN_EMAIL = 'youredik@gmail.com';
const TELEGRAM_BOT_TOKEN = '8348144949:AAGDa1aonbzNrlZFMM-2JzH1KOfdYgyRUVw';
const TELEGRAM_CHAT_ID = '30843047';
const SCREENSHOT_DIR = join(process.cwd(), 'audit-screenshots');

// All routes to audit
const ROUTES = [
  { path: '/login', name: 'Login', auth: false },
  { path: '/dashboard', name: 'Dashboard', auth: true },
  { path: '/workspace', name: 'Workspace List', auth: true },
  { path: '/tasks', name: 'Tasks Inbox', auth: true },
  { path: '/chat', name: 'Chat', auth: true },
  { path: '/knowledge-base', name: 'Knowledge Base', auth: true },
  { path: '/admin/users', name: 'Admin Users', auth: true },
  { path: '/admin/roles', name: 'Admin Roles', auth: true },
  { path: '/admin/invitations', name: 'Admin Invitations', auth: true },
];

const issues = [];
const warnings = [];

async function sendTelegram(message) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });
  } catch (e) {
    console.error('Telegram send failed:', e.message);
  }
}

async function sendTelegramPhoto(photoPath, caption) {
  try {
    const FormData = (await import('undici')).FormData;
    const formData = new FormData();
    const fileBuffer = readFileSync(photoPath);
    const blob = new Blob([fileBuffer], { type: 'image/png' });
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('photo', blob, 'screenshot.png');
    if (caption) formData.append('caption', caption.slice(0, 1024));

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      body: formData,
    });
  } catch (e) {
    console.error('Telegram photo send failed:', e.message);
  }
}

async function getDevToken() {
  const res = await fetch(`${API_URL}/api/auth/dev/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL }),
  });
  const data = await res.json();
  return data.accessToken;
}

async function getWorkspaces(token) {
  const res = await fetch(`${API_URL}/api/workspaces`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function auditPage(page, route, consoleErrors) {
  const pageIssues = [];
  const pageWarnings = [];

  console.log(`\n📄 Auditing: ${route.name} (${route.path})`);

  // Collect console errors for this page
  const errorsBefore = consoleErrors.length;

  try {
    const response = await page.goto(`${BASE_URL}${route.path}`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Check HTTP status
    if (response && response.status() >= 400) {
      pageIssues.push(`HTTP ${response.status()} on ${route.path}`);
    }

    // Wait for page to settle
    await page.waitForTimeout(2000);

    // Check for error boundaries / error screens
    const errorBoundary = await page.locator('text=/error|ошибка|что-то пошло не так/i').first().isVisible({ timeout: 1000 }).catch(() => false);
    if (errorBoundary) {
      const errorText = await page.locator('text=/error|ошибка|что-то пошло не так/i').first().textContent().catch(() => 'Unknown error');
      pageIssues.push(`Error boundary visible: "${errorText.trim().slice(0, 100)}"`);
    }

    // Check for empty state / loading stuck
    const loadingSpinner = await page.locator('[class*="animate-spin"], [class*="loading"], [data-testid="loading"]').first().isVisible({ timeout: 1000 }).catch(() => false);
    if (loadingSpinner) {
      pageWarnings.push(`Loading spinner still visible after 2s on ${route.path}`);
    }

    // Check for broken images
    const brokenImages = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      const broken = [];
      images.forEach(img => {
        if (img.naturalWidth === 0 && img.src && !img.src.includes('data:')) {
          broken.push(img.src);
        }
      });
      return broken;
    });
    if (brokenImages.length > 0) {
      pageIssues.push(`Broken images (${brokenImages.length}): ${brokenImages.slice(0, 3).join(', ')}`);
    }

    // Check for 404 network requests
    // (already captured via response event in main)

    // Check for accessibility issues - missing alt on images
    const imgWithoutAlt = await page.evaluate(() => {
      return document.querySelectorAll('img:not([alt])').length;
    });
    if (imgWithoutAlt > 0) {
      pageWarnings.push(`${imgWithoutAlt} images without alt attribute`);
    }

    // Check for buttons without accessible text
    const emptyButtons = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      let count = 0;
      buttons.forEach(btn => {
        const text = btn.textContent?.trim();
        const ariaLabel = btn.getAttribute('aria-label');
        const title = btn.getAttribute('title');
        if (!text && !ariaLabel && !title) count++;
      });
      return count;
    });
    if (emptyButtons > 0) {
      pageWarnings.push(`${emptyButtons} buttons without accessible text`);
    }

    // Check for overlapping elements / z-index issues
    const viewport = page.viewportSize();
    const overflowX = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    if (overflowX) {
      pageWarnings.push(`Horizontal overflow detected on ${route.path}`);
    }

    // Take screenshot
    const screenshotPath = join(SCREENSHOT_DIR, `${route.name.replace(/\s+/g, '-').toLowerCase()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // Console errors for this page
    const newErrors = consoleErrors.slice(errorsBefore);
    if (newErrors.length > 0) {
      pageIssues.push(`Console errors (${newErrors.length}): ${newErrors.slice(0, 3).map(e => e.slice(0, 100)).join('; ')}`);
    }

  } catch (e) {
    pageIssues.push(`Page load failed: ${e.message.slice(0, 200)}`);
  }

  return { issues: pageIssues, warnings: pageWarnings };
}

async function auditWorkspacePage(page, workspace, consoleErrors) {
  const pageIssues = [];
  const pageWarnings = [];
  const errorsBefore = consoleErrors.length;

  console.log(`\n📋 Auditing workspace: ${workspace.name} (${workspace.id})`);

  try {
    await page.goto(`${BASE_URL}/workspace/${workspace.id}`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await page.waitForTimeout(3000);

    // Check kanban view loaded
    const kanbanVisible = await page.locator('[data-testid="kanban-board"], [data-testid="kanban-column"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const tableVisible = await page.locator('[data-testid="table-view"], table').first().isVisible({ timeout: 2000 }).catch(() => false);

    if (!kanbanVisible && !tableVisible) {
      const errorOnPage = await page.locator('text=/error|ошибка/i').first().isVisible({ timeout: 1000 }).catch(() => false);
      if (errorOnPage) {
        pageIssues.push(`Workspace "${workspace.name}" shows error instead of board/table`);
      } else {
        pageWarnings.push(`Workspace "${workspace.name}": no kanban or table visible`);
      }
    }

    // Screenshot
    const screenshotPath = join(SCREENSHOT_DIR, `workspace-${workspace.prefix?.toLowerCase() || workspace.id.slice(0, 8)}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // Check settings page
    await page.goto(`${BASE_URL}/workspace/${workspace.id}/settings`, {
      waitUntil: 'networkidle',
      timeout: 20000,
    });
    await page.waitForTimeout(1500);

    const settingsError = await page.locator('text=/error|ошибка|403|forbidden/i').first().isVisible({ timeout: 1000 }).catch(() => false);
    if (settingsError) {
      pageIssues.push(`Workspace "${workspace.name}" settings page has error`);
    }

    // Console errors
    const newErrors = consoleErrors.slice(errorsBefore);
    if (newErrors.length > 0) {
      pageIssues.push(`Console errors in workspace "${workspace.name}" (${newErrors.length}): ${newErrors.slice(0, 2).map(e => e.slice(0, 100)).join('; ')}`);
    }

  } catch (e) {
    pageIssues.push(`Workspace "${workspace.name}" failed: ${e.message.slice(0, 200)}`);
  }

  return { issues: pageIssues, warnings: pageWarnings };
}

async function auditInteractions(page, consoleErrors) {
  const pageIssues = [];
  const pageWarnings = [];
  const errorsBefore = consoleErrors.length;

  console.log('\n🖱️ Auditing interactions...');

  try {
    // Go to dashboard
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);

    // Test sidebar navigation
    const sidebarLinks = await page.locator('[data-testid="sidebar"] a, [data-testid="sidebar"] button').all();
    console.log(`  Found ${sidebarLinks.length} sidebar elements`);

    // Test clicking sidebar items
    for (const link of sidebarLinks.slice(0, 10)) {
      try {
        const text = await link.textContent().catch(() => '');
        const isVisible = await link.isVisible().catch(() => false);
        if (isVisible && text.trim()) {
          // Don't actually click - just check it's interactable
          const isEnabled = await link.isEnabled().catch(() => false);
          if (!isEnabled) {
            pageWarnings.push(`Sidebar item "${text.trim().slice(0, 30)}" is disabled`);
          }
        }
      } catch (e) { /* skip */ }
    }

    // Test workspace selection
    await page.goto(`${BASE_URL}/workspace`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);

    const workspaceCards = await page.locator('[data-testid*="workspace-card"], [data-testid*="workspace-item"]').all();
    if (workspaceCards.length === 0) {
      // Try generic card selectors
      const anyCards = await page.locator('.cursor-pointer').all();
      console.log(`  Workspace cards: ${workspaceCards.length} (generic clickable: ${anyCards.length})`);
    } else {
      console.log(`  Workspace cards found: ${workspaceCards.length}`);
    }

    // Console errors
    const newErrors = consoleErrors.slice(errorsBefore);
    if (newErrors.length > 0) {
      pageIssues.push(`Console errors during interactions (${newErrors.length}): ${newErrors.slice(0, 3).map(e => e.slice(0, 100)).join('; ')}`);
    }

  } catch (e) {
    pageIssues.push(`Interaction audit failed: ${e.message.slice(0, 200)}`);
  }

  return { issues: pageIssues, warnings: pageWarnings };
}

async function main() {
  console.log('🤖 Stankoff Portal Audit Starting...\n');
  await sendTelegram('🔍 <b>Начинаю полный аудит портала</b>\n\nМаршруты: ' + ROUTES.length + '\n+ все workspaces\n+ проверка интерактивности');

  // Create screenshot dir
  if (!existsSync(SCREENSHOT_DIR)) {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  // Get auth token
  let token;
  try {
    token = await getDevToken();
    console.log('✅ Auth token obtained');
  } catch (e) {
    const msg = `❌ Failed to get auth token: ${e.message}`;
    console.error(msg);
    await sendTelegram(msg);
    process.exit(1);
  }

  // Get workspaces
  let workspaces = [];
  try {
    workspaces = await getWorkspaces(token);
    console.log(`✅ Found ${workspaces.length} workspaces`);
  } catch (e) {
    warnings.push(`Failed to get workspaces: ${e.message}`);
  }

  // Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
  });

  // Set auth token in localStorage via page
  const setupPage = await context.newPage();
  await setupPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });

  // Login through UI
  try {
    await setupPage.waitForTimeout(2000);
    // Click on admin user card
    const adminCard = setupPage.locator('button, [role="button"]').filter({ hasText: /youredik|Эдуард|Сарваров/i }).first();
    const cardVisible = await adminCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (cardVisible) {
      await adminCard.click();
      await setupPage.waitForURL('**/dashboard', { timeout: 15000 }).catch(() => {});
      console.log('✅ Logged in via UI');
    } else {
      // Fallback: inject token via API and cookies
      console.log('⚠️ Admin card not found, trying API login...');
      await setupPage.evaluate(async (apiUrl) => {
        const res = await fetch(apiUrl + '/api/auth/dev/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'youredik@gmail.com' }),
          credentials: 'include',
        });
        const data = await res.json();
        if (data.accessToken) {
          localStorage.setItem('auth-storage', JSON.stringify({
            state: { accessToken: data.accessToken },
            version: 0,
          }));
        }
      }, API_URL);
      await setupPage.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 20000 });
      console.log('✅ Logged in via API fallback');
    }
  } catch (e) {
    console.error('❌ Login failed:', e.message);
    await sendTelegram(`❌ Не удалось авторизоваться: ${e.message.slice(0, 200)}`);
  }
  await setupPage.close();

  // Open main audit page
  const page = await context.newPage();
  const consoleErrors = [];
  const networkErrors = [];

  // Listen for console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Filter out known noise
      if (!text.includes('favicon') && !text.includes('DevTools') && !text.includes('third-party cookie')) {
        consoleErrors.push(text);
      }
    }
  });

  // Listen for failed network requests
  page.on('requestfailed', request => {
    const url = request.url();
    if (!url.includes('favicon') && !url.includes('.hot-update.') && !url.includes('__nextjs')) {
      networkErrors.push(`${request.failure()?.errorText}: ${url}`);
    }
  });

  // Audit all main routes
  await sendTelegram('📄 <b>Проверяю основные страницы...</b>');

  for (const route of ROUTES) {
    const result = await auditPage(page, route, consoleErrors);
    issues.push(...result.issues);
    warnings.push(...result.warnings);
  }

  // Audit workspaces
  if (workspaces.length > 0) {
    await sendTelegram(`📋 <b>Проверяю ${workspaces.length} workspaces...</b>`);

    for (const ws of workspaces) {
      const result = await auditWorkspacePage(page, ws, consoleErrors);
      issues.push(...result.issues);
      warnings.push(...result.warnings);
    }
  }

  // Audit interactions
  await sendTelegram('🖱️ <b>Проверяю интерактивность...</b>');
  const interactionResult = await auditInteractions(page, consoleErrors);
  issues.push(...interactionResult.issues);
  warnings.push(...interactionResult.warnings);

  // Network errors summary
  if (networkErrors.length > 0) {
    issues.push(`Network failures (${networkErrors.length}): ${networkErrors.slice(0, 5).join('; ')}`);
  }

  // Close browser
  await browser.close();

  // Compile report
  const report = [];
  report.push('📊 <b>ОТЧЁТ АУДИТА ПОРТАЛА STANKOFF</b>\n');
  report.push(`Проверено маршрутов: ${ROUTES.length}`);
  report.push(`Проверено workspaces: ${workspaces.length}`);
  report.push(`Всего console errors: ${consoleErrors.length}`);
  report.push(`Всего network errors: ${networkErrors.length}`);
  report.push('');

  if (issues.length > 0) {
    report.push(`❌ <b>ПРОБЛЕМЫ (${issues.length}):</b>`);
    issues.forEach((issue, i) => {
      report.push(`${i + 1}. ${issue}`);
    });
    report.push('');
  } else {
    report.push('✅ <b>Критических проблем не найдено!</b>\n');
  }

  if (warnings.length > 0) {
    report.push(`⚠️ <b>ПРЕДУПРЕЖДЕНИЯ (${warnings.length}):</b>`);
    warnings.forEach((w, i) => {
      report.push(`${i + 1}. ${w}`);
    });
  }

  const reportText = report.join('\n');
  console.log('\n' + reportText.replace(/<[^>]+>/g, ''));

  // Save report
  writeFileSync(join(SCREENSHOT_DIR, 'report.txt'), reportText.replace(/<[^>]+>/g, ''));

  // Send to Telegram (split if too long)
  const maxLen = 4000;
  if (reportText.length <= maxLen) {
    await sendTelegram(reportText);
  } else {
    const parts = [];
    let current = '';
    for (const line of report) {
      if ((current + '\n' + line).length > maxLen) {
        parts.push(current);
        current = line;
      } else {
        current += (current ? '\n' : '') + line;
      }
    }
    if (current) parts.push(current);
    for (const part of parts) {
      await sendTelegram(part);
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Save issues for programmatic access
  const resultJson = { issues, warnings, consoleErrors: consoleErrors.slice(0, 50), networkErrors: networkErrors.slice(0, 50), timestamp: new Date().toISOString() };
  writeFileSync(join(SCREENSHOT_DIR, 'audit-result.json'), JSON.stringify(resultJson, null, 2));
  console.log(`\n📁 Screenshots and report saved to: ${SCREENSHOT_DIR}`);

  return resultJson;
}

main().catch(e => {
  console.error('Audit failed:', e);
  sendTelegram(`💥 Аудит упал: ${e.message}`);
  process.exit(1);
});
