/**
 * Audit: Admin Panel, RBAC & Profile — Stankoff Portal
 *
 * Checks:
 *   1. Login via user card (youredik@gmail.com)
 *   2. /admin/users — users list loads, count
 *   3. /admin/roles — roles list loads
 *   4. /admin/invitations — invitations page
 *   5. Console errors collection per page
 *   6. RBAC API: current user permissions (super_admin)
 *   7. /profile — profile settings, avatar, fields
 *
 * Usage: node scripts/audit-admin.mjs
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE = 'http://localhost:3000';
const API_BASE = 'http://localhost:3001';
const SCREENSHOTS = join(import.meta.dirname, '..', 'audit-screenshots');
mkdirSync(SCREENSHOTS, { recursive: true });

const findings = [];
const consoleErrors = {};

function log(msg) {
  const ts = new Date().toLocaleTimeString('ru-RU');
  console.log(`[${ts}] ${msg}`);
}

function finding(severity, area, message, details = '') {
  findings.push({ severity, area, message, details });
  const icon = severity === 'ERROR' ? 'ERR' : severity === 'WARN' ? 'WARN' : 'OK';
  log(`[${icon}] [${area}] ${message}${details ? ' -- ' + details : ''}`);
}

async function screenshot(page, name) {
  const path = join(SCREENSHOTS, `admin_${name}.png`);
  await page.screenshot({ path, fullPage: true });
  log(`Screenshot: admin_${name}.png`);
}

async function waitForLoad(page, timeout = 10000) {
  await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
  await page.waitForTimeout(1000);
}

// --- Main ---

(async () => {
  log('=== Stankoff Portal -- Admin/RBAC/Profile Audit ===\n');

  // Step 0: Obtain access token directly from backend API
  log('-- Step 0: Obtain access token via API --');
  let accessToken = null;
  try {
    const loginResp = await fetch(`${API_BASE}/api/auth/dev/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'youredik@gmail.com' }),
    });
    const loginData = await loginResp.json();
    accessToken = loginData.accessToken;
    if (accessToken) {
      finding('OK', 'API/Token', `Access token obtained (${accessToken.length} chars)`);
    } else {
      finding('ERROR', 'API/Token', 'No access token in dev-login response');
    }
  } catch (err) {
    finding('ERROR', 'API/Token', `Dev-login failed: ${err.message}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
  });

  let currentPageLabel = 'unknown';
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      if (!consoleErrors[currentPageLabel]) consoleErrors[currentPageLabel] = [];
      consoleErrors[currentPageLabel].push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    if (!consoleErrors[currentPageLabel]) consoleErrors[currentPageLabel] = [];
    consoleErrors[currentPageLabel].push(`PageError: ${err.message}`);
  });

  // --- 1. Login via UI ---
  log('\n-- Step 1: Login --');
  currentPageLabel = 'login';
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  let loginClicked = false;
  const allElements = await page.$$('button, [class*="cursor-pointer"], [role="button"]');
  for (const el of allElements) {
    const text = await el.textContent().catch(() => '');
    if (text && (text.includes('youredik') || text.includes('Станков Э'))) {
      await el.click();
      loginClicked = true;
      finding('OK', 'Login', 'Clicked user card for youredik@gmail.com');
      break;
    }
  }

  if (!loginClicked) {
    finding('ERROR', 'Login', 'Could not find youredik login card');
    await screenshot(page, 'login_failed');
    await browser.close();
    process.exit(1);
  }

  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 }).catch(() => {});
  await waitForLoad(page);

  const afterLoginUrl = page.url();
  if (afterLoginUrl.includes('/login')) {
    finding('ERROR', 'Login', 'Still on login page', afterLoginUrl);
  } else {
    finding('OK', 'Login', 'Logged in successfully', `Redirected to ${afterLoginUrl}`);
  }
  await screenshot(page, 'after_login');

  // --- 2. /admin/users ---
  log('\n-- Step 2: Admin / Users --');
  currentPageLabel = 'admin_users';
  await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle', timeout: 20000 });
  await waitForLoad(page);
  await screenshot(page, 'admin_users');

  const usersPageText = await page.textContent('body');
  if (usersPageText.includes('403') || usersPageText.includes('Доступ запрещён')) {
    finding('ERROR', 'Admin/Users', 'Access denied');
  } else {
    const tableRows = await page.$$('table tbody tr');
    if (tableRows.length > 0) {
      finding('OK', 'Admin/Users', `Users list: ${tableRows.length} rows`);
    } else {
      finding('WARN', 'Admin/Users', 'No table rows detected');
    }

    const searchInput = await page.$('input[type="search"], input[placeholder*="Поиск"], input[placeholder*="поиск"]');
    if (searchInput) {
      finding('OK', 'Admin/Users', 'Search input found');
      await searchInput.fill('Станков');
      await page.waitForTimeout(500);
      const filtered = await page.$$('table tbody tr');
      if (filtered.length > 0 && filtered.length < tableRows.length) {
        finding('OK', 'Admin/Users', `Search works: ${filtered.length} results for "Станков"`);
      }
      await searchInput.fill('');
      await page.waitForTimeout(300);
    }

    if (usersPageText.includes('Роль') || usersPageText.includes('роль')) {
      finding('OK', 'Admin/Users', 'Role column visible');
    }
  }

  // --- 3. /admin/roles ---
  log('\n-- Step 3: Admin / Roles --');
  currentPageLabel = 'admin_roles';
  await page.goto(`${BASE}/admin/roles`, { waitUntil: 'networkidle', timeout: 20000 });
  await waitForLoad(page);
  await screenshot(page, 'admin_roles');

  const rolesPageText = await page.textContent('body');
  const expectedRoles = ['super_admin', 'department_head', 'employee', 'section_admin', 'section_viewer', 'ws_admin', 'ws_editor', 'ws_viewer'];
  const foundRoles = expectedRoles.filter(r => rolesPageText.includes(r));

  if (foundRoles.length > 0) {
    finding('OK', 'Admin/Roles', `Found ${foundRoles.length}/8 roles: ${foundRoles.join(', ')}`);
  } else {
    finding('WARN', 'Admin/Roles', 'No standard role names found');
  }

  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = (await btn.textContent()).trim();
    if (text.includes('Новая') || text.includes('Создать') || text.includes('Добавить')) {
      finding('OK', 'Admin/Roles', `Create button: "${text}"`);
      break;
    }
  }

  if (rolesPageText.includes('системная') || rolesPageText.includes('Системная') || rolesPageText.includes('system')) {
    finding('OK', 'Admin/Roles', 'System role protection indicator found');
  }

  // --- 4. /admin/invitations ---
  log('\n-- Step 4: Admin / Invitations --');
  currentPageLabel = 'admin_invitations';
  await page.goto(`${BASE}/admin/invitations`, { waitUntil: 'networkidle', timeout: 20000 });
  await waitForLoad(page);
  await screenshot(page, 'admin_invitations');

  const invPageText = await page.textContent('body');
  finding('OK', 'Admin/Invitations', 'Page loaded');

  const invBtns = await page.$$('button');
  for (const btn of invBtns) {
    const text = (await btn.textContent()).trim();
    if (text.includes('Пригласить') || text.includes('Invite') || text.includes('Создать')) {
      finding('OK', 'Admin/Invitations', `Invite button: "${text}"`);
      break;
    }
  }

  const invRows = await page.$$('table tbody tr');
  if (invRows.length > 0) {
    finding('OK', 'Admin/Invitations', `${invRows.length} invitation row(s)`);
  }

  // --- 5. Console errors ---
  log('\n-- Step 5: Console Errors --');
  for (const [pageLabel, errors] of Object.entries(consoleErrors)) {
    const noise = ['favicon', 'DevTools', 'React DevTools', 'third-party cookie', 'ResizeObserver', 'Hydration'];
    const realErrors = errors.filter(e => !noise.some(n => e.includes(n)));
    if (realErrors.length > 0) {
      finding('WARN', `Console/${pageLabel}`, `${realErrors.length} error(s)`, realErrors.slice(0, 3).join(' | '));
    } else {
      finding('OK', `Console/${pageLabel}`, 'No significant errors');
    }
  }

  // --- 6. RBAC API (using direct token) ---
  log('\n-- Step 6: RBAC API Checks --');
  currentPageLabel = 'rbac_api';

  if (!accessToken) {
    finding('ERROR', 'RBAC/API', 'Skipping API checks -- no access token');
  } else {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    };

    // 6a: /api/auth/me
    try {
      const meResp = await fetch(`${API_BASE}/api/auth/me`, { headers });
      const meData = await meResp.json();
      if (meResp.ok) {
        const name = `${meData.firstName || ''} ${meData.lastName || ''}`.trim() || meData.email;
        finding('OK', 'Auth/Me', `Logged in as: ${name}`);
        log(`   Email: ${meData.email}`);
        log(`   Role: ${meData.role}`);
        log(`   ID: ${meData.id}`);
        if (meData.roleId) log(`   roleId: ${meData.roleId}`);
        if (meData.role === 'admin' || meData.role === 'super_admin') {
          finding('OK', 'Auth/Me', `Confirmed admin role: ${meData.role}`);
        }
      } else {
        finding('ERROR', 'Auth/Me', `/api/auth/me returned ${meResp.status}`);
      }
    } catch (err) {
      finding('ERROR', 'Auth/Me', `Failed: ${err.message}`);
    }

    // 6b: /api/rbac/permissions/my
    try {
      const permResp = await fetch(`${API_BASE}/api/rbac/permissions/my`, { headers });
      const permData = await permResp.json();
      if (permResp.ok) {
        const perms = Array.isArray(permData) ? permData : permData.permissions || [];
        finding('OK', 'RBAC/MyPerms', `User has ${perms.length} permissions`);

        const hasWildcard = perms.some(p => {
          const key = typeof p === 'string' ? p : p.key || p.name || '';
          return key === '*';
        });
        if (hasWildcard) {
          finding('OK', 'RBAC/MyPerms', 'Wildcard (*) found -- confirmed super_admin');
        } else {
          const keys = perms.slice(0, 15).map(p => typeof p === 'string' ? p : p.key || p.name || '?');
          log(`   Permissions: ${keys.join(', ')}`);
        }
      } else {
        finding('ERROR', 'RBAC/MyPerms', `/api/rbac/permissions/my returned ${permResp.status}`);
      }
    } catch (err) {
      finding('ERROR', 'RBAC/MyPerms', `Failed: ${err.message}`);
    }

    // 6c: /api/rbac/roles
    try {
      const rolesResp = await fetch(`${API_BASE}/api/rbac/roles`, { headers });
      const rolesData = await rolesResp.json();
      if (rolesResp.ok) {
        const roles = Array.isArray(rolesData) ? rolesData : rolesData.roles || [];
        finding('OK', 'RBAC/RolesAPI', `API returned ${roles.length} roles`);
        for (const role of roles) {
          const name = role.name || role.key || '?';
          const scope = role.scope || '?';
          const permCount = role.permissions ? role.permissions.length : '?';
          const sys = role.isSystem ? ' [SYSTEM]' : '';
          log(`   ${name} (scope: ${scope}, perms: ${permCount})${sys}`);
        }
        const systemRoles = roles.filter(r => r.isSystem);
        if (systemRoles.length > 0) {
          finding('OK', 'RBAC/RolesAPI', `${systemRoles.length} system (protected) roles`);
        }
      } else {
        finding('ERROR', 'RBAC/RolesAPI', `/api/rbac/roles returned ${rolesResp.status}`);
      }
    } catch (err) {
      finding('ERROR', 'RBAC/RolesAPI', `Failed: ${err.message}`);
    }

    // 6d: /api/rbac/permissions (registry)
    try {
      const regResp = await fetch(`${API_BASE}/api/rbac/permissions`, { headers });
      const regData = await regResp.json();
      if (regResp.ok) {
        const perms = Array.isArray(regData) ? regData : [];
        finding('OK', 'RBAC/Registry', `Registry: ${perms.length} permissions`);
        const cats = {};
        for (const p of perms) {
          const c = p.category || 'uncategorized';
          cats[c] = (cats[c] || 0) + 1;
        }
        for (const [cat, count] of Object.entries(cats)) {
          log(`   "${cat}": ${count}`);
        }
      } else {
        finding('WARN', 'RBAC/Registry', `/api/rbac/permissions returned ${regResp.status}`);
      }
    } catch (err) {
      finding('WARN', 'RBAC/Registry', `Failed: ${err.message}`);
    }

    // 6e: Test system role deletion protection
    try {
      const rolesResp = await fetch(`${API_BASE}/api/rbac/roles`, { headers });
      const roles = await rolesResp.json();
      const systemRole = (Array.isArray(roles) ? roles : []).find(r => r.isSystem);
      if (systemRole) {
        const delResp = await fetch(`${API_BASE}/api/rbac/roles/${systemRole.id}`, {
          method: 'DELETE',
          headers,
        });
        if (delResp.status === 403 || delResp.status === 400) {
          finding('OK', 'RBAC/SystemProtection', `System role "${systemRole.name}" deletion correctly blocked (${delResp.status})`);
        } else if (delResp.status === 200 || delResp.status === 204) {
          finding('ERROR', 'RBAC/SystemProtection', `System role "${systemRole.name}" was DELETED -- this should be protected!`);
        } else {
          finding('WARN', 'RBAC/SystemProtection', `Unexpected status ${delResp.status} when trying to delete system role`);
        }
      }
    } catch (err) {
      finding('WARN', 'RBAC/SystemProtection', `Could not test: ${err.message}`);
    }
  }

  // --- 7. Profile page ---
  log('\n-- Step 7: Profile Page --');
  currentPageLabel = 'profile';
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle', timeout: 20000 });
  await waitForLoad(page);
  await screenshot(page, 'profile');

  const profileText = await page.textContent('body');

  // Check for real content (not just a 404 page)
  const hasProfileInputs = await page.$$('input:not([type="hidden"]):not([type="checkbox"])');
  if (hasProfileInputs.length >= 2) {
    finding('OK', 'Profile', `Profile page loaded with ${hasProfileInputs.length} form inputs`);

    for (const input of hasProfileInputs) {
      const name = await input.getAttribute('name') || '';
      const placeholder = await input.getAttribute('placeholder') || '';
      const type = await input.getAttribute('type') || 'text';
      const value = await input.inputValue().catch(() => '');
      log(`   Input: name="${name}" type="${type}" ph="${placeholder}" val="${value.substring(0, 40)}"`);
    }

    // Name
    const nameInput = await page.$('input[placeholder*="Имя"], input[name="firstName"]');
    if (nameInput) {
      const val = await nameInput.inputValue().catch(() => '');
      finding('OK', 'Profile/Fields', `Name: "${val}"`);
    }

    // Last name
    const lnInput = await page.$('input[placeholder*="Фамилия"], input[name="lastName"]');
    if (lnInput) {
      const val = await lnInput.inputValue().catch(() => '');
      finding('OK', 'Profile/Fields', `Last name: "${val}"`);
    }

    // Department
    const deptInput = await page.$('input[placeholder*="Отдел"], input[name="department"]');
    if (deptInput) {
      const val = await deptInput.inputValue().catch(() => '');
      finding('OK', 'Profile/Fields', `Department: "${val}"`);
    }

    // Email display
    if (profileText.includes('youredik@gmail.com')) {
      finding('OK', 'Profile/Fields', 'Email displayed');
    }

    // File upload for avatar
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      finding('OK', 'Profile/Avatar', 'File upload input found (avatar)');
    } else {
      finding('WARN', 'Profile/Avatar', 'No file upload input for avatar');
    }

    // Save button
    const allBtns = await page.$$('button');
    let saveFound = false;
    for (const btn of allBtns) {
      const text = (await btn.textContent()).trim();
      if (text.includes('Сохранить') || text.includes('Save') || text.includes('Обновить')) {
        saveFound = true;
        finding('OK', 'Profile/Save', `Save button: "${text}"`);
        break;
      }
    }
    if (!saveFound) {
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) {
        finding('OK', 'Profile/Save', 'Submit button found');
      } else {
        finding('WARN', 'Profile/Save', 'No save/submit button');
      }
    }

    // Notifications
    if (profileText.includes('Уведомления') || profileText.includes('уведомлени')) {
      finding('OK', 'Profile/Notifications', 'Notification preferences section found');

      // Check for toggles/checkboxes
      const checkboxes = await page.$$('input[type="checkbox"], [role="switch"]');
      if (checkboxes.length > 0) {
        finding('OK', 'Profile/Notifications', `${checkboxes.length} toggle(s)/checkbox(es) found`);
      }
    }
  } else {
    finding('ERROR', 'Profile', 'Profile page has insufficient content');
  }

  // 7b: Profile via API
  if (accessToken) {
    try {
      const profileResp = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const profileData = await profileResp.json();
      if (profileResp.ok) {
        finding('OK', 'Profile/API', `API profile: ${profileData.firstName} ${profileData.lastName} (${profileData.email})`);
        if (profileData.avatar) {
          finding('OK', 'Profile/API', `Avatar set: ${profileData.avatar}`);
        } else {
          finding('OK', 'Profile/API', 'No avatar set (using initials)');
        }
        if (profileData.notificationPreferences) {
          finding('OK', 'Profile/API', `Notification preferences: ${JSON.stringify(profileData.notificationPreferences)}`);
        }
      }
    } catch {}
  }

  // 7c: Profile modal from header
  log('\n-- Step 7c: Profile Modal from Header --');
  currentPageLabel = 'profile_modal';
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 20000 });
  await waitForLoad(page);

  let clickedHeader = false;
  const hdrEls = await page.$$('header button, header [class*="avatar" i], header img, nav button');
  for (const el of hdrEls) {
    const cl = await el.getAttribute('class') || '';
    const alt = await el.getAttribute('alt') || '';
    if (cl.toLowerCase().includes('avatar') || alt.toLowerCase().includes('avatar') || cl.includes('user')) {
      await el.click();
      clickedHeader = true;
      break;
    }
  }
  if (!clickedHeader && hdrEls.length > 0) {
    await hdrEls[hdrEls.length - 1].click();
    clickedHeader = true;
  }

  if (clickedHeader) {
    await page.waitForTimeout(1000);
    await screenshot(page, 'profile_modal');

    const modal = await page.$('[class*="modal" i], [role="dialog"], [class*="dropdown" i], [class*="menu" i], [class*="popover" i]');
    if (modal) {
      finding('OK', 'Profile/Modal', 'Header dropdown/modal opened');
      const modalText = await modal.textContent().catch(() => '');
      if (modalText.includes('Профиль') || modalText.includes('Profile')) {
        finding('OK', 'Profile/Modal', 'Contains profile link');
      }
      if (modalText.includes('Выйти') || modalText.includes('выйти') || modalText.includes('Logout')) {
        finding('OK', 'Profile/Modal', 'Contains logout option');
      }
      await page.keyboard.press('Escape');
    } else {
      finding('WARN', 'Profile/Modal', 'No modal appeared');
    }
  }

  // --- 8. Accessibility ---
  log('\n-- Step 8: Accessibility --');
  currentPageLabel = 'a11y';

  for (const adminPage of ['users', 'roles', 'invitations']) {
    await page.goto(`${BASE}/admin/${adminPage}`, { waitUntil: 'networkidle', timeout: 15000 });
    await waitForLoad(page);

    const iconBtnsNoLabel = await page.$$eval('button', (btns) =>
      btns.filter(b => !b.textContent?.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title')).length
    );
    if (iconBtnsNoLabel > 0) {
      finding('WARN', `A11y/${adminPage}`, `${iconBtnsNoLabel} icon button(s) without aria-label`);
    } else {
      finding('OK', `A11y/${adminPage}`, 'All buttons accessible');
    }
  }

  // --- 9. Mobile ---
  log('\n-- Step 9: Mobile --');
  currentPageLabel = 'mobile';
  await page.setViewportSize({ width: 375, height: 667 });

  for (const p of ['users', 'roles', 'invitations']) {
    await page.goto(`${BASE}/admin/${p}`, { waitUntil: 'networkidle', timeout: 15000 });
    await waitForLoad(page);
    await screenshot(page, `mobile_${p}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    finding(overflow ? 'WARN' : 'OK', `Mobile/${p}`, overflow ? 'Horizontal overflow' : 'No overflow');
  }

  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle', timeout: 15000 });
  await waitForLoad(page);
  await screenshot(page, 'mobile_profile');
  const profOF = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  finding(profOF ? 'WARN' : 'OK', 'Mobile/profile', profOF ? 'Horizontal overflow' : 'No overflow');

  await page.setViewportSize({ width: 1440, height: 900 });

  // --- REPORT ---
  log('\n\n========================================================');
  log('       AUDIT REPORT -- Admin / RBAC / Profile');
  log('========================================================\n');

  const errors = findings.filter(f => f.severity === 'ERROR');
  const warnings = findings.filter(f => f.severity === 'WARN');
  const oks = findings.filter(f => f.severity === 'OK');

  log(`Total: ${findings.length} | OK: ${oks.length} | WARN: ${warnings.length} | ERROR: ${errors.length}\n`);

  if (errors.length > 0) {
    log('-- ERRORS --');
    errors.forEach(f => log(`  [ERR]  [${f.area}] ${f.message}${f.details ? ' -- ' + f.details : ''}`));
    log('');
  }

  if (warnings.length > 0) {
    log('-- WARNINGS --');
    warnings.forEach(f => log(`  [WARN] [${f.area}] ${f.message}${f.details ? ' -- ' + f.details : ''}`));
    log('');
  }

  log('-- PASSED --');
  oks.forEach(f => log(`  [OK]   [${f.area}] ${f.message}${f.details ? ' -- ' + f.details : ''}`));

  const report = {
    timestamp: new Date().toISOString(),
    summary: { total: findings.length, ok: oks.length, warnings: warnings.length, errors: errors.length },
    consoleErrors,
    findings,
  };

  const reportPath = join(SCREENSHOTS, 'admin-audit-result.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log(`\nReport: ${reportPath}`);

  await browser.close();
  log('Audit complete.');
  process.exit(errors.length > 0 ? 1 : 0);
})();
