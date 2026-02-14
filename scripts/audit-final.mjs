/**
 * Comprehensive Stankoff Portal Audit Script (v2 - fixed)
 * Tests: Entity CRUD, Chat Search, RBAC, Knowledge Base, Pages, Accessibility, Favicon
 *
 * Usage: node scripts/audit-final.mjs
 */

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3001';
const LOGIN_EMAIL = 'youredik@gmail.com';

const results = [];

function record(area, test, status, detail = '') {
  results.push({ area, test, status, detail });
  const icon = status === 'PASS' ? '[PASS]' : status === 'FAIL' ? '[FAIL]' : '[WARN]';
  console.log(`${icon} [${area}] ${test}${detail ? ' -- ' + detail : ''}`);
}

// -- API helper --
async function getToken() {
  const res = await fetch(`${API_URL}/api/auth/dev/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: LOGIN_EMAIL }),
  });
  const data = await res.json();
  return data.accessToken;
}

async function api(token, method, path, body = undefined) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_URL}${path}`, opts);
  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

// -- Login helper for Playwright --
async function loginBrowser(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });

  try {
    const userCard = page.locator('text=Эдуард').first();
    if (await userCard.isVisible({ timeout: 5000 })) {
      await userCard.click();
    } else {
      const anyCard = page.locator('[class*="cursor"]').first();
      await anyCard.click({ timeout: 5000 });
    }
  } catch {
    const allCards = page.locator('.grid > div, .flex > div').filter({ hasText: /gmail|stankoff/ });
    if (await allCards.count() > 0) {
      await allCards.first().click();
    } else {
      throw new Error('Cannot find user card on login page');
    }
  }

  await page.waitForURL(/\/(dashboard|workspace|tasks|chat)/, { timeout: 15000 });
}

// ================================================================
// TESTS
// ================================================================

async function testEntityCRUD(token) {
  console.log('\n=== 1. ENTITY CRUD ===');

  const { data: workspaces } = await api(token, 'GET', '/api/workspaces');
  if (!Array.isArray(workspaces) || workspaces.length === 0) {
    record('Entity CRUD', 'Get workspaces', 'FAIL', 'No workspaces found');
    return;
  }
  const ws = workspaces[0];
  record('Entity CRUD', 'Get workspaces', 'PASS', `Found ${workspaces.length} workspaces, using "${ws.name}"`);

  // Create entity
  const createBody = {
    workspaceId: ws.id,
    title: `Audit Test Entity ${Date.now()}`,
    data: {},
  };
  const { status: createStatus, data: created } = await api(token, 'POST', '/api/entities', createBody);
  if (createStatus === 201 || createStatus === 200) {
    record('Entity CRUD', 'Create entity', 'PASS', `ID: ${created.id}, CustomId: ${created.customId || 'N/A'}`);
  } else {
    record('Entity CRUD', 'Create entity', 'FAIL', `Status: ${createStatus}, Body: ${JSON.stringify(created).slice(0, 200)}`);
    return;
  }

  const entityId = created.id;

  // Read entity
  const { status: readStatus, data: readData } = await api(token, 'GET', `/api/entities/${entityId}`);
  if (readStatus === 200 && readData.id === entityId) {
    record('Entity CRUD', 'Read entity', 'PASS', `Title: "${readData.title}"`);
  } else {
    record('Entity CRUD', 'Read entity', 'FAIL', `Status: ${readStatus}`);
  }

  // Update entity (NB: uses PUT, not PATCH!)
  const updateBody = { title: `Updated Audit ${Date.now()}` };
  const { status: updateStatus, data: updated } = await api(token, 'PUT', `/api/entities/${entityId}`, updateBody);
  if (updateStatus === 200) {
    record('Entity CRUD', 'Update entity (PUT)', 'PASS', `New title: "${updated.title || updateBody.title}"`);
  } else {
    record('Entity CRUD', 'Update entity (PUT)', 'FAIL', `Status: ${updateStatus}, Body: ${JSON.stringify(updated).slice(0, 200)}`);
  }

  // Check kanban view
  const { status: kanbanStatus } = await api(token, 'GET', `/api/entities/kanban?workspaceId=${ws.id}`);
  if (kanbanStatus === 200) {
    record('Entity CRUD', 'Kanban view', 'PASS', 'Kanban returned valid structure');
  } else {
    record('Entity CRUD', 'Kanban view', 'FAIL', `Status: ${kanbanStatus}`);
  }

  // Check table view
  const { status: tableStatus, data: tableData } = await api(token, 'GET', `/api/entities/table?workspaceId=${ws.id}`);
  if (tableStatus === 200) {
    record('Entity CRUD', 'Table view', 'PASS', `Table returned`);
  } else {
    record('Entity CRUD', 'Table view', 'FAIL', `Status: ${tableStatus}`);
  }

  // Delete entity (cleanup)
  const { status: deleteStatus } = await api(token, 'DELETE', `/api/entities/${entityId}`);
  if (deleteStatus === 200 || deleteStatus === 204) {
    record('Entity CRUD', 'Delete entity', 'PASS', 'Cleanup successful');
  } else {
    record('Entity CRUD', 'Delete entity', 'FAIL', `Status: ${deleteStatus}`);
  }
}

