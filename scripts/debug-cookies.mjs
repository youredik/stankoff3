import { chromium } from 'playwright';
const b = await chromium.launch({headless:true});
const c = await b.newContext();
const p = await c.newPage();
await p.goto('http://localhost:3000/login', {waitUntil:'networkidle',timeout:20000});
await p.waitForTimeout(1500);
const cards = await p.$$('[class*="cursor-pointer"]');
for (const card of cards) {
  const t = await card.textContent().catch(()=>'');
  if (t.includes('youredik') || t.includes('Станков Э')) { await card.click(); break; }
}
await p.waitForURL(u => !u.pathname.includes('/login'), {timeout:10000}).catch(()=>{});
await p.waitForTimeout(1000);
const cookies = await c.cookies();
console.log('COOKIES:', JSON.stringify(cookies.map(cc=>({name:cc.name,val:cc.value.substring(0,40),httpOnly:cc.httpOnly})), null, 2));

// Try fetch from page
const result = await p.evaluate(async () => {
  const r = await fetch('/api/auth/me', {credentials:'include'});
  return {status: r.status, cookie: document.cookie.substring(0,100)};
});
console.log('PAGE FETCH:', JSON.stringify(result));

// Try Playwright's request context
const apiResp = await c.request.get('http://localhost:3000/api/auth/me');
console.log('CTX REQUEST:', apiResp.status(), (await apiResp.text()).substring(0,200));

await b.close();
