import { chromium } from 'playwright';

const AUTH_EMAIL = 'youredik@gmail.com';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  const networkErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text().substring(0, 200);
      if (!text.includes('WebSocket') && !text.includes('favicon'))
        errors.push({ page: page.url(), text });
    }
  });
  page.on('pageerror', err => errors.push({ page: page.url(), text: err.message.substring(0, 200) }));
  page.on('response', resp => {
    if (resp.status() >= 500) networkErrors.push({ url: resp.url().substring(0, 100), status: resp.status() });
  });

  // Auth
  const resp = await page.request.post('http://localhost:3000/api/auth/dev/login', {
    data: { email: AUTH_EMAIL }
  });
  const data = await resp.json();
  const token = data.accessToken;
  await context.addCookies([{ name: 'access_token', value: token, domain: 'localhost', path: '/' }]);
  console.log('✓ Auth OK');

  // Get workspaces
  const wsResp = await page.request.get('http://localhost:3000/api/workspaces', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const workspaces = await wsResp.json();
  console.log(`Workspaces: ${workspaces.length}`);

  const testWs = workspaces.slice(0, 5);

  for (const ws of testWs) {
    const path = `/workspace/${ws.id}`;
    console.log(`\nWorkspace: "${ws.name}"`);

    try {
      await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2500);

      // Kanban columns
      const columns = await page.$$('[data-testid*="column"], [class*="kanban"] [class*="column"]');
      console.log(`  Columns: ${columns.length}`);

      // Entity cards
      const cards = await page.$$('[data-testid*="entity-card"], [draggable="true"]');
      console.log(`  Cards: ${cards.length}`);

      // Filter button
      const allButtons = await page.$$('button');
      for (const btn of allButtons) {
        const text = (await btn.textContent()).trim();
        if (text.includes('Фильтр') || text.includes('фильтр')) {
          await btn.click();
          await page.waitForTimeout(500);
          await page.keyboard.press('Escape');
          console.log('  Filter open+Escape tested');
          break;
        }
      }

      // Create button
      for (const btn of allButtons) {
        const text = (await btn.textContent()).trim();
        if ((text.includes('Создать') || text.includes('Добавить')) && await btn.isVisible()) {
          await btn.click();
          await page.waitForTimeout(1000);
          await page.keyboard.press('Escape');
          console.log('  Create modal open+Escape tested');
          break;
        }
      }

      // Click a card
      if (cards.length > 0) {
        try {
          await cards[0].click();
          await page.waitForTimeout(1500);
          await page.keyboard.press('Escape');
          console.log('  Card detail open+Escape tested');
        } catch {}
      }

      // Test workspace settings
      const settingsLinks = await page.$$('a[href*="settings"]');
      if (settingsLinks.length > 0) {
        await settingsLinks[0].click();
        await page.waitForTimeout(2000);
        const settingsBody = await page.textContent('body');
        if (settingsBody.includes('Cannot read properties') || settingsBody.includes('Unhandled Runtime Error')) {
          errors.push({ page: path + '/settings', text: 'Runtime error' });
        } else {
          console.log('  Settings page OK');
        }
      }

      console.log('  ✓ OK');
    } catch (err) {
      errors.push({ page: path, text: err.message.substring(0, 200) });
    }
  }

  console.log('\n=== KANBAN/WORKSPACE AUDIT ===');
  console.log(`Workspaces tested: ${testWs.length}, Errors: ${errors.length}, Network 500s: ${networkErrors.length}`);
  if (errors.length > 0) console.log('Errors:', JSON.stringify(errors, null, 2));
  if (networkErrors.length > 0) console.log('Network:', JSON.stringify(networkErrors, null, 2));

  await browser.close();
}

run().catch(console.error);
