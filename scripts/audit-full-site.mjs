/**
 * Full site audit — Stankoff Portal v6
 * Key fix: after login, extract access_token and use it for API calls + inject before navigation
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE = 'http://localhost:3000';
const SCREENSHOTS_DIR = join(import.meta.dirname, '..', 'audit-screenshots');
const RESULTS_FILE = join(SCREENSHOTS_DIR, 'audit-full-result.json');
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const results = [];

function statusIcon(s) {
  return { ok: 'OK', warning: 'WARN', error: 'FAIL', redirect_to_login: 'REDIR', navigation_error: 'NAV_ERR' }[s] || '??';
}

async function testPage(page, route, label) {
  const safeName = route.replace(/\//g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'root';
  const result = {
    page: label, url: `${BASE}${route}`, status: 'ok',
    consoleErrors: [], consoleWarnings: [], networkErrors: [],
    screenshot: `audit${safeName}.png`, loadTimeMs: 0,
  };

  const errors = []; const warnings = []; const netErrors = [];
  const onC = m => { const t = m.text(); if (/DevTools|HMR|Turbopack|webpack|Fast Refresh/.test(t)) return; if (m.type() === 'error') errors.push(t.substring(0, 500)); else if (m.type() === 'warning') warnings.push(t.substring(0, 500)); };
  const onR = r => { const s = r.status(); const u = r.url(); if (u.includes('_next/') || u.includes('favicon') || u.includes('.woff') || u.includes('.svg')) return; if (s >= 400) netErrors.push({ status: s, url: u.substring(0, 300) }); };
  const onP = e => errors.push(`[PageError] ${e.message.substring(0, 500)}`);
  page.on('console', onC); page.on('response', onR); page.on('pageerror', onP);

  const t0 = Date.now();
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(2000);
    result.loadTimeMs = Date.now() - t0;

    if (page.url().includes('/login') && !route.includes('/login')) {
      result.status = 'redirect_to_login';
    }

    await page.screenshot({ path: join(SCREENSHOTS_DIR, result.screenshot), fullPage: false });
  } catch (err) {
    result.status = 'navigation_error';
    result.loadTimeMs = Date.now() - t0;
    errors.push(`[NavigationError] ${err.message.substring(0, 500)}`);
    try { await page.screenshot({ path: join(SCREENSHOTS_DIR, result.screenshot) }); } catch {}
  }

  page.removeListener('console', onC); page.removeListener('response', onR); page.removeListener('pageerror', onP);
  result.consoleErrors = errors; result.consoleWarnings = warnings; result.networkErrors = netErrors;

  if (result.status === 'ok') {
    if (netErrors.some(e => e.status >= 500)) result.status = 'error';
    else if (errors.length > 0) result.status = 'warning';
  }

  results.push(result);
  return result;
}

async function main() {
  console.log('=== Stankoff Portal Full Audit v6 ===\n');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
  const page = await context.newPage();

  // ── 1. LOGIN PAGE ──
  console.log('1. Login page (unauthenticated)...');
  {
    const r = await testPage(page, '/login', 'Login (unauthenticated)');
    const allExpected = r.networkErrors.every(e => e.status === 401);
    if (allExpected) r.status = 'ok';
    console.log(`  [${statusIcon(r.status)}] Login (${r.loadTimeMs}ms)`);
  }

  // ── 2. LOGIN ──
  console.log('\n2. Logging in...');
  const btns = await page.$$('button');
  for (const b of btns) {
    const t = await b.textContent().catch(() => '');
    if (t.includes('Эдуард') || t.includes('youredik')) {
      console.log(`  Clicking: "${t.trim().substring(0, 80)}"`);
      await b.click();
      break;
    }
  }
  await page.waitForTimeout(5000);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  console.log(`  Now at: ${page.url()}`);
  await page.screenshot({ path: join(SCREENSHOTS_DIR, 'audit_after_login.png') });

  // ── 3. EXTRACT TOKEN & FETCH WORKSPACES ──
  console.log('\n3. Extracting auth token and fetching workspaces...');
  
  // Wait for token to appear in localStorage
  let accessToken = null;
  for (let i = 0; i < 10; i++) {
    accessToken = await page.evaluate(() => {
      try {
        const s = localStorage.getItem('auth-storage');
        if (s) { const p = JSON.parse(s); return p?.state?.accessToken || null; }
      } catch {}
      return null;
    });
    if (accessToken) break;
    await page.waitForTimeout(500);
  }

  console.log(`  Access token: ${accessToken ? `${accessToken.substring(0, 30)}...` : 'NOT FOUND'}`);

  // If no token in localStorage, try getting it via refresh endpoint
  if (!accessToken) {
    console.log('  Trying to get token via API...');
    const tokenResult = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          return data.accessToken || data.access_token || null;
        }
      } catch {}
      return null;
    });
    accessToken = tokenResult;
    console.log(`  Token via refresh: ${accessToken ? `${accessToken.substring(0, 30)}...` : 'NOT FOUND'}`);
  }

  // Fetch workspaces directly with token
  let workspaces = [];
  if (accessToken) {
    workspaces = await page.evaluate(async (token) => {
      const res = await fetch('/api/workspaces', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) return res.json();
      return [];
    }, accessToken);
  }

  console.log(`  Workspaces found: ${workspaces.length}`);
  for (const ws of workspaces.slice(0, 20)) {
    console.log(`    - ${ws.name} (${ws.id?.substring(0, 8)}...)`);
  }

  // ── 4. INTERCEPT REQUESTS TO ADD AUTH ──
  // Set up request interception to add Authorization header automatically
  // This fixes the 401 issue on page.goto()
  if (accessToken) {
    await page.route('**/api/**', async (route) => {
      const headers = { ...route.request().headers() };
      if (!headers['authorization']) {
        headers['authorization'] = `Bearer ${accessToken}`;
      }
      await route.continue({ headers });
    });
    console.log('  Request interception enabled (auto-inject auth header)');
  }

  // ── 5. BUILD ROUTES ──
  const routes = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/tasks', label: 'Tasks (Inbox)' },
    { path: '/chat', label: 'Chat' },
    { path: '/knowledge-base', label: 'Knowledge Base' },
    { path: '/admin/users', label: 'Admin - Users' },
    { path: '/admin/roles', label: 'Admin - Roles' },
    { path: '/admin/invitations', label: 'Admin - Invitations' },
    { path: '/profile', label: 'Profile' },
  ];

  for (const ws of workspaces) {
    routes.push({ path: `/workspace/${ws.id}`, label: `Workspace: ${ws.name}` });
  }

  console.log(`\n4. Testing ${routes.length} pages...\n`);

  // ── 6. TEST EACH PAGE ──
  for (const route of routes) {
    const r = await testPage(page, route.path, route.label);
    const pad = route.label.substring(0, 50).padEnd(50);
    console.log(`  [${statusIcon(r.status)}] ${pad} (${r.loadTimeMs}ms) err:${r.consoleErrors.length} net:${r.networkErrors.length}`);
    if (r.networkErrors.length > 0) {
      for (const e of r.networkErrors.slice(0, 3)) console.log(`        ${e.status} ${e.url.substring(0, 120)}`);
      if (r.networkErrors.length > 3) console.log(`        ... +${r.networkErrors.length - 3} more`);
    }

    if (r.status === 'redirect_to_login') {
      console.log('    -> Re-logging in...');
      await page.unroute('**/api/**');
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
      const btns2 = await page.$$('button');
      for (const b of btns2) {
        const t = await b.textContent().catch(() => '');
        if (t.includes('Эдуард') || t.includes('youredik')) { await b.click(); await page.waitForTimeout(5000); break; }
      }
      // Re-extract token
      for (let i = 0; i < 10; i++) {
        accessToken = await page.evaluate(() => {
          try { const s = localStorage.getItem('auth-storage'); if (s) return JSON.parse(s)?.state?.accessToken; } catch {} return null;
        });
        if (accessToken) break;
        await page.waitForTimeout(500);
      }
      if (accessToken) {
        await page.route('**/api/**', async (route) => {
          const h = { ...route.request().headers() };
          if (!h['authorization']) h['authorization'] = `Bearer ${accessToken}`;
          await route.continue({ headers: h });
        });
      }
    }
  }

  // ── 7. SIDEBAR CHECK ──
  console.log('\n5. Sidebar & navigation check...');
  if (workspaces.length > 0) {
    await page.goto(`${BASE}/workspace/${workspaces[0].id}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const navInfo = await page.evaluate(() => {
      const elements = [];
      document.querySelectorAll('a[href], button, nav, aside').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.x < 300) {
          elements.push({
            tag: el.tagName,
            href: el.getAttribute('href'),
            text: el.textContent?.trim().replace(/\s+/g, ' ').substring(0, 60),
            x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)
          });
        }
      });
      return elements;
    });

    console.log(`  Left-side elements (x<300): ${navInfo.length}`);
    for (const el of navInfo.slice(0, 20)) {
      console.log(`    [${el.tag} x=${el.x} y=${el.y} ${el.w}x${el.h}] ${el.text?.substring(0, 50)} ${el.href ? '-> ' + el.href : ''}`);
    }
  }

  // ── CLEANUP ROUTE INTERCEPTION ──
  await page.unroute('**/api/**').catch(() => {});

  // ── SUMMARY ──
  console.log('\n\n========================================');
  console.log('           AUDIT SUMMARY');
  console.log('========================================\n');

  const total = results.length;
  const ok = results.filter(r => r.status === 'ok').length;
  const warn = results.filter(r => r.status === 'warning').length;
  const err = results.filter(r => r.status === 'error').length;
  const redir = results.filter(r => r.status === 'redirect_to_login').length;
  const navErr = results.filter(r => r.status === 'navigation_error').length;
  const totalConsErr = results.reduce((s, r) => s + r.consoleErrors.length, 0);
  const totalNetErr = results.reduce((s, r) => s + r.networkErrors.length, 0);

  console.log(`Total pages tested:      ${total}`);
  console.log(`  OK:                    ${ok}`);
  console.log(`  Warnings:              ${warn}`);
  console.log(`  Errors (5xx):          ${err}`);
  console.log(`  Navigation errors:     ${navErr}`);
  console.log(`  Redirected to login:   ${redir}`);
  console.log(`  Total console errors:  ${totalConsErr}`);
  console.log(`  Total network 4xx/5xx: ${totalNetErr}`);

  // 5xx
  const fiveXX = [];
  for (const r of results) for (const e of r.networkErrors) if (e.status >= 500) fiveXX.push({ page: r.page, ...e });
  if (fiveXX.length > 0) {
    console.log('\n--- 5xx SERVER ERRORS (CRITICAL) ---');
    for (const e of fiveXX) console.log(`  ${e.status} on "${e.page}" — ${e.url}`);
  } else {
    console.log('\n  No 5xx server errors found.');
  }

  // 4xx non-401
  const fourXX = [];
  for (const r of results) for (const e of r.networkErrors) if (e.status >= 400 && e.status < 500 && e.status !== 401) fourXX.push({ page: r.page, ...e });
  if (fourXX.length > 0) {
    console.log('\n--- 4xx ERRORS (non-401) ---');
    for (const e of fourXX) console.log(`  ${e.status} on "${e.page}" — ${e.url}`);
  }

  // 401 post-login
  const all401 = [];
  for (const r of results) {
    if (r.page === 'Login (unauthenticated)') continue;
    for (const e of r.networkErrors) if (e.status === 401) all401.push({ page: r.page, url: e.url });
  }
  if (all401.length > 0) {
    console.log('\n--- 401 UNAUTHORIZED (post-login, auth race condition) ---');
    for (const e of all401) console.log(`  on "${e.page}" — ${e.url}`);
  }

  // Problematic
  const problematic = results.filter(r => r.status !== 'ok');
  if (problematic.length > 0) {
    console.log('\n--- PROBLEMATIC PAGES ---');
    for (const r of problematic) {
      console.log(`\n  [${r.status.toUpperCase()}] ${r.page} — ${r.url}`);
      for (const e of r.consoleErrors.slice(0, 5)) console.log(`    Console: ${e.substring(0, 250)}`);
      for (const e of r.networkErrors.slice(0, 5)) console.log(`    Network: ${e.status} ${e.url}`);
    }
  }

  // Table
  console.log('\n--- PAGE STATUS TABLE ---');
  console.log(`  ${'Page'.padEnd(50)} ${'Status'.padEnd(12)} ${'Time'.padEnd(8)} Err  Net`);
  console.log(`  ${'-'.repeat(50)} ${'-'.repeat(12)} ${'-'.repeat(8)} ${'-'.repeat(4)} ${'-'.repeat(4)}`);
  for (const r of results) {
    console.log(`  ${r.page.substring(0, 50).padEnd(50)} ${r.status.padEnd(12)} ${(r.loadTimeMs + 'ms').padEnd(8)} ${String(r.consoleErrors.length).padEnd(4)} ${r.networkErrors.length}`);
  }

  // JSON
  writeFileSync(RESULTS_FILE, JSON.stringify({
    timestamp: new Date().toISOString(), total, ok, warnings: warn, errors: err,
    navigationErrors: navErr, redirectsToLogin: redir,
    totalConsoleErrors: totalConsErr, totalNetworkErrors: totalNetErr,
    fiveXXErrors: fiveXX, fourXXErrors: fourXX, all401PostLogin: all401, results,
  }, null, 2), 'utf8');
  console.log(`\nJSON: ${RESULTS_FILE}`);

  await browser.close();
  console.log('Audit complete.\n');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
