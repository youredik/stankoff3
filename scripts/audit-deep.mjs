#!/usr/bin/env node
/**
 * Deep Portal Audit — параллельные проверки всех секций
 * Запускает 6 BrowserContext одновременно для максимальной скорости
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

if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ===== UTILITIES =====

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

async function apiPost(path, body, token) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function apiPut(path, body, token) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function apiDelete(path, token) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status };
}

async function createAuthContext(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
  });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  const adminCard = page.locator('button, [role="button"], div[class*="cursor-pointer"]')
    .filter({ hasText: /youredik|Эдуард|Сарваров/i }).first();
  const visible = await adminCard.isVisible({ timeout: 5000 }).catch(() => false);

  if (visible) {
    await adminCard.click();
    await page.waitForURL('**/dashboard', { timeout: 15000 }).catch(() => {});
  } else {
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
  }
  await page.close();
  return context;
}

function createPageCollector(context) {
  const errors = [];
  const warnings = [];
  const networkErrors = [];
  return {
    errors, warnings, networkErrors,
    async newPage() {
      const page = await context.newPage();
      page.on('console', msg => {
        if (msg.type() === 'error') {
          const text = msg.text();
          if (!text.includes('favicon') && !text.includes('DevTools') && !text.includes('third-party'))
            errors.push(text);
        }
      });
      page.on('requestfailed', req => {
        const url = req.url();
        if (!url.includes('favicon') && !url.includes('.hot-update.') && !url.includes('__nextjs'))
          networkErrors.push(`${req.failure()?.errorText}: ${url}`);
      });
      page.on('response', res => {
        if (res.status() >= 500) errors.push(`HTTP ${res.status()}: ${res.url().replace(BASE_URL, '')}`);
      });
      return page;
    },
  };
}

