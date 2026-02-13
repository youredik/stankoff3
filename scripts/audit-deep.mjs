import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const resp = await page.request.post('http://localhost:3000/api/auth/dev/login', {
    data: { email: 'youredik@gmail.com' }
  });
  const { accessToken } = await resp.json();
  await context.addCookies([{ name: 'access_token', value: accessToken, domain: 'localhost', path: '/' }]);

  // Get first workspace
  const wsResp = await page.request.get('http://localhost:3000/api/workspaces', {
    headers: { Authorization: 'Bearer ' + accessToken }
  });
  const workspaces = await wsResp.json();
  const ws = workspaces[0];

  console.log('Testing workspace: ' + ws.name + ' (id=' + ws.id + ')');
  await page.goto('http://localhost:3000/workspace/' + ws.id, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Screenshot
  await page.screenshot({ path: '/tmp/ws-screenshot.png', fullPage: true });
  console.log('Screenshot: /tmp/ws-screenshot.png');

  // Check all visible buttons
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null).map(b => ({
      text: (b.textContent || '').trim().substring(0, 50),
      ariaLabel: b.getAttribute('aria-label') || '',
      title: b.getAttribute('title') || '',
      testId: b.getAttribute('data-testid') || ''
    }));
  });
  console.log('\nVisible buttons (' + buttons.length + '):');
  buttons.forEach(b => console.log('  [' + b.text + ']' + (b.ariaLabel ? ' aria=' + b.ariaLabel : '') + (b.title ? ' title=' + b.title : '')));

  // Check all links
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).filter(a => a.offsetParent !== null).map(a => ({
      text: (a.textContent || '').trim().substring(0, 50),
      href: a.getAttribute('href') || ''
    }));
  });
  console.log('\nVisible links (' + links.length + '):');
  links.forEach(l => console.log('  ' + l.href + ' -> ' + l.text));

  // Check all draggable elements (kanban cards)
  const draggables = await page.evaluate(() => {
    return document.querySelectorAll('[draggable="true"]').length;
  });
  console.log('\nDraggable elements: ' + draggables);

  // Check all divs with role
  const roles = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[role]')).map(el => ({
      role: el.getAttribute('role'),
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().substring(0, 40)
    }));
  });
  console.log('\nElements with role (' + roles.length + '):');
  roles.forEach(r => console.log('  role=' + r.role + ' <' + r.tag + '> ' + r.text));

  // Now test other pages with screenshots
  const pagesToTest = ['/dashboard', '/chat', '/tasks', '/knowledge-base', '/admin/users'];
  for (const p of pagesToTest) {
    await page.goto('http://localhost:3000' + p, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    const filename = '/tmp/page' + p.replace(/\//g, '-') + '.png';
    await page.screenshot({ path: filename, fullPage: true });

    const btnCount = await page.evaluate(() => document.querySelectorAll('button').length);
    const linkCount = await page.evaluate(() => document.querySelectorAll('a').length);
    const inputCount = await page.evaluate(() => document.querySelectorAll('input, textarea, select').length);
    console.log('\n' + p + ': buttons=' + btnCount + ' links=' + linkCount + ' inputs=' + inputCount + ' screenshot=' + filename);
  }

  await browser.close();
}

run().catch(console.error);
