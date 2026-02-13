import { chromium } from 'playwright';

const AUTH_EMAIL = 'youredik@gmail.com';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  const warnings = [];

  page.on('console', msg => {
    if (msg.type() === 'error') errors.push({ page: page.url(), text: msg.text().substring(0, 200) });
  });
  page.on('pageerror', err => errors.push({ page: page.url(), text: err.message.substring(0, 200) }));

  // Auth
  const resp = await page.request.post('http://localhost:3000/api/auth/dev/login', {
    data: { email: AUTH_EMAIL }
  });
  const data = await resp.json();
  await context.addCookies([{
    name: 'access_token', value: data.accessToken, domain: 'localhost', path: '/'
  }]);
  console.log('✓ Auth OK');

  const adminPages = [
    '/admin/users',
    '/admin/roles',
    '/admin/invitations',
  ];

  for (const path of adminPages) {
    try {
      console.log(`\nTesting: ${path}`);
      const response = await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 30000 });

      if (response.status() >= 400) {
        errors.push({ page: path, text: 'HTTP ' + response.status() });
        continue;
      }

      await page.waitForTimeout(2000);

      // Check for runtime errors in page text
      const bodyText = await page.textContent('body');
      if (bodyText.includes('Cannot read properties') || bodyText.includes('Unhandled Runtime Error')) {
        errors.push({ page: path, text: 'Runtime error visible on page' });
      }

      // Try clicking add/create buttons
      const addBtns = await page.$$('button:has-text("Добавить"), button:has-text("Создать"), button:has-text("Пригласить")');
      for (const btn of addBtns) {
        if (await btn.isVisible()) {
          const btnText = await btn.textContent();
          console.log(`  Found button: "${btnText.trim()}"`);
          await btn.click();
          await page.waitForTimeout(1000);

          // Test Escape closes it
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          console.log('  Escape tested');
          break;
        }
      }

      // Check table rows
      const rows = await page.$$('tr, [class*="row"], [class*="item"]');
      console.log(`  Rows/items: ${rows.length}`);

      console.log('  ✓ OK');
    } catch (err) {
      errors.push({ page: path, text: err.message.substring(0, 200) });
    }
  }

  console.log('\n=== ADMIN AUDIT ===');
  console.log(`Pages: ${adminPages.length}, Errors: ${errors.length}, Warnings: ${warnings.length}`);
  if (errors.length > 0) console.log('Errors:', JSON.stringify(errors, null, 2));

  await browser.close();
}

run().catch(console.error);