// ===== AUDIT 1: Pages & Navigation =====
async function auditPagesAndNav(context) {
  const label = '📄 Pages & Nav';
  console.log(`\n${label} — START`);
  const collector = createPageCollector(context);
  const page = await collector.newPage();
  const findings = [];

  const routes = ['/dashboard', '/workspace', '/tasks', '/chat', '/knowledge-base',
    '/admin/users', '/admin/roles', '/admin/invitations', '/profile'];

  for (const route of routes) {
    try {
      const res = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 25000 });
      await page.waitForTimeout(1500);
      if (res && res.status() >= 400) findings.push(`❌ HTTP ${res.status()} на ${route}`);

      const errorEl = await page.locator('text=/unhandled|error boundary|что-то пошло не так|500/i')
        .first().isVisible({ timeout: 1000 }).catch(() => false);
      if (errorEl) {
        findings.push(`❌ Error on ${route}`);
        await page.screenshot({ path: join(SCREENSHOT_DIR, `error-${route.replace(/\//g, '_')}.png`) });
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5);
      if (overflow) findings.push(`⚠️ Horizontal overflow на ${route}`);

      const badBtns = await page.evaluate(() => {
        let count = 0;
        document.querySelectorAll('button').forEach(btn => {
          const t = btn.textContent?.trim();
          if (!t && !btn.getAttribute('aria-label') && !btn.getAttribute('title')) count++;
        });
        return count;
      });
      if (badBtns > 2) findings.push(`⚠️ ${badBtns} inaccessible buttons на ${route}`);

      await page.screenshot({ path: join(SCREENSHOT_DIR, `page${route.replace(/\//g, '_') || '_root'}.png`) });
    } catch (e) {
      findings.push(`❌ ${route} timeout: ${e.message.slice(0, 80)}`);
    }
  }

  // Mobile responsive
  try {
    await page.setViewportSize({ width: 375, height: 667 });
    for (const route of ['/dashboard', '/chat', '/tasks']) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1000);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5);
      if (overflow) findings.push(`⚠️ Mobile overflow на ${route}`);
      await page.screenshot({ path: join(SCREENSHOT_DIR, `mobile${route.replace(/\//g, '_')}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  } catch (e) {
    findings.push(`⚠️ Mobile test fail: ${e.message.slice(0, 60)}`);
  }

  if (collector.errors.length > 0) {
    const unique = [...new Set(collector.errors)].slice(0, 10);
    findings.push(`❌ Console errors (${collector.errors.length}):\n  ${unique.map(e => e.slice(0, 120)).join('\n  ')}`);
  }

  await page.close();
  console.log(`${label} — DONE (${findings.length} findings)`);
  return { section: label, findings };
}

// ===== AUDIT 2: Workspaces & Entity CRUD =====
async function auditWorkspacesAndEntities(context, token) {
  const label = '📋 Workspaces & CRUD';
  console.log(`\n${label} — START`);
  const collector = createPageCollector(context);
  const page = await collector.newPage();
  const findings = [];

  let workspaces = [];
  try { workspaces = await apiGet('/api/workspaces', token); } catch (e) {
    findings.push(`❌ GET /api/workspaces failed: ${e.message}`);
    await page.close(); return { section: label, findings };
  }
  findings.push(`ℹ️ ${workspaces.length} workspaces`);

  for (const ws of workspaces.slice(0, 10)) {
    try {
      await page.goto(`${BASE_URL}/workspace/${ws.id}`, { waitUntil: 'networkidle', timeout: 25000 });
      await page.waitForTimeout(2000);

      const hasError = await page.locator('text=/error|ошибка|500|не найден/i').first().isVisible({ timeout: 1000 }).catch(() => false);
      if (hasError) {
        findings.push(`❌ WS "${ws.name}" (${ws.prefix}): error`);
        await page.screenshot({ path: join(SCREENSHOT_DIR, `ws-err-${ws.prefix}.png`) });
      }

      // Check settings
      await page.goto(`${BASE_URL}/workspace/${ws.id}/settings`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000);
      const settingsErr = await page.locator('text=/error|ошибка|403/i').first().isVisible({ timeout: 1000 }).catch(() => false);
      if (settingsErr) findings.push(`❌ WS "${ws.name}" settings error`);
    } catch (e) {
      findings.push(`❌ WS "${ws.name}": ${e.message.slice(0, 80)}`);
    }
  }

  // Entity CRUD
  const testWs = workspaces[0];
  if (testWs) {
    try {
      const createRes = await apiPost('/api/entities', {
        title: `[AUDIT] Test ${Date.now()}`, workspaceId: testWs.id, description: 'Audit test',
      }, token);
      if (createRes.status >= 400) {
        findings.push(`❌ Entity CREATE failed (${createRes.status}): ${JSON.stringify(createRes.data).slice(0, 80)}`);
      } else {
        const id = createRes.data?.id;
        findings.push(`✅ Entity CRUD: CREATE OK`);
        if (id) {
          const r = await apiGet(`/api/entities/${id}`, token); findings.push(`✅ Entity CRUD: READ OK`);
          const u = await apiPut(`/api/entities/${id}`, { title: `[AUDIT] Updated`, description: 'Updated' }, token);
          findings.push(u.status < 400 ? `✅ Entity CRUD: UPDATE OK` : `❌ Entity UPDATE (${u.status})`);
          const d = await apiDelete(`/api/entities/${id}`, token);
          findings.push(d.status < 400 ? `✅ Entity CRUD: DELETE OK` : `❌ Entity DELETE (${d.status})`);
        }
      }
    } catch (e) { findings.push(`❌ Entity CRUD: ${e.message.slice(0, 80)}`); }
  }

  if (collector.errors.length > 0)
    findings.push(`❌ Console errors (${collector.errors.length}): ${[...new Set(collector.errors)].slice(0, 3).map(e => e.slice(0, 60)).join('; ')}`);

  await page.close();
  console.log(`${label} — DONE (${findings.length} findings)`);
  return { section: label, findings };
}

// ===== AUDIT 3: BPMN/Camunda =====
async function auditBPMN(context, token) {
  const label = '⚙️ BPMN/Camunda';
  console.log(`\n${label} — START`);
  const collector = createPageCollector(context);
  const page = await collector.newPage();
  const findings = [];

  try {
    const health = await apiGet('/api/bpmn/health', token);
    findings.push(health.connected ? `✅ Zeebe connected` : `❌ Zeebe NOT connected`);
  } catch (e) { findings.push(`❌ BPMN health: ${e.message.slice(0, 60)}`); }

  try {
    const templates = await apiGet('/api/bpmn/templates', token);
    findings.push(`ℹ️ BPMN templates: ${Array.isArray(templates) ? templates.length : 'N/A'}`);
  } catch (e) { findings.push(`⚠️ BPMN templates: ${e.message.slice(0, 60)}`); }

  try {
    const inbox = await apiGet('/api/bpmn/tasks/inbox', token);
    const count = Array.isArray(inbox) ? inbox.length : inbox?.data?.length ?? 'unknown';
    findings.push(`ℹ️ BPMN inbox: ${count} tasks`);
  } catch (e) { findings.push(`⚠️ BPMN inbox: ${e.message.slice(0, 60)}`); }

  const workspaces = await apiGet('/api/workspaces', token).catch(() => []);
  for (const ws of workspaces.slice(0, 5)) {
    try {
      const defs = await apiGet(`/api/bpmn/definitions/${ws.id}`, token);
      if (Array.isArray(defs) && defs.length > 0) {
        findings.push(`✅ BPMN defs "${ws.prefix}": ${defs.length}`);
      }
    } catch (e) {}
  }

  // UI: Tasks page
  try {
    await page.goto(`${BASE_URL}/tasks`, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: join(SCREENSHOT_DIR, 'tasks-inbox.png') });
    findings.push(`✅ Tasks page loads`);
  } catch (e) { findings.push(`❌ Tasks page: ${e.message.slice(0, 80)}`); }

  if (collector.errors.length > 0)
    findings.push(`❌ Console errors (${collector.errors.length}): ${[...new Set(collector.errors)].slice(0, 3).map(e => e.slice(0, 60)).join('; ')}`);

  await page.close();
  console.log(`${label} — DONE (${findings.length} findings)`);
  return { section: label, findings };
}

// ===== AUDIT 4: Chat & KB =====
async function auditChatAndKB(context, token) {
  const label = '💬 Chat & KB';
  console.log(`\n${label} — START`);
  const collector = createPageCollector(context);
  const page = await collector.newPage();
  const findings = [];

  // Chat API
  try {
    const convs = await apiGet('/api/chat/conversations', token);
    findings.push(`ℹ️ Chat: ${convs.length} conversations`);
  } catch (e) { findings.push(`❌ Chat conversations: ${e.message.slice(0, 60)}`); }

  // Chat CRUD
  try {
    const users = await apiGet('/api/users', token);
    const other = users.find(u => u.email !== ADMIN_EMAIL);
    if (other) {
      const c = await apiPost('/api/chat/conversations', {
        type: 'group', name: `[AUDIT] Chat ${Date.now()}`, participantIds: [other.id],
      }, token);
      if (c.status < 400) {
        findings.push(`✅ Chat CREATE conversation OK`);
        const convId = c.data?.id;
        if (convId) {
          const m = await apiPost(`/api/chat/conversations/${convId}/messages`, { content: 'Audit msg' }, token);
          findings.push(m.status < 400 ? `✅ Chat SEND message OK` : `❌ Chat SEND (${m.status})`);
          try {
            await apiGet(`/api/chat/conversations/search?q=audit`, token);
            findings.push(`✅ Chat search OK`);
          } catch (e) { findings.push(`❌ Chat search: ${e.message.slice(0, 60)}`); }
          await apiDelete(`/api/chat/conversations/${convId}`, token).catch(() => {});
        }
      } else {
        findings.push(`❌ Chat CREATE (${c.status}): ${JSON.stringify(c.data).slice(0, 80)}`);
      }
    }
  } catch (e) { findings.push(`❌ Chat CRUD: ${e.message.slice(0, 80)}`); }

  // Chat UI
  try {
    await page.goto(`${BASE_URL}/chat`, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: join(SCREENSHOT_DIR, 'chat-page.png') });
    findings.push(`✅ Chat page loads`);
  } catch (e) { findings.push(`❌ Chat UI: ${e.message.slice(0, 60)}`); }

  // KB API CRUD
  try {
    const c = await apiPost('/api/knowledge-base/articles', {
      title: `[AUDIT] KB ${Date.now()}`, content: 'Audit test', categoryId: null,
    }, token);
    if (c.status < 400) {
      findings.push(`✅ KB CREATE article OK`);
      const id = c.data?.id;
      if (id) {
        const u = await apiPut(`/api/knowledge-base/articles/${id}`, { title: 'Updated', content: 'Updated' }, token);
        findings.push(u.status < 400 ? `✅ KB UPDATE OK` : `❌ KB UPDATE (${u.status})`);
        const d = await apiDelete(`/api/knowledge-base/articles/${id}`, token);
        findings.push(d.status < 400 ? `✅ KB DELETE OK` : `❌ KB DELETE (${d.status})`);
      }
    } else {
      findings.push(`❌ KB CREATE (${c.status}): ${JSON.stringify(c.data).slice(0, 80)}`);
    }
  } catch (e) { findings.push(`❌ KB CRUD: ${e.message.slice(0, 80)}`); }

  // KB UI
  try {
    await page.goto(`${BASE_URL}/knowledge-base`, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: join(SCREENSHOT_DIR, 'kb-page.png') });
    findings.push(`✅ KB page loads`);
  } catch (e) { findings.push(`❌ KB UI: ${e.message.slice(0, 60)}`); }

  if (collector.errors.length > 0)
    findings.push(`❌ Console errors (${collector.errors.length}): ${[...new Set(collector.errors)].slice(0, 3).map(e => e.slice(0, 60)).join('; ')}`);

  await page.close();
  console.log(`${label} — DONE (${findings.length} findings)`);
  return { section: label, findings };
}

// ===== AUDIT 5: RBAC & Admin =====
async function auditRBACAndAdmin(context, token) {
  const label = '🔐 RBAC & Admin';
  console.log(`\n${label} — START`);
  const collector = createPageCollector(context);
  const page = await collector.newPage();
  const findings = [];

  // RBAC API
  try {
    const roles = await apiGet('/api/rbac/roles', token);
    findings.push(`ℹ️ RBAC: ${roles.length} roles (${roles.map(r => r.name).join(', ')})`);
  } catch (e) { findings.push(`❌ RBAC roles: ${e.message}`); }

  try {
    const perms = await apiGet('/api/rbac/permissions', token);
    findings.push(`ℹ️ RBAC permissions: ${Array.isArray(perms) ? perms.length : Object.keys(perms).length}`);
  } catch (e) { findings.push(`❌ RBAC perms: ${e.message}`); }

  try {
    const my = await apiGet('/api/rbac/permissions/my', token);
    const has = Array.isArray(my) ? my.includes('*') : my?.permissions?.includes('*');
    findings.push(has ? `✅ super_admin wildcard OK` : `⚠️ No wildcard for current user`);
  } catch (e) { findings.push(`❌ My perms: ${e.message}`); }

  // RBAC role CRUD
  try {
    const c = await apiPost('/api/rbac/roles', {
      name: `audit-${Date.now()}`, displayName: 'Audit Test', scope: 'global', permissions: ['entity:read'],
    }, token);
    if (c.status < 400) {
      findings.push(`✅ RBAC CREATE role OK`);
      if (c.data?.id) {
        const d = await apiDelete(`/api/rbac/roles/${c.data.id}`, token);
        findings.push(d.status < 400 ? `✅ RBAC DELETE role OK` : `❌ RBAC DELETE (${d.status})`);
      }
    } else {
      findings.push(`❌ RBAC CREATE (${c.status}): ${JSON.stringify(c.data).slice(0, 80)}`);
    }
  } catch (e) { findings.push(`❌ RBAC CRUD: ${e.message.slice(0, 80)}`); }

  // Admin UI
  for (const route of ['/admin/users', '/admin/roles', '/admin/invitations']) {
    try {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 25000 });
      await page.waitForTimeout(1500);
      const hasTable = await page.evaluate(() => document.querySelectorAll('table tr, [role="row"]').length > 0);
      findings.push(hasTable ? `✅ ${route} table loads` : `⚠️ ${route} no table visible`);
      await page.screenshot({ path: join(SCREENSHOT_DIR, `admin${route.replace(/\//g, '_')}.png`) });
    } catch (e) { findings.push(`❌ ${route}: ${e.message.slice(0, 60)}`); }
  }

  if (collector.errors.length > 0)
    findings.push(`❌ Console errors (${collector.errors.length}): ${[...new Set(collector.errors)].slice(0, 3).map(e => e.slice(0, 60)).join('; ')}`);

  await page.close();
  console.log(`${label} — DONE (${findings.length} findings)`);
  return { section: label, findings };
}

// ===== AUDIT 6: DMN & SLA =====
async function auditDMNAndSLA(context, token) {
  const label = '📊 DMN & SLA';
  console.log(`\n${label} — START`);
  const findings = [];

  const workspaces = await apiGet('/api/workspaces', token).catch(() => []);

  for (const ws of workspaces.slice(0, 8)) {
    try {
      const tables = await apiGet(`/api/dmn/tables?workspaceId=${ws.id}`, token);
      if (Array.isArray(tables) && tables.length > 0) {
        findings.push(`✅ DMN tables "${ws.prefix}": ${tables.length}`);
        const t = tables[0];
        try {
          const e = await apiPost(`/api/dmn/tables/${t.id}/evaluate`, { inputData: { test: 'audit' } }, token);
          findings.push(e.status < 400 ? `✅ DMN evaluate OK` : `⚠️ DMN evaluate ${e.status}`);
        } catch (e) {}
      }
    } catch (e) {}
  }

  for (const ws of workspaces.slice(0, 8)) {
    try {
      const defs = await apiGet(`/api/sla/definitions?workspaceId=${ws.id}`, token);
      if (Array.isArray(defs) && defs.length > 0) findings.push(`✅ SLA defs "${ws.prefix}": ${defs.length}`);
    } catch (e) {}
  }

  try {
    const dash = await apiGet('/api/sla/dashboard', token);
    findings.push(`ℹ️ SLA dashboard: ${JSON.stringify(dash).slice(0, 80)}`);
  } catch (e) { findings.push(`⚠️ SLA dashboard: ${e.message.slice(0, 60)}`); }

  if (findings.length === 0) findings.push(`ℹ️ No DMN/SLA data found`);

  console.log(`${label} — DONE (${findings.length} findings)`);
  return { section: label, findings };
}

// ===== MAIN =====
async function main() {
  console.log('🤖 DEEP AUDIT STARTING...\n');
  await sendTelegram('🔬 <b>Глубокий аудит запущен</b>\n\n6 параллельных контекстов:\n1. Pages & Navigation\n2. Workspaces & Entity CRUD\n3. BPMN/Camunda\n4. Chat & KB\n5. RBAC & Admin\n6. DMN & SLA');

  const token = await getToken();
  console.log('✅ Token obtained\n');

  const browser = await chromium.launch({ headless: true });

  console.log('🔑 Creating 5 parallel auth contexts...');
  const contexts = await Promise.all(Array(5).fill(null).map(() => createAuthContext(browser)));
  console.log('✅ All contexts ready\n');

  const startTime = Date.now();
  const results = await Promise.all([
    auditPagesAndNav(contexts[0]),
    auditWorkspacesAndEntities(contexts[1], token),
    auditBPMN(contexts[2], token),
    auditChatAndKB(contexts[3], token),
    auditRBACAndAdmin(contexts[4], token),
    auditDMNAndSLA(contexts[0], token), // no browser needed, reuse
  ]);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  for (const ctx of contexts) await ctx.close();
  await browser.close();

  // Compile
  const allIssues = [], allWarnings = [], allInfo = [], allOk = [];
  for (const r of results) {
    for (const f of r.findings) {
      if (f.startsWith('❌')) allIssues.push(`[${r.section}] ${f}`);
      else if (f.startsWith('⚠️')) allWarnings.push(`[${r.section}] ${f}`);
      else if (f.startsWith('ℹ️')) allInfo.push(`[${r.section}] ${f}`);
      else if (f.startsWith('✅')) allOk.push(`[${r.section}] ${f}`);
    }
  }

  const report = [];
  report.push(`📊 <b>DEEP AUDIT REPORT</b>`);
  report.push(`⏱ ${elapsed}с | 5 параллельных контекстов\n`);
  report.push(`✅ OK: ${allOk.length} | ❌ Issues: ${allIssues.length} | ⚠️ Warnings: ${allWarnings.length}\n`);

  if (allIssues.length > 0) { report.push(`<b>❌ ПРОБЛЕМЫ:</b>`); allIssues.forEach(i => report.push(i)); report.push(''); }
  if (allWarnings.length > 0) { report.push(`<b>⚠️ ПРЕДУПРЕЖДЕНИЯ:</b>`); allWarnings.forEach(w => report.push(w)); report.push(''); }
  if (allOk.length > 0) { report.push(`<b>✅ ВСЁ ОК:</b>`); allOk.forEach(o => report.push(o)); }

  const fullReport = report.join('\n');
  console.log('\n' + fullReport.replace(/<[^>]+>/g, ''));

  writeFileSync(join(SCREENSHOT_DIR, 'deep-audit-result.json'), JSON.stringify({
    issues: allIssues, warnings: allWarnings, ok: allOk, info: allInfo, elapsed,
    timestamp: new Date().toISOString(), results,
  }, null, 2));

  // Send to Telegram
  if (fullReport.length <= 4000) {
    await sendTelegram(fullReport);
  } else {
    for (const r of results) {
      const section = [`<b>${r.section}</b>`, ...r.findings].join('\n');
      if (section.length > 4000) {
        await sendTelegram(section.slice(0, 4000));
      } else {
        await sendTelegram(section);
      }
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`\n📁 Results: ${SCREENSHOT_DIR}`);
  return { issues: allIssues, warnings: allWarnings, ok: allOk, info: allInfo };
}

main().catch(async e => {
  console.error('Audit failed:', e);
  await sendTelegram(`💥 Аудит упал: ${e.message}`);
  process.exit(1);
});
