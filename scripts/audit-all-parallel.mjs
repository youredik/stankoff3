import { chromium } from 'playwright';
import { loginAsAdmin } from './audit-helpers.mjs';

// AGENT 1: Admin pages
async function auditAdmin(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];

  page.on('pageerror', err => errors.push({ page: page.url(), text: err.message.substring(0, 200) }));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (!t.includes('WebSocket') && !t.includes('favicon') && !t.includes('ERR_CONNECTION'))
        errors.push({ page: page.url(), text: t.substring(0, 200) });
    }
  });

  await loginAsAdmin(page);

  const adminPages = ['/admin/users', '/admin/roles', '/admin/invitations'];
  const results = [];

  for (const path of adminPages) {
    console.log('[ADMIN] Testing: ' + path);
    await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const btnCount = await page.evaluate(() => document.querySelectorAll('main button, [role="main"] button').length);
    const tableRows = await page.evaluate(() => document.querySelectorAll('table tr, tbody tr').length);
    const bodyText = await page.textContent('body');
    const hasError = bodyText.includes('Cannot read properties') || bodyText.includes('Unhandled Runtime Error');

    results.push({ path, btnCount, tableRows, hasError });
    console.log('[ADMIN]   buttons=' + btnCount + ' rows=' + tableRows + (hasError ? ' ERROR!' : ' OK'));

    // Try Escape on modals
    const createBtns = await page.$$('button:has-text("Добавить"), button:has-text("Создать"), button:has-text("Пригласить")');
    for (const btn of createBtns) {
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(800);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        console.log('[ADMIN]   Modal Escape tested');
        break;
      }
    }
  }

  await context.close();
  return { module: 'ADMIN', pages: adminPages.length, errors, results };
}

// AGENT 2: Chat
async function auditChat(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];

  page.on('pageerror', err => errors.push({ page: page.url(), text: err.message.substring(0, 200) }));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (!t.includes('WebSocket') && !t.includes('favicon') && !t.includes('ERR_CONNECTION'))
        errors.push({ page: page.url(), text: t.substring(0, 200) });
    }
  });

  await loginAsAdmin(page);
  console.log('[CHAT] Testing: /chat');
  await page.goto('http://localhost:3000/chat', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const chatLinks = await page.$$('a[href*="/chat/"]');
  console.log('[CHAT] Chat rooms: ' + chatLinks.length);

  // Check sidebar structure
  const sidebarBtns = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.filter(b => b.offsetParent !== null).map(b => (b.textContent || '').trim().substring(0, 40)).filter(t => t.length > 0 && t.length < 30);
  });
  console.log('[CHAT] Visible buttons: ' + sidebarBtns.join(', '));

  // Open first chat
  if (chatLinks.length > 0) {
    await chatLinks[0].click();
    await page.waitForTimeout(2000);
    const textarea = await page.$('textarea');
    console.log('[CHAT] Textarea: ' + (textarea ? 'yes' : 'no'));

    if (textarea) {
      await textarea.fill('test');
      const sendBtn = await page.$('[data-testid="chat-send-btn"]');
      console.log('[CHAT] Send btn visible: ' + (sendBtn ? 'yes' : 'no'));
      await textarea.fill('');
    }
  }

  await page.screenshot({ path: '/tmp/audit-chat.png' });
  await context.close();
  return { module: 'CHAT', chatRooms: chatLinks.length, errors };
}

