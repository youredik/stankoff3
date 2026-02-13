import { chromium } from 'playwright';

const BASE = 'https://preprod.stankoff.ru';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  // 1. Login via Keycloak
  console.log('1. Логин...');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  if (page.url().includes('oidc')) {
    await page.fill('#username', 'youredik@gmail.com');
    await page.fill('#password', 'TestPass123');
    await page.click('#kc-login');
    await page.waitForURL('**/workspace/**', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }

  console.log('   URL:', page.url().substring(0, 70));

  // Check cookies
  const cookies = await ctx.cookies();
  console.log('   Cookies:', cookies.map(c => `${c.name}(${c.domain})`).join(', '));

  const accessToken = cookies.find(c => c.name === 'access_token');
  const refreshToken = cookies.find(c => c.name === 'refresh_token');
  console.log('   access_token:', accessToken ? `✓ (${accessToken.domain})` : '✗');
  console.log('   refresh_token:', refreshToken ? `✓ (${refreshToken.domain})` : '✗');

  // Try direct API call with the page's cookies
  console.log('\n2. Тест API...');
  const apiTest = await page.evaluate(async () => {
    try {
      const r = await fetch('/api/workspaces', { credentials: 'include' });
      const text = await r.text();
      return { status: r.status, body: text.substring(0, 200) };
    } catch (e) {
      return { error: e.message };
    }
  });
  console.log('   /api/workspaces:', apiTest.status, apiTest.body?.substring(0, 100));

  // If 401, try navigating to see if the page loads with data
  if (apiTest.status === 401) {
    console.log('   API 401, но страница может работать через SSR...');
    // Navigate to the current workspace page (we're already there from login redirect)
    await page.waitForTimeout(2000);

    // Check if the page has loaded entities via SSR
    const pageHtml = await page.content();
    const hasEntities = /[A-Z]+-\d+/.test(pageHtml);
    console.log('   Страница содержит entity IDs:', hasEntities);

    // Try to call auth endpoint
    const authCheck = await page.evaluate(async () => {
      try {
        const r = await fetch('/api/auth/me', { credentials: 'include' });
        return { status: r.status, body: await r.text().then(t => t.substring(0, 200)) };
      } catch (e) { return { error: e.message }; }
    });
    console.log('   /api/auth/me:', authCheck.status, authCheck.body?.substring(0, 80));
  }

  // 3. Take screenshot and try to interact with the page directly
  console.log('\n3. Проверка UI...');
  await page.screenshot({ path: 'audit-screenshots/relations-01-page.png' });

  // Wait for page to fully render
  await page.waitForTimeout(3000);

  // Count visible entities on page
  const entityTexts = await page.evaluate(() => {
    const els = document.querySelectorAll('*');
    const ids = [];
    els.forEach(el => {
      const text = el.textContent?.match(/[A-Z]+-\d+/);
      if (text && el.children.length < 3) ids.push(text[0]);
    });
    return [...new Set(ids)].slice(0, 10);
  });
  console.log('   Entity IDs на странице:', entityTexts.join(', ') || 'нет');

  // 4. Try to click on an entity
  if (entityTexts.length > 0) {
    console.log(`\n4. Кликаю на ${entityTexts[0]}...`);

    // Use a more reliable click approach
    await page.evaluate((id) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (walker.currentNode.textContent?.includes(id)) {
          const el = walker.currentNode.parentElement;
          // Walk up to find clickable ancestor
          let target = el;
          for (let i = 0; i < 5; i++) {
            if (target?.classList?.contains('cursor-pointer') || target?.onclick || target?.tagName === 'A' || target?.tagName === 'BUTTON') {
              target.click();
              return true;
            }
            target = target?.parentElement;
          }
          el?.click();
          return true;
        }
      }
      return false;
    }, entityTexts[0]);

    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'audit-screenshots/relations-02-entity.png' });

    // 5. Find "Связи" section
    console.log('\n5. Ищу "Связи" и кнопку добавления...');

    // Scroll all scrollable panels
    await page.evaluate(() => {
      document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]').forEach(el => {
        el.scrollTop = el.scrollHeight;
      });
    });
    await page.waitForTimeout(500);

    // Check for button with title
    const addBtnExists = await page.evaluate(() => {
      const btn = document.querySelector('button[title="Добавить связь"]');
      return btn ? { visible: btn.offsetParent !== null, rect: btn.getBoundingClientRect() } : null;
    });
    console.log('   Кнопка "Добавить связь":', addBtnExists ? `✓ visible=${addBtnExists.visible}` : '✗ не найдена');

    if (addBtnExists) {
      await page.click('button[title="Добавить связь"]');
      await page.waitForTimeout(3000);

      await page.screenshot({ path: 'audit-screenshots/relations-03-modal.png' });

      // Analyze modal
      console.log('\n6. Модалка:');
      const modalState = await page.evaluate(() => {
        const body = document.body.textContent || '';
        const modalBtns = document.querySelectorAll('.max-h-64 button');
        const select = document.querySelector('select');
        const selectedOpt = select?.options[select.selectedIndex]?.textContent;

        return {
          hasModal: body.includes('Добавить связь'),
          selectedWorkspace: selectedOpt?.trim(),
          entityCount: modalBtns.length,
          entities: Array.from(modalBtns).slice(0, 5).map(b => b.textContent?.replace(/\s+/g, ' ').trim().substring(0, 80)),
          hasNoEntities: body.includes('Нет доступных'),
          hasRecentEntities: body.includes('Последние заявки'),
          isLoading: body.includes('Загрузка...'),
        };
      });

      console.log('   Модалка открыта:', modalState.hasModal);
      console.log('   Workspace:', modalState.selectedWorkspace);
      console.log('   Количество сущностей:', modalState.entityCount);
      console.log('   "Нет доступных":', modalState.hasNoEntities);
      console.log('   "Последние заявки":', modalState.hasRecentEntities);
      console.log('   Загрузка:', modalState.isLoading);

      if (modalState.entityCount > 0) {
        console.log('   ✅ Сущности отображаются:');
        modalState.entities.forEach(e => console.log('     ', e));
      }

      // Test search
      console.log('\n7. Поиск...');
      const input = await page.$('input[placeholder*="Поиск"]');
      if (input) {
        await input.fill('Тестирование');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'audit-screenshots/relations-04-search.png' });

        const searchState = await page.evaluate(() => {
          const btns = document.querySelectorAll('.max-h-64 button');
          return {
            count: btns.length,
            items: Array.from(btns).slice(0, 3).map(b => b.textContent?.replace(/\s+/g, ' ').trim().substring(0, 80)),
          };
        });
        console.log('   "Тестирование" — результатов:', searchState.count);
        searchState.items.forEach(i => console.log('     ', i));
      }
    }
  }

  console.log('\n=== Console errors ===');
  if (errors.length === 0) console.log('   Нет');
  errors.slice(0, 5).forEach(e => console.log('  ', e.substring(0, 150)));

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
