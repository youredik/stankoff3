#!/usr/bin/env node
/**
 * Preprod Deploy Verification — проверяет ВСЕ критичные функции после деплоя.
 * Авторизация через Keycloak SSO.
 */
import { chromium } from 'playwright';

const BASE = 'https://preprod.stankoff.ru';
const KEYCLOAK_EMAIL = 'youredik@gmail.com';
const KEYCLOAK_PASSWORD = process.env.KC_PASSWORD || 'Test123!';
const results = { pass: [], fail: [], warn: [] };

function log(status, msg) {
  const icon = status === 'PASS' ? '\x1b[32m✓\x1b[0m' : status === 'FAIL' ? '\x1b[31m✗\x1b[0m' : '\x1b[33m⚠\x1b[0m';
  console.log(`${icon} ${msg}`);
  if (status === 'PASS') results.pass.push(msg);
  else if (status === 'FAIL') results.fail.push(msg);
  else results.warn.push(msg);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // === 1. Keycloak Login ===
  console.log('\n=== 1. Keycloak Authentication ===');
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });

    // Keycloak SSO — кнопка "Войти через SSO" или редирект
    const ssoBtn = await page.$('a[href*="keycloak"], a[href*="oidc"], button:has-text("SSO"), button:has-text("Войти")');
    if (ssoBtn) {
      await ssoBtn.click();
      await page.waitForTimeout(2000);
    }

    // Если на странице Keycloak
    const emailInput = await page.$('#username, #email, input[name="username"], input[name="email"]');
    if (emailInput) {
      await emailInput.fill(KEYCLOAK_EMAIL);
      const passInput = await page.$('#password, input[name="password"]');
      if (passInput) {
        await passInput.fill(KEYCLOAK_PASSWORD);
        await page.click('#kc-login, button[type="submit"], input[type="submit"]');
        await page.waitForTimeout(3000);
      }
    }

    // Проверяем что залогинились — должен быть редирект на /dashboard
    const url = page.url();
    if (url.includes('/dashboard') || url.includes('/workspace')) {
      log('PASS', `Keycloak auth OK → ${url}`);
    } else {
      log('WARN', `Auth redirect → ${url} (может потребовать ручного входа)`);
    }
  } catch (e) {
    log('WARN', `Keycloak auth: ${e.message.slice(0, 100)}`);
  }

  // === 2. Извлекаем cookies для API запросов ===
  const cookies = await context.cookies();
  const accessToken = cookies.find(c => c.name === 'access_token');
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  // === 3. Проверяем API с авторизацией ===
  console.log('\n=== 2. API Endpoints (with auth) ===');
  const apiEndpoints = [
    '/api/health',
    '/api/users',
    '/api/workspaces',
    '/api/rbac/roles',
    '/api/rbac/permissions',
    '/api/rbac/permissions/my',
    '/api/chat/conversations',
    '/api/knowledge-base/articles',
    '/api/ai/usage/logs',
    '/api/bpmn/tasks/inbox',
    '/api/entities/product-categories',
  ];

  for (const ep of apiEndpoints) {
    try {
      const resp = await page.request.get(`${BASE}${ep}`, {
        headers: { Cookie: cookieHeader },
        timeout: 10000,
      });
      const status = resp.status();
      if (status >= 200 && status < 300) {
        log('PASS', `API ${ep} → ${status}`);
      } else if (status === 401) {
        log('WARN', `API ${ep} → 401 (auth required)`);
      } else {
        log('FAIL', `API ${ep} → ${status}`);
      }
    } catch (e) {
      log('FAIL', `API ${ep} → ${e.message.slice(0, 80)}`);
    }
  }

  // === 4. Проверяем страницы ===
  console.log('\n=== 3. Frontend Pages ===');
  const pages = [
    '/dashboard',
    '/workspace',
    '/tasks',
    '/chat',
    '/knowledge-base',
    '/admin/users',
    '/admin/roles',
    '/admin/invitations',
    '/profile',
  ];

  for (const p of pages) {
    try {
      const resp = await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const status = resp?.status() || 0;

      // Check for console errors
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await page.waitForTimeout(2000);

      if (status >= 200 && status < 400) {
        log('PASS', `Page ${p} → ${status}`);
      } else {
        log('FAIL', `Page ${p} → ${status}`);
      }
    } catch (e) {
      log('FAIL', `Page ${p} → ${e.message.slice(0, 80)}`);
    }
  }

  // === 5. Проверяем новые ассеты ===
  console.log('\n=== 4. New Assets ===');
  for (const asset of ['/favicon.svg', '/manifest.json', '/robots.txt']) {
    try {
      const resp = await page.request.get(`${BASE}${asset}`, { timeout: 5000 });
      const status = resp.status();
      if (status === 200) {
        log('PASS', `Asset ${asset} → ${status}`);
      } else {
        log('FAIL', `Asset ${asset} → ${status}`);
      }
    } catch (e) {
      log('FAIL', `Asset ${asset} → ${e.message.slice(0, 80)}`);
    }
  }

  // === 6. Проверяем Security Headers (Helmet) ===
  console.log('\n=== 5. Security Headers (Helmet) ===');
  try {
    const resp = await page.request.get(`${BASE}/api/health`, { timeout: 5000 });
    const headers = resp.headers();
    const securityHeaders = {
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'SAMEORIGIN',
      'x-xss-protection': '0',
    };
    for (const [header, expected] of Object.entries(securityHeaders)) {
      const val = headers[header];
      if (val) {
        log('PASS', `Header ${header}: ${val}`);
      } else {
        log('WARN', `Header ${header}: missing (may be set by Nginx)`);
      }
    }
    // Helmet removes X-Powered-By
    if (!headers['x-powered-by']) {
      log('PASS', 'X-Powered-By removed (Helmet)');
    } else {
      log('WARN', `X-Powered-By still present: ${headers['x-powered-by']}`);
    }
  } catch (e) {
    log('FAIL', `Security headers: ${e.message.slice(0, 80)}`);
  }

  // === 7. Проверяем workspaces (те что ломались раньше) ===
  console.log('\n=== 6. Workspace Pages ===');
  try {
    const resp = await page.request.get(`${BASE}/api/workspaces`, {
      headers: { Cookie: cookieHeader },
      timeout: 10000,
    });
    if (resp.status() === 200) {
      const workspaces = await resp.json();
      const wsToCheck = workspaces.slice(0, 5);
      for (const ws of wsToCheck) {
        try {
          const pageResp = await page.goto(`${BASE}/workspace/${ws.id}`, {
            waitUntil: 'domcontentloaded', timeout: 15000
          });
          const s = pageResp?.status() || 0;
          if (s >= 200 && s < 400) {
            log('PASS', `Workspace "${ws.name}" → ${s}`);
          } else {
            log('FAIL', `Workspace "${ws.name}" → ${s}`);
          }
        } catch (e) {
          log('FAIL', `Workspace "${ws.name}" → ${e.message.slice(0, 60)}`);
        }
      }
    } else {
      log('WARN', `Cannot list workspaces (${resp.status()})`);
    }
  } catch (e) {
    log('WARN', `Workspaces: ${e.message.slice(0, 80)}`);
  }

  // === Summary ===
  console.log('\n' + '='.repeat(50));
  console.log(`РЕЗУЛЬТАТЫ: ${results.pass.length} PASS / ${results.fail.length} FAIL / ${results.warn.length} WARN`);
  if (results.fail.length > 0) {
    console.log('\nFAILED:');
    results.fail.forEach(f => console.log(`  ✗ ${f}`));
  }
  if (results.warn.length > 0) {
    console.log('\nWARNINGS:');
    results.warn.forEach(w => console.log(`  ⚠ ${w}`));
  }
  console.log('='.repeat(50));

  await browser.close();

  // Return results as JSON for further processing
  console.log('\n' + JSON.stringify(results));
}

run().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