// AGENT 3: Workspaces/Kanban
async function auditKanban(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  const networkErrors = [];

  page.on('pageerror', err => errors.push({ page: page.url(), text: err.message.substring(0, 200) }));
  page.on('response', resp => {
    if (resp.status() >= 500) networkErrors.push({ url: resp.url().substring(0, 100), status: resp.status() });
  });

  await loginAsAdmin(page);

  // Navigate to workspace via sidebar
  console.log('[KANBAN] Going to /workspace');
  await page.goto('http://localhost:3000/workspace', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Find workspace links in sidebar
  const wsLinks = await page.$$('a[href*="/workspace/"]');
  console.log('[KANBAN] Workspace links: ' + wsLinks.length);

  const testLinks = wsLinks.slice(0, 3);
  const results = [];

  for (const link of testLinks) {
    const href = await link.getAttribute('href');
    const text = (await link.textContent()).trim().substring(0, 30);
    console.log('[KANBAN] Testing: ' + text + ' (' + href + ')');

    await link.click();
    await page.waitForTimeout(3000);

    // Analyze page content
    const analysis = await page.evaluate(() => {
      const body = document.body;
      const all = Array.from(body.querySelectorAll('*'));
      const buttons = all.filter(e => e.tagName === 'BUTTON' && e.offsetParent !== null);
      const draggables = all.filter(e => e.getAttribute('draggable') === 'true');
      const inputs = all.filter(e => (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') && e.offsetParent !== null);

      // Look for kanban-like structures
      const possibleColumns = all.filter(e => {
        const cls = (e.className || '').toString();
        return cls.includes('column') || cls.includes('Column') || cls.includes('kanban') || cls.includes('droppable');
      });

      return {
        buttons: buttons.length,
        draggables: draggables.length,
        inputs: inputs.length,
        possibleColumns: possibleColumns.length,
        h1Text: document.querySelector('h1')?.textContent?.substring(0, 50) || '',
        mainText: (document.querySelector('main')?.textContent || '').substring(0, 200),
      };
    });

    results.push({ href, text, ...analysis });
    console.log('[KANBAN]   btns=' + analysis.buttons + ' drag=' + analysis.draggables + ' cols=' + analysis.possibleColumns);
  }

  await page.screenshot({ path: '/tmp/audit-kanban.png' });
  await context.close();
  return { module: 'KANBAN', workspaces: testLinks.length, errors, networkErrors, results };
}

// AGENT 4: Knowledge Base + Dashboard + Tasks
async function auditKBDashTasks(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];

  page.on('pageerror', err => errors.push({ page: page.url(), text: err.message.substring(0, 200) }));

  await loginAsAdmin(page);

  const results = {};

  // Dashboard
  console.log('[KB] Testing: /dashboard');
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/audit-dashboard.png' });
  results.dashboard = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    return {
      text: main.textContent?.substring(0, 300),
      buttons: main.querySelectorAll('button').length,
      links: main.querySelectorAll('a').length,
    };
  });
  console.log('[KB] Dashboard: btns=' + results.dashboard.buttons + ' links=' + results.dashboard.links);

  // Tasks
  console.log('[KB] Testing: /tasks');
  await page.goto('http://localhost:3000/tasks', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/audit-tasks.png' });
  results.tasks = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    return {
      text: main.textContent?.substring(0, 300),
      buttons: main.querySelectorAll('button').length,
      links: main.querySelectorAll('a').length,
      tables: main.querySelectorAll('table').length,
      rows: main.querySelectorAll('tr').length,
    };
  });
  console.log('[KB] Tasks: btns=' + results.tasks.buttons + ' rows=' + results.tasks.rows);

  // Knowledge Base
  console.log('[KB] Testing: /knowledge-base');
  await page.goto('http://localhost:3000/knowledge-base', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/audit-kb.png' });
  results.kb = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    return {
      text: main.textContent?.substring(0, 300),
      buttons: main.querySelectorAll('button').length,
      tabs: main.querySelectorAll('[role="tab"]').length,
    };
  });
  console.log('[KB] Knowledge Base: btns=' + results.kb.buttons + ' tabs=' + results.kb.tabs);

  await context.close();
  return { module: 'KB_DASH_TASKS', errors, results };
}

// AGENT 5: A11y deep scan
async function auditA11y(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  await loginAsAdmin(page);

  const pages = ['/dashboard', '/chat', '/tasks', '/knowledge-base', '/admin/users', '/admin/roles'];
  const a11yIssues = [];

  for (const path of pages) {
    console.log('[A11Y] Auditing: ' + path);
    await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const issues = await page.evaluate(() => {
      const result = { imgsNoAlt: 0, btnsNoLabel: 0, inputsNoLabel: 0, linksNoText: 0, overflow: 0 };

      // Images without alt
      result.imgsNoAlt = document.querySelectorAll('img:not([alt])').length;

      // Icon buttons without label
      document.querySelectorAll('button').forEach(btn => {
        if (btn.offsetParent === null) return;
        const text = (btn.textContent || '').trim();
        const hasSvg = btn.querySelector('svg');
        const hasLabel = btn.getAttribute('aria-label') || btn.getAttribute('title');
        if (hasSvg && text.length < 2 && !hasLabel) result.btnsNoLabel++;
      });

      // Inputs without label
      document.querySelectorAll('input:not([type="hidden"]):not([type="file"]), textarea, select').forEach(el => {
        if (el.offsetParent === null) return;
        const hasLabel = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.closest('label');
        if (!hasLabel) result.inputsNoLabel++;
      });

      // Links without text
      document.querySelectorAll('a').forEach(a => {
        if (a.offsetParent === null) return;
        const text = (a.textContent || '').trim();
        const hasLabel = a.getAttribute('aria-label') || a.getAttribute('title');
        if (!text && !hasLabel) result.linksNoText++;
      });

      // Horizontal overflow
      const vw = document.documentElement.clientWidth;
      document.querySelectorAll('*').forEach(el => {
        if (el.scrollWidth > vw + 20) result.overflow++;
      });

      return result;
    });

    if (issues.btnsNoLabel > 0 || issues.imgsNoAlt > 0 || issues.inputsNoLabel > 0) {
      a11yIssues.push({ page: path, ...issues });
    }

    console.log('[A11Y]   btns=' + issues.btnsNoLabel + ' imgs=' + issues.imgsNoAlt + ' inputs=' + issues.inputsNoLabel + ' overflow=' + issues.overflow);
  }

  // Mobile test
  console.log('[A11Y] Mobile viewport test (375x667)');
  await page.setViewportSize({ width: 375, height: 667 });
  for (const path of ['/dashboard', '/chat']) {
    await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/audit-mobile' + path.replace(/\//g, '-') + '.png' });
    const overflow = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      return Array.from(document.querySelectorAll('*')).filter(e => e.scrollWidth > vw + 10).length;
    });
    console.log('[A11Y] ' + path + ' mobile overflow: ' + overflow);
  }

  await context.close();
  return { module: 'A11Y', a11yIssues };
}

