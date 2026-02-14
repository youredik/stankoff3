/**
 * Playwright аудит аватарок на всём портале.
 * Проверяет отображение на всех страницах, скриншотит каждую.
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'fs';

const BASE = 'http://localhost:3000';
const EMAIL = 'youredik@gmail.com';
const SCREENSHOTS_DIR = 'audit-screenshots/avatars';
const RESULTS = [];

function log(msg) {
  const ts = new Date().toLocaleTimeString('ru-RU');
  console.log(`[${ts}] ${msg}`);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  // Dev mode — кликаем по кнопке с email пользователя
  const loginBtn = page.locator(`button:has-text("${EMAIL}")`).first();
  const count = await loginBtn.count();
  if (count > 0) {
    log(`  Нашёл кнопку логина для ${EMAIL}, кликаю...`);
    await loginBtn.click();
  } else {
    log('  ⚠️ Кнопка логина не найдена, пробую другой селектор...');
    // Fallback — ищем среди всех кнопок
    const buttons = page.locator('button');
    const btnCount = await buttons.count();
    for (let i = 0; i < btnCount; i++) {
      const text = await buttons.nth(i).textContent();
      if (text && text.includes(EMAIL)) {
        await buttons.nth(i).click();
        break;
      }
    }
  }

  // Ждём редиректа на workspace
  try {
    await page.waitForURL('**/workspace/**', { timeout: 15000 });
    log('  ✅ Логин успешен, на странице workspace');
  } catch {
    // Проверяем, может уже на workspace
    const currentUrl = page.url();
    if (currentUrl.includes('/workspace')) {
      log('  ✅ Уже на странице workspace');
    } else {
      log(`  ⚠️ Не перешли на workspace, текущий URL: ${currentUrl}`);
      // Делаем скриншот для диагностики
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/login-failure.png` });
      return false;
    }
  }

  // Ждём загрузки контента
  await page.waitForTimeout(2000);
  return true;
}

async function checkAvatars(page, pageName) {
  const issues = [];

  // Ищем аватары по структуре UserAvatar: div.bg-primary-600.rounded-full
  // Также ищем по img внутри rounded-full контейнеров
  const avatarContainers = await page.$$('[class*="bg-primary-600"][class*="rounded-full"]');
  let withImage = 0;
  let withInitials = 0;
  let brokenImages = 0;

  for (const container of avatarContainers) {
    const img = await container.$('img');
    if (img) {
      withImage++;
      // Проверяем загрузилось ли изображение
      const naturalWidth = await img.evaluate((el) => el.naturalWidth);
      if (naturalWidth === 0) {
        brokenImages++;
        const alt = await img.getAttribute('alt');
        issues.push(`Broken image: ${alt || 'unknown'}`);
      }
      // Проверяем loading="lazy"
      const loading = await img.getAttribute('loading');
      if (loading !== 'lazy') {
        issues.push(`Missing loading="lazy" on avatar img`);
      }
    } else {
      withInitials++;
    }
  }

  // Если стандартные селекторы не нашли — пробуем по img с alt и object-cover
  if (avatarContainers.length === 0) {
    const roundedImages = await page.$$('img.object-cover');
    for (const img of roundedImages) {
      const parent = await img.evaluateHandle((el) => el.parentElement);
      const parentClasses = await parent.evaluate((el) => el.className || '');
      if (parentClasses.includes('rounded-full') || parentClasses.includes('overflow-hidden')) {
        withImage++;
        const naturalWidth = await img.evaluate((el) => el.naturalWidth);
        if (naturalWidth === 0) {
          brokenImages++;
        }
      }
    }
    // Ищем initials — spans с текстом 1-2 буквы внутри bg-primary округлых контейнеров
    const initialsSpans = await page.$$('[class*="rounded-full"] span[class*="text-white"]');
    withInitials = initialsSpans.length;
  }

  // Проверяем аватар в Header (user-menu-button)
  const headerAvatar = await page.$('[data-testid="user-menu-button"]');
  if (!headerAvatar) {
    issues.push('Header: user-menu-button не найден');
  } else {
    const headerAvatarCircle = await headerAvatar.$('[class*="rounded-full"]');
    if (!headerAvatarCircle) {
      issues.push('Header: аватар (rounded-full) не найден внутри user-menu-button');
    }
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

  log('Запуск Playwright...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
  });

  const page = await context.newPage();

  // Собираем console errors
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Логин
  log('Логин...');
  const loggedIn = await login(page);
  if (!loggedIn) {
    log('❌ Логин не удался, завершаю аудит');
    await browser.close();
    process.exit(1);
  }

  // Определяем workspace ID из URL
  const currentUrl = page.url();
  const wsMatch = currentUrl.match(/\/workspace\/([a-f0-9-]+)/);
  const workspaceId = wsMatch ? wsMatch[1] : null;
  log(`Workspace ID: ${workspaceId || 'не определён'}`);

  const pages = [
    { name: 'Dashboard (Kanban)', path: workspaceId ? `/workspace/${workspaceId}` : null },
    { name: 'Profile', path: '/profile' },
    { name: 'Chat', path: '/chat' },
    { name: 'Admin Users', path: '/admin/users' },
    { name: 'Tasks Inbox', path: '/tasks' },
  ];

  // Проход по всем страницам
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

  // Проверяем fullscreen preview — кликаем на аватарку
  log('Проверяю fullscreen preview аватарки...');
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const clickableAvatar = page.locator('[class*="cursor-pointer"] [class*="bg-primary-600"][class*="rounded-full"]').first();
  const clickableCount = await clickableAvatar.count();
  if (clickableCount > 0) {
    await clickableAvatar.click();
    await page.waitForTimeout(500);
    const preview = await page.$('[class*="fixed"][class*="z-"]');
    if (preview) {
      log('  ✅ Fullscreen preview открывается');
      await screenshotPage(page, 'avatar-fullscreen-preview');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      const previewAfter = await page.$('.fixed.z-\\[100\\]');
      if (!previewAfter) {
        log('  ✅ Escape закрывает preview');
      } else {
        log('  ⚠️ Escape не закрывает preview');
        RESULTS.push({ page: 'Fullscreen Preview', issues: ['Escape не закрывает preview'] });
      }
    } else {
      log('  ℹ️ Preview не открылся (возможно нет аватарки у текущего пользователя)');
    }
  } else {
    log('  ℹ️ Кликабельных аватаров не найдено');
  }

  // Проверяем UserProfileModal — клик на пользователя в админке
  log('Проверяю UserProfileModal...');
  await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // Кликаем на первого пользователя в таблице (по обёртке с cursor-pointer)
  const firstUserClickable = page.locator('td [class*="cursor-pointer"]').first();
  const userClickableCount = await firstUserClickable.count();
  if (userClickableCount > 0) {
    await firstUserClickable.click();
    await page.waitForTimeout(1000);
    // Проверяем, открылась ли модалка (z-[91])
    const modal = await page.$('[class*="z-\\[91\\]"]') || await page.$('.fixed.z-\\[91\\]');
    // Альтернативная проверка — ищем модалку по её содержимому
    const modalByContent = await page.$('div:has(> div > button[aria-label="Закрыть"])');
    if (modal || modalByContent) {
      log('  ✅ UserProfileModal открывается');
      await screenshotPage(page, 'user-profile-modal');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      log('  ✅ Escape отправлен');
    } else {
      // Может открылась — проверяем по скриншоту
      await screenshotPage(page, 'user-profile-modal-attempt');
      log('  ℹ️ UserProfileModal — проверяем скриншот');
    }
  } else {
    log('  ⚠️ Кликабельный пользователь не найден в админке');
  }

  await browser.close();

  // Итоговый отчёт
  log('\n========== ИТОГИ АУДИТА АВАТАРОК ==========');
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
    log(`\nConsole errors (${consoleErrors.length}):`);
    const avatarRelated = consoleErrors.filter(e =>
      e.includes('avatar') || e.includes('img') || e.includes('500') || e.includes('signed')
    );
    avatarRelated.forEach(e => log(`  ⚠️ ${e}`));
    if (avatarRelated.length < consoleErrors.length) {
      log(`  ... и ещё ${consoleErrors.length - avatarRelated.length} других ошибок`);
    }
  }

  log(`\nВсего: ${totalAvatars} аватаров, ${totalBroken} сломанных, ${totalIssues} проблем`);
  log('Скриншоты: ' + SCREENSHOTS_DIR);

  // Вернём код выхода
  process.exit(totalBroken > 0 || totalIssues > 3 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