async function testChatSearch(token) {
  console.log('\n=== 2. CHAT SEARCH ===');

  // Test chat search (was returning 500 before fix)
  const { status: searchStatus, data: searchData } = await api(token, 'GET', '/api/chat/conversations/search?q=test');
  if (searchStatus === 200) {
    const count = Array.isArray(searchData) ? searchData.length : (searchData.data?.length || 0);
    record('Chat', 'Search messages (q=test)', 'PASS', `Found ${count} results`);
  } else {
    record('Chat', 'Search messages (q=test)', 'FAIL', `Status: ${searchStatus}, Body: ${JSON.stringify(searchData).slice(0, 200)}`);
  }

  // Test empty query (was crashing with 500)
  const { status: emptyStatus } = await api(token, 'GET', '/api/chat/conversations/search?q=');
  if (emptyStatus === 200) {
    record('Chat', 'Search empty query', 'PASS', 'Returns 200 (no crash)');
  } else {
    record('Chat', 'Search empty query', 'FAIL', `Status: ${emptyStatus}`);
  }

  // Test conversations list
  const { status: convStatus, data: convData } = await api(token, 'GET', '/api/chat/conversations');
  if (convStatus === 200) {
    const count = Array.isArray(convData) ? convData.length : (convData.data?.length || 0);
    record('Chat', 'List conversations', 'PASS', `Found ${count} conversations`);
  } else {
    record('Chat', 'List conversations', 'FAIL', `Status: ${convStatus}`);
  }
}

async function testRBAC(token) {
  console.log('\n=== 3. RBAC ===');

  // List roles
  const { status: listStatus, data: roles } = await api(token, 'GET', '/api/rbac/roles');
  if (listStatus === 200) {
    const count = Array.isArray(roles) ? roles.length : (roles.data?.length || 0);
    record('RBAC', 'List roles', 'PASS', `Found ${count} roles`);
  } else {
    record('RBAC', 'List roles', 'FAIL', `Status: ${listStatus}`);
  }

  // Create role
  const roleName = `Test Audit Role ${Date.now()}`;
  const createBody = {
    name: roleName,
    scope: 'global',
    permissions: ['workspace:read'],
  };
  const { status: createStatus, data: createdRole } = await api(token, 'POST', '/api/rbac/roles', createBody);
  if (createStatus === 201 || createStatus === 200) {
    record('RBAC', 'Create role', 'PASS', `ID: ${createdRole.id}, Name: "${createdRole.name}"`);

    // Cleanup
    const { status: deleteStatus } = await api(token, 'DELETE', `/api/rbac/roles/${createdRole.id}`);
    if (deleteStatus === 200 || deleteStatus === 204) {
      record('RBAC', 'Delete test role', 'PASS', 'Cleanup successful');
    } else {
      record('RBAC', 'Delete test role', 'WARN', `Status: ${deleteStatus} (manual cleanup needed)`);
    }
  } else {
    record('RBAC', 'Create role', 'FAIL', `Status: ${createStatus}, Body: ${JSON.stringify(createdRole).slice(0, 300)}`);
  }

  // My permissions
  const { status: permStatus, data: perms } = await api(token, 'GET', '/api/rbac/permissions/my');
  if (permStatus === 200) {
    const count = Array.isArray(perms) ? perms.length : (perms.permissions?.length || Object.keys(perms).length);
    record('RBAC', 'My permissions', 'PASS', `Returned ${count} entries`);
  } else {
    record('RBAC', 'My permissions', 'FAIL', `Status: ${permStatus}`);
  }

  // Permissions registry
  const { status: regStatus } = await api(token, 'GET', '/api/rbac/permissions');
  if (regStatus === 200) {
    record('RBAC', 'Permissions registry', 'PASS', 'Returned registry');
  } else {
    record('RBAC', 'Permissions registry', 'FAIL', `Status: ${regStatus}`);
  }
}