// AGENT 6: API endpoints
async function auditAPI() {
  const authResp = await fetch('http://localhost:3000/api/auth/dev/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'youredik@gmail.com' })
  });
  const { accessToken } = await authResp.json();
  const headers = { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' };

  const endpoints = [
    '/api/health',
    '/api/auth/me',
    '/api/workspaces',
    '/api/sections',
    '/api/users',
    '/api/rbac/roles',
    '/api/rbac/permissions',
    '/api/rbac/permissions/my',
    '/api/bpmn/tasks/inbox',
    '/api/bpmn/templates',
    '/api/chat/conversations',
    '/api/chat/unread-counts',
    '/api/knowledge-base/articles',
    '/api/knowledge-base/categories',
    '/api/ai/notifications',
    '/api/sla/definitions',
    '/api/sla/dashboard',
    '/api/dmn/tables',
  ];

  const results = [];
  for (const path of endpoints) {
    try {
      const resp = await fetch('http://localhost:3000' + path, { headers });
      const isJson = resp.headers.get('content-type')?.includes('json');
      let items = '-';
      if (isJson) {
        const body = await resp.json();
        if (Array.isArray(body)) items = body.length;
        else if (body?.data && Array.isArray(body.data)) items = body.data.length;
      }
      const ok = resp.status < 400;
      results.push({ path, status: resp.status, ok, items });
      console.log('[API] ' + (ok ? 'OK' : 'FAIL') + ' ' + resp.status + ' ' + path + (items !== '-' ? ' (' + items + ')' : ''));
    } catch (err) {
      results.push({ path, status: 'ERR', ok: false });
      console.log('[API] ERR ' + path + ': ' + err.message.substring(0, 60));
    }
  }

  // Workspace-specific
  const wsResp = await fetch('http://localhost:3000/api/workspaces', { headers });
  const workspaces = await wsResp.json();
  if (workspaces.length > 0) {
    const wsId = workspaces[0].id;
    for (const path of [
      '/api/workspaces/' + wsId,
      '/api/workspaces/' + wsId + '/members',
      '/api/bpmn/definitions/' + wsId,
      '/api/bpmn/instances/workspace/' + wsId,
    ]) {
      const r = await fetch('http://localhost:3000' + path, { headers });
      const ok = r.status < 400;
      console.log('[API] ' + (ok ? 'OK' : 'FAIL') + ' ' + r.status + ' ' + path);
      results.push({ path, status: r.status, ok });
    }
  }

  const failed = results.filter(r => !r.ok);
  return { module: 'API', total: results.length, passed: results.filter(r => r.ok).length, failed: failed.length, failures: failed };
}

// Main - run all in parallel
async function main() {
  console.log('Starting 6 parallel audit agents...\n');
  const startTime = Date.now();

  const browser = await chromium.launch({ headless: true });

  const [admin, chat, kanban, kbDashTasks, a11y, api] = await Promise.all([
    auditAdmin(browser),
    auditChat(browser),
    auditKanban(browser),
    auditKBDashTasks(browser),
    auditA11y(browser),
    auditAPI(),
  ]);

  await browser.close();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '='.repeat(60));
  console.log('FULL AUDIT REPORT (' + elapsed + 's)');
  console.log('='.repeat(60));

  const allResults = [admin, chat, kanban, kbDashTasks, a11y, api];
  const allErrors = [];

  for (const r of allResults) {
    console.log('\n--- ' + r.module + ' ---');
    console.log(JSON.stringify(r, null, 2));
    if (r.errors) allErrors.push(...r.errors);
    if (r.failures) allErrors.push(...r.failures);
  }

  console.log('\n' + '='.repeat(60));
  console.log('TOTAL ERRORS: ' + allErrors.length);
  if (allErrors.length > 0) {
    console.log(JSON.stringify(allErrors, null, 2));
  }
  console.log('='.repeat(60));
}

main().catch(console.error);
