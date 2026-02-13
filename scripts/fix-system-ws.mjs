import { chromium } from 'playwright';
const BASE = 'https://preprod.stankoff.ru';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  const loginUrl = page.url();
  console.log('Login URL:', loginUrl.substring(0, 80));
  
  if (loginUrl.includes('stankoff.ru/oidc')) {
    await page.fill('#username', 'youredik@gmail.com');
    await page.fill('#password', 'TestPwd123');
    await page.click('#kc-login');
    // Ждём любой URL с access_token или workspace
    await page.waitForURL(url => url.toString().includes('access_token') || url.toString().includes('/workspace') || url.toString().includes('/dashboard'), { timeout: 20000 }).catch(() => {});
  }
  
  console.log('After login:', page.url().substring(0, 100));
  
  let token = new URL(page.url()).searchParams.get('access_token');
  if (!token) {
    // Может быть в cookie после перехода
    const cookies = await ctx.cookies();
    const tc = cookies.find(c => c.name === 'access_token');
    if (tc) token = tc.value;
  }
  if (!token) {
    // Может он сохраняется через JS — подождём
    await page.waitForTimeout(3000);
    token = await page.evaluate(() => {
      const params = new URLSearchParams(window.location.search);
      return params.get('access_token') || localStorage.getItem('token') || document.cookie.match(/access_token=([^;]+)/)?.[1] || null;
    });
  }
  if (!token) {
    console.error('Нет токена! URL:', page.url());
    await page.screenshot({ path: 'audit-screenshots/no-token.png' });
    await browser.close();
    process.exit(1);
  }
  
  console.log('Token OK');
  const h = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 1. Системные workspace
  let r = await fetch(`${BASE}/api/workspaces`, { headers: h });
  const allWs = await r.json();
  const sysWs = allWs.filter(w => w.isSystem);
  console.log('\nСистемные workspace:');
  for (const w of sysWs) {
    console.log(`  ${w.id} | ${w.prefix} ${w.name} | section: ${w.sectionId || 'НЕТ'} | type: ${w.systemType}`);
  }

  // 2. Секции
  r = await fetch(`${BASE}/api/sections`, { headers: h });
  const sections = await r.json();
  console.log('\nСекции:');
  if (Array.isArray(sections)) {
    for (const s of sections) console.log(`  ${s.id} | ${s.name}`);
  } else {
    console.log('  Response:', JSON.stringify(sections).substring(0, 300));
  }

  // 3. Я
  r = await fetch(`${BASE}/api/auth/me`, { headers: h });
  const me = await r.json();
  console.log('\nЯ:', me.id, me.email);

  // 4. Membership
  for (const w of sysWs) {
    r = await fetch(`${BASE}/api/workspaces/${w.id}/members`, { headers: h });
    const txt = await r.text();
    console.log(`\nMembers ${w.name} (${r.status}): ${txt.substring(0, 300)}`);
  }

  await browser.close();
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