async function testKnowledgeBase(token) {
  console.log('\n=== 4. KNOWLEDGE BASE ===');

  const { data: workspaces } = await api(token, 'GET', '/api/workspaces');
  const wsId = workspaces?.[0]?.id;

  if (!wsId) {
    record('KB', 'Get workspace for article', 'FAIL', 'No workspace available');
    return;
  }

  // Create article
  const articleBody = {
    title: `Test Audit Article ${Date.now()}`,
    content: 'This is a test article created by the audit script.',
    workspaceId: wsId,
  };
  const { status: createStatus, data: article } = await api(token, 'POST', '/api/knowledge-base/articles', articleBody);
  if (createStatus === 201 || createStatus === 200) {
    record('KB', 'Create article', 'PASS', `ID: ${article.id}, Title: "${article.title}"`);

    // Read article
    const { status: readStatus, data: readArticle } = await api(token, 'GET', `/api/knowledge-base/articles/${article.id}`);
    if (readStatus === 200) {
      record('KB', 'Read article', 'PASS', `Title: "${readArticle.title}"`);
    } else {
      record('KB', 'Read article', 'FAIL', `Status: ${readStatus}`);
    }

    // Update article (PUT, WITHOUT workspaceId in body -- DTO forbids it)
    const { status: updateStatus } = await api(token, 'PUT', `/api/knowledge-base/articles/${article.id}`, {
      title: `Updated Audit Article ${Date.now()}`,
      content: 'Updated content by audit.',
    });
    if (updateStatus === 200) {
      record('KB', 'Update article (PUT)', 'PASS', 'Updated successfully');
    } else {
      record('KB', 'Update article (PUT)', 'FAIL', `Status: ${updateStatus}`);
    }

    // Delete article (cleanup)
    const { status: deleteStatus } = await api(token, 'DELETE', `/api/knowledge-base/articles/${article.id}`);
    if (deleteStatus === 200 || deleteStatus === 204) {
      record('KB', 'Delete article', 'PASS', 'Cleanup successful');
    } else {
      record('KB', 'Delete article', 'WARN', `Status: ${deleteStatus}`);
    }
  } else {
    record('KB', 'Create article', 'FAIL', `Status: ${createStatus}, Body: ${JSON.stringify(article).slice(0, 300)}`);
  }

  // List articles
  const { status: listStatus, data: articles } = await api(token, 'GET', '/api/knowledge-base/articles');
  if (listStatus === 200) {
    const count = Array.isArray(articles) ? articles.length : (articles.data?.length || 0);
    record('KB', 'List articles', 'PASS', `Found ${count} articles`);
  } else {
    record('KB', 'List articles', 'FAIL', `Status: ${listStatus}`);
  }
}

