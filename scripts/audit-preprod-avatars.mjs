/**
 * Playwright аудит аватарок на ПРЕПРОДЕ.
 * На препроде нет dev login — используем SSO через Keycloak.
 * Проверяет отображение на ключевых страницах.
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'fs';

const BASE = 'https://preprod.stankoff.ru';
const SCREENSHOTS_DIR = 'audit-screenshots/preprod-avatars';
const RESULTS = [];

function log(msg) {
  const ts = new Date().toLocaleTimeString('ru-RU');
  console.log(`[${ts}] ${msg}`);
}

async function checkAvatars(page, pageName) {
  const issues = [];

  // Ищем аватары по структуре UserAvatar
  const avatarContainers = await page.$$('[class*="bg-primary-600"][class*="rounded-full"]');
  let withImage = 0;
  let withInitials = 0;
  let brokenImages = 0;

  for (const container of avatarContainers) {
    const img = await container.$('img');
    if (img) {
      withImage++;
      const naturalWidth = await img.evaluate((el) => el.naturalWidth);
      if (naturalWidth === 0) {
        brokenImages++;
        const alt = await img.getAttribute('alt');
        issues.push(`Broken image: ${alt || 'unknown'}`);
      }
      const loading = await img.getAttribute('loading');
      if (loading !== 'lazy') {
        issues.push(`Missing loading="lazy" on avatar img`);
      }
    } else {
      withInitials++;
    }
  }

  // Fallback — img.object-cover
  if (avatarContainers.length === 0) {
    const roundedImages = await page.$$('img.object-cover');
    for (const img of roundedImages) {
      const parent = await img.evaluateHandle((el) => el.parentElement);
      const parentClasses = await parent.evaluate((el) => el.className || '');
      if (parentClasses.includes('rounded-full') || parentClasses.includes('overflow-hidden')) {
        withImage++;
        const naturalWidth = await img.evaluate((el) => el.naturalWidth);
        if (naturalWidth === 0) brokenImages++;
      }
    }
    const initialsSpans = await page.$$('[class*="rounded-full"] span[class*="text-white"]');
    withInitials = initialsSpans.length;
  }

  // Header avatar
  const headerAvatar = await page.$('[data-testid="user-menu-button"]');
  if (!headerAvatar) {
    issues.push('Header: user-menu-button не найден');
  }

  const result = {
    page: pageName,
    totalAvatars: withImage + withInitials,
    withImage,
    withInitials,
    brokenImages,
    issues,
  };

  RESULTS.push(result);
  return result;
}

async function screenshotPage(page, name) {
  const safeName = name.replace(/[^a-zA-Z0-9-]/g, '_');
  const path = `${SCREENSHOTS_DIR}/${safeName}.png`;
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function main() {
  if (!existsSync(SCREENSHOTS_DIR)) {
    mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  log('Запуск Playwright для препрода...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // Собираем console errors
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Переходим на login — SSO редирект произойдёт автоматически
  log('Переход на препрод...');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const loginUrl = page.url();
  log(`URL после загрузки: ${loginUrl}`);
  await screenshotPage(page, '01-login-page');

  // Проверяем — если Keycloak форма, вводим креды
  const isKeycloak = loginUrl.includes('oidc') || loginUrl.includes('auth/realms');
  if (isKeycloak) {
    log('Keycloak SSO форма обнаружена, вводим логин...');
    // Ищем поля username/password
    const usernameField = await page.$('#username') || await page.$('input[name="username"]');
    const passwordField = await page.$('#password') || await page.$('input[name="password"]');

    if (usernameField && passwordField) {
      await usernameField.fill('youredik@gmail.com');
      await passwordField.fill('youredik@gmail.com'); // Обычно совпадает в dev
      const loginBtn = await page.$('#kc-login') || await page.$('button[type="submit"]') || await page.$('input[type="submit"]');
      if (loginBtn) {
        await loginBtn.click();
        await page.waitForTimeout(5000);
        log(`URL после логина: ${page.url()}`);
      }
    } else {
      log('⚠️ Поля логина не найдены на Keycloak странице');
    }
    await screenshotPage(page, '02-after-keycloak-login');
  }

  // Проверяем, залогинены ли мы
  const currentUrl = page.url();
  const isLoggedIn = currentUrl.includes('/workspace') || currentUrl.includes('/chat') || currentUrl.includes('/profile');

  if (!isLoggedIn) {
    log(`⚠️ Не удалось залогиниться. URL: ${currentUrl}`);
    log('Продолжаю аудит без логина — проверяем доступные страницы...');
    await screenshotPage(page, '03-login-failed');

    // Всё равно проверяем что login page рендерится без 500
    const statusOk = !currentUrl.includes('error');
    RESULTS.push({
      page: 'Login',
      totalAvatars: 0,
      withImage: 0,
      withInitials: 0,
      brokenImages: 0,
      issues: isLoggedIn ? [] : ['Не удалось залогиниться через SSO'],
    });
  } else {
    // Определяем workspace ID
    const wsMatch = currentUrl.match(/\/workspace\/([a-f0-9-]+)/);
    const workspaceId = wsMatch ? wsMatch[1] : null;
    log(`✅ Залогинены! Workspace: ${workspaceId || 'не определён'}`);

    const pages = [
      { name: 'Dashboard (Kanban)', path: workspaceId ? `/workspace/${workspaceId}` : null },
      { name: 'Profile', path: '/profile' },
      { name: 'Chat', path: '/chat' },
      { name: 'Admin Users', path: '/admin/users' },
      { name: 'Tasks Inbox', path: '/tasks' },
    ];

    for (const { name, path } of pages) {
      try {
        log(`Проверяю: ${name}...`);
        if (path) {
          await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
        }
        await page.waitForTimeout(3000);

        const result = await checkAvatars(page, name);
        await screenshotPage(page, name);

        log(`  ${name}: ${result.totalAvatars} аватаров (${result.withImage} img, ${result.withInitials} initials, ${result.brokenImages} broken)`);
        if (result.issues.length > 0) {
          result.issues.forEach((i) => log(`  ⚠️  ${i}`));
        }
      } catch (err) {
        log(`  ❌ Ошибка на ${name}: ${err.message}`);
        RESULTS.push({ page: name, error: err.message });
      }
    }

    // Проверяем fullscreen preview
    log('Проверяю fullscreen preview...');
    await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const clickableAvatar = page.locator('[class*="cursor-pointer"] [class*="bg-primary-600"][class*="rounded-full"]').first();
    if (await clickableAvatar.count() > 0) {
      await clickableAvatar.click();
      await page.waitForTimeout(500);
      const preview = await page.$('[class*="fixed"][class*="z-"]');
      if (preview) {
        log('  ✅ Fullscreen preview работает');
        await screenshotPage(page, 'fullscreen-preview');
        await page.keyboard.press('Escape');
      } else {
        log('  ℹ️ Preview не открылся');
      }
    }

    // Проверяем UserProfileModal в админке
    log('Проверяю UserProfileModal...');
    await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const firstUserClickable = page.locator('td [class*="cursor-pointer"]').first();
    if (await firstUserClickable.count() > 0) {
      await firstUserClickable.click();
      await page.waitForTimeout(1000);
      await screenshotPage(page, 'user-profile-modal');
      const modalBtn = await page.$('button[aria-label="Закрыть"]');
      if (modalBtn) {
        log('  ✅ UserProfileModal работает');
        await page.keyboard.press('Escape');
      }
    }
  }

  await browser.close();

  // Итоговый отчёт
  log('\n========== ИТОГИ АУДИТА ПРЕПРОДА ==========');
  let totalAvatars = 0;
  let totalBroken = 0;
  let totalIssues = 0;

  for (const r of RESULTS) {
    if (r.error) {
      log(`❌ ${r.page}: ${r.error}`);
      continue;
    }
    totalAvatars += r.totalAvatars || 0;
    totalBroken += r.brokenImages || 0;
    totalIssues += (r.issues?.length || 0);
    const status = (r.issues?.length || 0) === 0 ? '✅' : '⚠️';
    log(`${status} ${r.page}: ${r.totalAvatars} аватаров, ${r.brokenImages} broken, ${r.issues?.length || 0} issues`);
  }

  if (consoleErrors.length > 0) {
    const avatarRelated = consoleErrors.filter(e =>
      e.includes('avatar') || e.includes('img') || e.includes('500') || e.includes('signed')
    );
    if (avatarRelated.length > 0) {
      log(`\nAvatar-related console errors:`);
      avatarRelated.forEach(e => log(`  ⚠️ ${e}`));
    }
  }

  log(`\nВсего: ${totalAvatars} аватаров, ${totalBroken} сломанных, ${totalIssues} проблем`);
  log('Скриншоты: ' + SCREENSHOTS_DIR);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
