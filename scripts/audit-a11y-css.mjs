import { chromium } from 'playwright';

const AUTH_EMAIL = 'youredik@gmail.com';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Auth
  const resp = await page.request.post('http://localhost:3000/api/auth/dev/login', {
    data: { email: AUTH_EMAIL }
  });
  const data = await resp.json();
  await context.addCookies([{ name: 'access_token', value: data.accessToken, domain: 'localhost', path: '/' }]);
  console.log('✓ Auth OK');

  const pages = [
    '/dashboard', '/chat', '/tasks', '/knowledge-base',
    '/admin/users', '/admin/roles', '/admin/invitations',
  ];

  const a11yIssues = [];
  const cssIssues = [];

  for (const path of pages) {
    console.log(`\nAuditing: ${path}`);
    try {
      await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Images without alt
      const imgsNoAlt = await page.$$eval('img:not([alt])', imgs => imgs.length);
      if (imgsNoAlt > 0) {
        a11yIssues.push({ page: path, issue: `Images without alt: ${imgsNoAlt}` });
      }

      // Icon-only buttons without aria-label/title
      const badButtons = await page.$$eval('button', btns => {
        return btns.filter(btn => {
          const text = btn.textContent?.trim();
          const hasLabel = btn.getAttribute('aria-label') || btn.getAttribute('title') || btn.getAttribute('aria-labelledby');
          const hasSvg = btn.querySelector('svg');
          const isIconOnly = hasSvg && (!text || text.length < 2);
          return isIconOnly && !hasLabel;
        }).map(btn => btn.outerHTML.substring(0, 120));
      });
      if (badButtons.length > 0) {
        a11yIssues.push({ page: path, issue: `Icon buttons without labels: ${badButtons.length}`, details: badButtons.slice(0, 3) });
      }

      // Inputs without labels
      const unlabeledInputs = await page.$$eval('input:not([type="hidden"]):not([type="submit"]):not([type="file"]), textarea, select', els => {
        return els.filter(el => {
          return !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('placeholder') || el.id && document.querySelector('label[for="' + el.id + '"]') || el.closest('label'));
        }).length;
      });
      if (unlabeledInputs > 0) {
        a11yIssues.push({ page: path, issue: `Unlabeled inputs: ${unlabeledInputs}` });
      }

      // Horizontal overflow
      const overflowCount = await page.$$eval('*', els => {
        const vw = document.documentElement.clientWidth;
        return els.filter(el => el.scrollWidth > vw + 20).length;
      });
      if (overflowCount > 0) {
        cssIssues.push({ page: path, issue: `Horizontal overflow elements: ${overflowCount}` });
      }

      console.log(`  Buttons no label: ${badButtons.length}, imgs no alt: ${imgsNoAlt}, unlabeled inputs: ${unlabeledInputs}, overflow: ${overflowCount}`);

    } catch (err) {
      console.log(`  ERROR: ${err.message.substring(0, 80)}`);
    }
  }

  // Test responsive (mobile viewport)
  console.log('\n--- Mobile viewport test (375x667) ---');
  await page.setViewportSize({ width: 375, height: 667 });
  for (const path of ['/dashboard', '/chat', '/tasks']) {
    await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    const overflow = await page.$$eval('*', els => {
      const vw = document.documentElement.clientWidth;
      return els.filter(el => el.scrollWidth > vw + 10).length;
    });
    console.log(`  ${path} mobile overflow: ${overflow}`);
    if (overflow > 0) {
      cssIssues.push({ page: path + ' (mobile)', issue: `Horizontal overflow: ${overflow}` });
    }
  }

  console.log('\n=== A11Y & CSS AUDIT ===');
  console.log(`A11y issues: ${a11yIssues.length}, CSS issues: ${cssIssues.length}`);
  if (a11yIssues.length > 0) console.log('A11y:', JSON.stringify(a11yIssues, null, 2));
  if (cssIssues.length > 0) console.log('CSS:', JSON.stringify(cssIssues, null, 2));

  await browser.close();
}

run().catch(console.error);
