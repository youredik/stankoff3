import { chromium } from 'playwright';

const BASE = 'https://preprod.stankoff.ru';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  console.log('1. Логин...');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  
  if (page.url().includes('stankoff.ru/oidc')) {
    await page.fill('#username', 'youredik@gmail.com');
    await page.fill('#password', 'TestPwd123');
    await page.click('#kc-login');
    await page.waitForURL('**/workspace**', { timeout: 15000 }).catch(() => {});
  }

  const token = new URL(page.url()).searchParams.get('access_token');
  if (!token) { console.error('Нет токена!'); process.exit(1); }
  console.log('  Token OK');

  const h = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  console.log('\n2. Запуск контрагентов...');
  let r = await fetch(`${BASE}/api/legacy/system-sync/counterparties/start`, { method: 'POST', headers: h });
  console.log(`  ${r.status}:`, await r.json());

  console.log('3. Запуск контактов...');
  r = await fetch(`${BASE}/api/legacy/system-sync/contacts/start`, { method: 'POST', headers: h });
  console.log(`  ${r.status}:`, await r.json());

  console.log('4. Запуск товаров...');
  r = await fetch(`${BASE}/api/legacy/system-sync/products/start`, { method: 'POST', headers: h });
  console.log(`  ${r.status}:`, await r.json());

  console.log('\n5. Мониторинг (каждые 15 сек)...');
  const t0 = Date.now();
  while (Date.now() - t0 < 10 * 60 * 1000) {
    await new Promise(r => setTimeout(r, 15000));
    r = await fetch(`${BASE}/api/legacy/system-sync/status`, { headers: h });
    const s = await r.json();
    const cp = s.counterparties, ct = s.contacts, pr = s.products;
    const sec = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`  [${sec}s] CP:${cp.processedItems}/${cp.totalItems}(+${cp.createdItems},err:${cp.errors}) CT:${ct.processedItems}/${ct.totalItems}(+${ct.createdItems},err:${ct.errors}) PR:${pr.processedItems}/${pr.totalItems}(+${pr.createdItems},err:${pr.errors})`);
    if (!cp.isRunning && !ct.isRunning && !pr.isRunning && (cp.totalItems > 0 || ct.totalItems > 0 || pr.totalItems > 0)) {
      console.log('\n  Все завершено!');
      if (cp.lastError) console.log('  CP error:', cp.lastError);
      if (ct.lastError) console.log('  CT error:', ct.lastError);
      if (pr.lastError) console.log('  PR error:', pr.lastError);
      break;
    }
  }

  console.log('\n6. Workspaces...');
  r = await fetch(`${BASE}/api/workspaces`, { headers: h });
  const ws = await r.json();
  console.log(`  Total: ${ws.length}`);
  ws.filter(w => w.isSystem).forEach(w => console.log(`  [SYS] ${w.prefix} ${w.name} (${w.systemType})`));

  await browser.close();
  console.log('\nГотово!');
}

main().catch(e => { console.error('ОШИБКА:', e.message); process.exit(1); });
