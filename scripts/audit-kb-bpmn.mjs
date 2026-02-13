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
  await context.addCookies([{ name: 'access_token', value: data.accessToken, domain: 'localhost', path: '/' }]);
  console.log('✓ Auth OK');

  // Knowledge Base
  console.log('\n--- Knowledge Base ---');
  await page.goto('http://localhost:3000/knowledge-base', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const tabs = await page.$$('button[role="tab"], [class*="tab"] button');
  console.log(`Tabs: ${tabs.length}`);

  // Documents tab
  const docElements = await page.$$('tr, [class*="document"], [class*="card"]');
  console.log(`Document elements: ${docElements.length}`);

  // Upload button
  const allBtns = await page.$$('button');
  for (const btn of allBtns) {
    const text = (await btn.textContent()).trim();
    if (text.includes('Загрузить') || text.includes('Добавить')) {
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(1000);
        await page.keyboard.press('Escape');
        console.log('Upload dialog Escape tested');
        break;
      }
    }
  }

  // FAQ tab
  for (const tab of tabs) {
    const tabText = await tab.textContent();
    if (tabText && (tabText.includes('FAQ') || tabText.includes('Вопрос'))) {
      await tab.click();
      await page.waitForTimeout(2000);
      console.log('FAQ tab loaded');

      const faqBtns = await page.$$('button');
      for (const btn of faqBtns) {
        const text = (await btn.textContent()).trim();
        if (text.includes('Добавить') || text.includes('Создать')) {
          if (await btn.isVisible()) {
            await btn.click();
            await page.waitForTimeout(1000);
            await page.keyboard.press('Escape');
            console.log('FAQ dialog Escape tested');
            break;
          }
        }
      }
      break;
    }
  }

  // Dashboard
  console.log('\n--- Dashboard ---');
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  const dashBody = await page.textContent('body');
  if (dashBody.includes('Cannot read properties') || dashBody.includes('Unhandled Runtime Error')) {
    errors.push({ page: '/dashboard', text: 'Runtime error' });
  } else {
    console.log('Dashboard loaded OK');
  }

  // Tasks
  console.log('\n--- Tasks ---');
  await page.goto('http://localhost:3000/tasks', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  const taskLinks = await page.$$('a[href*="/tasks/"], tr[class*="cursor"]');
  console.log(`Task links: ${taskLinks.length}`);

  // Login page (should show dev cards)
  console.log('\n--- Login Page ---');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  const loginCards = await page.$$('[class*="card"], button[class*="hover"]');
  console.log(`Login user cards: ${loginCards.length}`);

  console.log('\n=== KB/BPMN/TASKS AUDIT ===');
  console.log(`Console errors: ${errors.length}, Network 500s: ${networkErrors.length}`);
  if (errors.length > 0) console.log('Errors:', JSON.stringify(errors, null, 2));
  if (networkErrors.length > 0) console.log('Network:', JSON.stringify(networkErrors, null, 2));

  await browser.close();
}

run().catch(console.error);
