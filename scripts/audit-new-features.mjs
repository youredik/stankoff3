#!/usr/bin/env node
/**
 * Audit script for new features:
 * 1. Dashboard page — KPIs, task/SLA summary, workspace breakdown
 * 2. Notification Preferences — granular per-type toggles + DND
 * 3. Sidebar Dashboard link
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3001';
const ADMIN_EMAIL = 'youredik@gmail.com';
const TELEGRAM_BOT_TOKEN = '8348144949:AAGDa1aonbzNrlZFMM-2JzH1KOfdYgyRUVw';
const TELEGRAM_CHAT_ID = '30843047';
const SCREENSHOT_DIR = join(process.cwd(), 'audit-screenshots');

if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

const results = [];
let passed = 0;
let failed = 0;

function check(name, ok, details = '') {
  const status = ok ? '✅' : '❌';
  results.push({ name, ok, details });
  if (ok) passed++;
  else failed++;
  console.log(`${status} ${name}${details ? ` — ${details}` : ''}`);
}

async function sendTelegram(message) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }),
    });
  } catch (e) { console.error('TG fail:', e.message); }
}

async function getToken() {
  const res = await fetch(`${API_URL}/api/auth/dev/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL }),
  });
  return (await res.json()).accessToken;
}

async function apiGet(path, token) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

async function apiPatch(path, body, token) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// ===== MAIN =====

async function main() {
  console.log('\n🔍 Аудит новых фич — Dashboard, Notification Preferences, Sidebar\n');

  const token = await getToken();
  check('API: dev login', !!token);

  // ─── 1. API: Notification Preferences ──────────
  console.log('\n📬 Notification Preferences (API)\n');

  // Get current profile
  const profile = await apiGet('/api/auth/me', token);
  check('API: GET /auth/me', !!profile.id, `userId=${profile.id}`);

  // Update notification preferences
  const testPrefs = {
    taskReminder: true,
    taskOverdue: true,
    entityCreated: false,
    commentReceived: true,
    mentionReceived: true,
    statusChanged: false,
    slaWarning: true,
    slaBreach: true,
    chatMessage: true,
    aiSuggestion: false,
    dndEnabled: true,
    dndStartHour: 22,
    dndEndHour: 8,
  };

  const updateResult = await apiPatch('/api/auth/me', { notificationPreferences: testPrefs }, token);
  check('API: PATCH /auth/me notificationPreferences', updateResult.status === 200);

  // Verify saved
  const updatedProfile = await apiGet('/api/auth/me', token);
  const savedPrefs = updatedProfile.notificationPreferences;
  check('API: Preferences saved correctly',
    savedPrefs?.taskReminder === true && savedPrefs?.entityCreated === false && savedPrefs?.dndEnabled === true,
    savedPrefs ? `dndStartHour=${savedPrefs.dndStartHour}, dndEndHour=${savedPrefs.dndEndHour}` : 'null'
  );

  // Reset to defaults (null)
  const resetResult = await apiPatch('/api/auth/me', { notificationPreferences: {} }, token);
  check('API: Reset preferences to empty', resetResult.status === 200);

  // ─── 2. Browser: Dashboard ──────────
  console.log('\n📊 Dashboard (Browser)\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
  const page = await context.newPage();

  // Login via dev API + localStorage
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Try clicking admin card first
  const adminCard = page.locator('button, [role="button"], div[class*="cursor-pointer"]')
    .filter({ hasText: /youredik|Эдуард|Сарваров/i }).first();
  const cardVisible = await adminCard.isVisible({ timeout: 5000 }).catch(() => false);

  if (cardVisible) {
    await adminCard.click();
    await page.waitForURL('**/dashboard**', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  // If still on login, fallback to API login + localStorage
  if (!page.url().includes('/dashboard')) {
    await page.evaluate(async (apiUrl) => {
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
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
  }

  check('Browser: Login successful', page.url().includes('/dashboard'));

  // Dashboard page
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000); // Wait for all API calls to complete

  // Check KPI cards
  const pageContent = await page.textContent('body');
  check('Dashboard: Page loaded', pageContent.includes('Дашборд') || pageContent.includes('дашборд') || pageContent.includes('Dashboard'));

  // Check for KPI sections
  const hasInbox = pageContent.includes('Мои задачи') || pageContent.includes('Входящие');
  const hasOverdue = pageContent.includes('Просрочено') || pageContent.includes('просроч');
  const hasProcesses = pageContent.includes('Активных процесс') || pageContent.includes('процесс');
  const hasSla = pageContent.includes('SLA');
  check('Dashboard: KPI cards present', hasInbox || hasOverdue || hasProcesses || hasSla,
    `inbox=${hasInbox}, overdue=${hasOverdue}, processes=${hasProcesses}, sla=${hasSla}`);

  // Screenshot
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'dashboard-new.png'), fullPage: true });
  check('Dashboard: Screenshot saved', true);

  // Check for no console errors
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.reload({ waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);
  check('Dashboard: No console errors', errors.length === 0, errors.length > 0 ? errors[0] : '');

  // ─── 3. Browser: Sidebar Dashboard link ──────────
  console.log('\n🔗 Sidebar Dashboard Link\n');

  // Check sidebar - look for the dashboard button or the sidebar itself
  const sidebar = page.locator('[data-testid="sidebar"]');
  const sidebarVisible = await sidebar.isVisible({ timeout: 3000 }).catch(() => false);

  if (!sidebarVisible) {
    // Try to find and click hamburger/menu button to open sidebar
    const menuBtn = page.locator('button[aria-label*="Меню"], button[aria-label*="меню"], button[aria-label*="menu"]').first();
    const menuVisible = await menuBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (menuVisible) {
      await menuBtn.click();
      await page.waitForTimeout(1000);
    }
  }

  const dashboardButton = page.locator('[data-testid="sidebar-dashboard-button"]');
  const dashVisible = await dashboardButton.isVisible({ timeout: 5000 }).catch(() => false);

  // If still not visible, sidebar might be an overlay — look for text "Дашборд" in any nav button
  if (!dashVisible) {
    const altButton = page.locator('button:has-text("Дашборд"), a:has-text("Дашборд")').first();
    const altVisible = await altButton.isVisible({ timeout: 3000 }).catch(() => false);
    check('Sidebar: Dashboard button visible', altVisible, altVisible ? 'found by text' : 'not found');
  } else {
    check('Sidebar: Dashboard button visible', true, 'found by data-testid');
    await dashboardButton.click();
    await page.waitForTimeout(1000);
    check('Sidebar: Dashboard button navigates to /dashboard', page.url().includes('/dashboard'));
  }

  // ─── 4. Browser: Profile Notification Preferences ──────────
  console.log('\n⚙️ Profile Notification Preferences (Browser)\n');

  await page.goto(`${BASE_URL}/profile`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  const profileContent = await page.textContent('body');

  // Check notification type labels
  const hasTaskReminder = profileContent.includes('Напоминания о задачах');
  const hasTaskOverdue = profileContent.includes('Просроченные задачи');
  const hasEntityCreated = profileContent.includes('Новые заявки');
  const hasComments = profileContent.includes('Комментарии');
  const hasMentions = profileContent.includes('Упоминания');
  const hasDnd = profileContent.includes('Не беспокоить');

  check('Profile: Notification type toggles visible',
    hasTaskReminder && hasTaskOverdue && hasEntityCreated,
    `reminder=${hasTaskReminder}, overdue=${hasTaskOverdue}, entities=${hasEntityCreated}, comments=${hasComments}, mentions=${hasMentions}, dnd=${hasDnd}`
  );

  // Screenshot profile
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'profile-notifications.png'), fullPage: true });
  check('Profile: Screenshot saved', true);

  // Toggle DND
  const dndToggle = page.locator('button[role="switch"][aria-label="Не беспокоить"]');
  const dndExists = await dndToggle.isVisible({ timeout: 3000 }).catch(() => false);
  check('Profile: DND toggle exists', dndExists);

  if (dndExists) {
    await dndToggle.click();
    await page.waitForTimeout(1000);

    // Check that time selectors appear
    const timeSelector = page.locator('select[aria-label="Начало тихого режима"]');
    const timeExists = await timeSelector.isVisible({ timeout: 3000 }).catch(() => false);
    check('Profile: DND time selectors appear after toggle', timeExists);

    // Toggle back
    await dndToggle.click();
    await page.waitForTimeout(500);
  }

  // ─── 5. Browser: Mobile responsive ──────────
  console.log('\n📱 Mobile Responsive\n');

  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: join(SCREENSHOT_DIR, 'dashboard-mobile.png'), fullPage: true });
  check('Mobile: Dashboard screenshot', true);

  await browser.close();

  // ─── RESULTS ──────────
  console.log('\n' + '═'.repeat(60));
  console.log(`\n📋 Результат: ${passed} пройдено, ${failed} провалено из ${passed + failed}\n`);

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    passed,
    failed,
    total: passed + failed,
    results: results.map(r => ({ name: r.name, status: r.ok ? 'PASS' : 'FAIL', details: r.details })),
  };
  writeFileSync(join(SCREENSHOT_DIR, 'audit-new-features.json'), JSON.stringify(report, null, 2));

  // Telegram
  const statusEmoji = failed === 0 ? '✅' : '⚠️';
  await sendTelegram(
    `${statusEmoji} <b>Аудит новых фич</b>\n\n` +
    `Dashboard: ${results.filter(r => r.name.startsWith('Dashboard')).every(r => r.ok) ? '✅' : '❌'}\n` +
    `Notification Prefs: ${results.filter(r => r.name.includes('Notification') || r.name.includes('Profile')).every(r => r.ok) ? '✅' : '❌'}\n` +
    `Sidebar: ${results.filter(r => r.name.startsWith('Sidebar')).every(r => r.ok) ? '✅' : '❌'}\n\n` +
    `Пройдено: ${passed}/${passed + failed}`
  );

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