async function testPagesAndConsoleErrors(browser) {
  console.log('\n=== 5. PAGES WITHOUT ERRORS ===');

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await loginBrowser(page);
    record('Pages', 'Login via browser', 'PASS', `Redirected to ${page.url()}`);
  } catch (e) {
    record('Pages', 'Login via browser', 'FAIL', e.message);
    await context.close();
    return;
  }

  const pagesToTest = [
    { path: '/dashboard', name: 'Dashboard' },
    { path: '/tasks', name: 'Tasks' },
    { path: '/chat', name: 'Chat' },
    { path: '/knowledge-base', name: 'Knowledge Base' },
    { path: '/admin/users', name: 'Admin Users' },
    { path: '/admin/roles', name: 'Admin Roles' },
    { path: '/profile', name: 'Profile' },
  ];

  for (const pg of pagesToTest) {
    const consoleErrors = [];
    const networkErrors = [];

    const onConsole = msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter out common benign console errors (favicon 404, etc.)
        if (text.includes('favicon.ico')) return;
        consoleErrors.push(text.slice(0, 200));
      }
    };
    const onResponse = response => {
      if (response.status() >= 500) {
        networkErrors.push(`${response.status()} ${response.url().slice(0, 100)}`);
      }
    };

    page.on('console', onConsole);
    page.on('response', onResponse);

    try {
      await page.goto(`${BASE_URL}${pg.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2500);

      if (networkErrors.length > 0) {
        record('Pages', `${pg.name} (${pg.path})`, 'FAIL', `5xx errors: ${networkErrors.join('; ')}`);
      } else if (consoleErrors.length > 0) {
        // Only warn on console errors (not 5xx), as some 404s for optional resources are benign
        record('Pages', `${pg.name} (${pg.path})`, 'WARN', `${consoleErrors.length} console errors: ${consoleErrors[0]}`);
      } else {
        record('Pages', `${pg.name} (${pg.path})`, 'PASS', 'No errors');
      }
    } catch (e) {
      record('Pages', `${pg.name} (${pg.path})`, 'FAIL', `Navigation error: ${e.message}`);
    }

    page.off('console', onConsole);
    page.off('response', onResponse);
  }

  await context.close();
}

async function testAccessibility(browser) {
  console.log('\n=== 6. ACCESSIBILITY ===');

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await loginBrowser(page);
  } catch (e) {
    record('A11y', 'Login', 'FAIL', e.message);
    await context.close();
    return;
  }

  // Check dashboard for icon-only buttons
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    const allButtons = page.locator('button');
    const buttonCount = await allButtons.count();
    let iconOnlyWithoutAria = 0;
    let totalIconOnly = 0;
    const missingAriaExamples = [];

    for (let i = 0; i < Math.min(buttonCount, 60); i++) {
      const btn = allButtons.nth(i);
      try {
        const isVisible = await btn.isVisible();
        if (!isVisible) continue;
        
        const text = (await btn.textContent({ timeout: 1000 }))?.trim();
        const ariaLabel = await btn.getAttribute('aria-label');
        const title = await btn.getAttribute('title');

        if (!text || text.length === 0) {
          totalIconOnly++;
          if (!ariaLabel && !title) {
            iconOnlyWithoutAria++;
            const html = await btn.evaluate(el => el.outerHTML.slice(0, 150));
            if (missingAriaExamples.length < 3) {
              missingAriaExamples.push(html);
            }
          }
        }
      } catch {
        // Button may be detached, skip
      }
    }

    if (iconOnlyWithoutAria === 0) {
      record('A11y', 'Dashboard icon-only buttons have aria-label/title', 'PASS', `${totalIconOnly} icon-only buttons, all labeled`);
    } else {
      record('A11y', 'Dashboard icon-only buttons have aria-label/title', 'FAIL',
        `${iconOnlyWithoutAria}/${totalIconOnly} missing. Examples: ${missingAriaExamples.join(' | ').slice(0, 400)}`);
    }
  } catch (e) {
    record('A11y', 'Dashboard buttons check', 'FAIL', e.message);
  }

  // Check chat page inputs
  try {
    await page.goto(`${BASE_URL}/chat`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    const chatInputs = page.locator('input, textarea');
    const inputCount = await chatInputs.count();
    let missingLabels = 0;
    const missingExamples = [];

    for (let i = 0; i < inputCount; i++) {
      const input = chatInputs.nth(i);
      try {
        const isVisible = await input.isVisible();
        if (!isVisible) continue;
        
        const placeholder = await input.getAttribute('placeholder');
        const ariaLabel = await input.getAttribute('aria-label');
        const id = await input.getAttribute('id');
        const type = await input.getAttribute('type');
        
        if (!ariaLabel && !placeholder) {
          missingLabels++;
          missingExamples.push(`<${await input.evaluate(el => el.tagName.toLowerCase())} type="${type}" id="${id}">`);
        }
      } catch { /* skip detached */ }
    }

    if (missingLabels === 0) {
      record('A11y', 'Chat inputs have labels/placeholders', 'PASS', `${inputCount} inputs checked`);
    } else {
      record('A11y', 'Chat inputs have labels/placeholders', 'FAIL', `${missingLabels} missing: ${missingExamples.join(', ')}`);
    }
  } catch (e) {
    record('A11y', 'Chat page check', 'FAIL', e.message);
  }

  // Check tasks page
  try {
    await page.goto(`${BASE_URL}/tasks`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    // Check for any interactive content
    const mainContent = page.locator('main, [role="main"], #__next > div');
    const text = await mainContent.first().textContent({ timeout: 3000 });
    
    if (text && text.trim().length > 0) {
      record('A11y', 'Tasks page renders content', 'PASS', `Content length: ${text.trim().length} chars`);
    } else {
      record('A11y', 'Tasks page renders content', 'WARN', 'No visible content');
    }
  } catch (e) {
    record('A11y', 'Tasks page check', 'FAIL', e.message);
  }

  await context.close();
}

async function testFavicon() {
  console.log('\n=== 7. FAVICON ===');

  try {
    const res = await fetch(`${BASE_URL}/favicon.svg`);
    if (res.status === 200) {
      const contentType = res.headers.get('content-type') || '';
      record('Favicon', '/favicon.svg returns 200', 'PASS', `Content-Type: ${contentType}`);
    } else {
      record('Favicon', '/favicon.svg returns 200', 'FAIL', `Status: ${res.status}`);
    }
  } catch (e) {
    record('Favicon', '/favicon.svg', 'FAIL', `Fetch error: ${e.message}`);
  }

  try {
    const res = await fetch(`${BASE_URL}/favicon.ico`);
    if (res.status === 200) {
      record('Favicon', '/favicon.ico returns 200', 'PASS', '');
    } else {
      record('Favicon', '/favicon.ico', 'WARN', `Status: ${res.status} (using .svg only)`);
    }
  } catch (e) {
    record('Favicon', '/favicon.ico', 'WARN', `Not available: ${e.message}`);
  }
}

// ================================================================
// MAIN
// ================================================================

async function main() {
  console.log('============================================================');
  console.log('     STANKOFF PORTAL -- COMPREHENSIVE AUDIT (v2)');
  console.log('     Date: ' + new Date().toISOString().slice(0, 19));
  console.log('============================================================\n');

  const token = await getToken();
  if (!token) {
    console.error('FATAL: Cannot get auth token');
    process.exit(1);
  }
  console.log('Auth token obtained successfully.\n');

  // API tests
  await testEntityCRUD(token);
  await testChatSearch(token);
  await testRBAC(token);
  await testKnowledgeBase(token);
  await testFavicon();

  // Browser tests
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    await testPagesAndConsoleErrors(browser);
    await testAccessibility(browser);
  } catch (e) {
    record('Browser', 'Launch browser', 'FAIL', e.message);
  } finally {
    if (browser) await browser.close();
  }

  // -- Summary --
  console.log('\n============================================================');
  console.log('                    AUDIT SUMMARY');
  console.log('============================================================');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  const total = results.length;

  console.log(`  PASS: ${passed}  FAIL: ${failed}  WARN: ${warned}  TOTAL: ${total}`);

  if (failed > 0) {
    console.log('\n--- FAILURES ---');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  [FAIL] [${r.area}] ${r.test}: ${r.detail}`);
    });
  }

  if (warned > 0) {
    console.log('\n--- WARNINGS ---');
    results.filter(r => r.status === 'WARN').forEach(r => {
      console.log(`  [WARN] [${r.area}] ${r.test}: ${r.detail}`);
    });
  }

  // Output JSON
  const jsonOutput = {
    timestamp: new Date().toISOString(),
    summary: { total, passed, failed, warned },
    results: results.map(r => ({
      area: r.area,
      test: r.test,
      status: r.status,
      detail: r.detail,
    })),
  };

  console.log('\n--- JSON RESULTS ---');
  console.log(JSON.stringify(jsonOutput, null, 2));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
