import { chromium } from 'playwright';

const BASE = 'https://preprod.stankoff.ru';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  // 1. Login через Keycloak OAuth2 flow
  console.log('1. Логин через Keycloak...');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  const url = page.url();
  console.log('  URL:', url);

  if (url.includes('stankoff.ru/oidc') || url.includes('keycloak')) {
    console.log('  Keycloak форма логина');
    await page.fill('#username', 'youredik@gmail.com');
    await page.fill('#password', 'TestPwd123');
    await page.click('#kc-login');
    await page.waitForURL('**/workspace**', { timeout: 15000 }).catch(() => {});
  } else {
    console.log('  Dev mode, ищем карточку...');
    const cards = await page.$$('div[class*="cursor"], button');
    for (const card of cards) {
      const text = await card.textContent().catch(() => '');
      if (text.includes('youredik@gmail.com') || text.includes('Эдик')) {
        await card.click();
        break;
      }
    }
    await page.waitForURL('**/dashboard**', { timeout: 15000 }).catch(() => {});
  }

  const afterLoginUrl = page.url();
  console.log('  URL после логина:', afterLoginUrl);
  await page.waitForTimeout(2000);

  // Делаем API запросы через page context (сессионные cookies)
  console.log('\n=== API через page context ===');
  const result = await page.evaluate(async (base) => {
    const results = {};
    const endpoints = {
      syncStatus: '/api/legacy/system-sync/status',
      cpPreview: '/api/legacy/system-sync/counterparties/preview',
      ctPreview: '/api/legacy/system-sync/contacts/preview',
      prPreview: '/api/legacy/system-sync/products/preview',
      workspaces: '/api/workspaces',
      entities: '/api/entities?perPage=5&page=1',
    };

    for (const [key, path] of Object.entries(endpoints)) {
      try {
        const res = await fetch(`${base}${path}`);
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = text; }
        results[key] = { status: res.status, data };
      } catch (e) {
        results[key] = { status: 'error', data: e.message };
      }
    }
    return results;
  }, BASE);

  for (const [key, val] of Object.entries(result)) {
    console.log(`\n${key}: HTTP ${val.status}`);
    if (val.data && typeof val.data === 'object') {
      if (Array.isArray(val.data)) {
        console.log(`  Items: ${val.data.length}`);
        val.data.forEach(w => {
          if (w.name) {
            const sys = w.isSystem ? ' [SYSTEM]' : '';
            console.log(`  ${(w.prefix || '???').padEnd(5)} ${w.name}${sys} ${w.systemType || ''}`);
          }
        });
      } else {
        console.log(`  ${JSON.stringify(val.data, null, 2).substring(0, 800)}`);
      }
    } else {
      console.log(`  ${String(val.data).substring(0, 200)}`);
    }
  }

  // 2. Скриншоты
  console.log('\n=== Скриншоты ===');
  await page.screenshot({ path: 'audit-screenshots/preprod-after-login.png', fullPage: true });
  console.log('  Saved: preprod-after-login.png');

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'audit-screenshots/preprod-dashboard.png', fullPage: true });
  console.log('  Saved: preprod-dashboard.png');

  // 3. Sidebar content
  const sidebarText = await page.evaluate(() => {
    const sidebar = document.querySelector('nav') || document.querySelector('[class*="sidebar"]') || document.querySelector('aside');
    return sidebar ? sidebar.textContent.replace(/\s+/g, ' ').trim() : 'sidebar not found';
  });
  console.log('\nSidebar:', sidebarText.substring(0, 400));

  await browser.close();
  console.log('\n✓ Проверка завершена');
}

main().catch(e => {
  console.error('ОШИБКА:', e.message);
  process.exit(1);
});
