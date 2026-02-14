import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = '/Users/ed/dev/stankoff3/stankoff-portal/audit-screenshots';
const BASE_URL = 'http://localhost:3000';
const RESULTS = {
  timestamp: new Date().toISOString(),
  sections: {},
  consoleErrors: [],
  networkErrors: [],
  summary: { passed: 0, failed: 0, warnings: 0 },
};

function addResult(section, check, status, details = '') {
  if (!RESULTS.sections[section]) RESULTS.sections[section] = [];
  RESULTS.sections[section].push({ check, status, details });
  if (status === 'PASS') RESULTS.summary.passed++;
  else if (status === 'FAIL') RESULTS.summary.failed++;
  else if (status === 'WARN') RESULTS.summary.warnings++;
}

async function screenshot(page, name) {
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`  [screenshot] ${name}.png`);
}

async function closeModal(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
}

async function main() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const networkErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ url: page.url(), text: msg.text() });
    }
  });

  page.on('response', (response) => {
    if (response.status() >= 500) {
      networkErrors.push({ url: response.url(), status: response.status() });
    }
  });

  page.on('requestfailed', (request) => {
    networkErrors.push({ url: request.url(), failure: request.failure()?.errorText });
  });

  try {
    // ========== 1. LOGIN ==========
    console.log('\n=== 1. LOGIN ===');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    const allEls = await page.$$('div, button, a');
    for (const el of allEls) {
      const text = await el.textContent().catch(() => '');
      if (!text.includes('@')) continue;
      const childCount = await el.evaluate(e => e.children.length).catch(() => 999);
      const cls = await el.getAttribute('class').catch(() => '');
      if (childCount < 20 && cls?.includes('cursor')) {
        try { await el.click({ timeout: 5000 }); break; } catch { continue; }
      }
    }
    await page.waitForTimeout(3000);
    await page.waitForURL(/\/(dashboard|workspace|tasks|knowledge)/, { timeout: 10000 }).catch(() => {});

    const afterLoginUrl = page.url();
    addResult('login', 'Login via user card', afterLoginUrl.includes('/login') ? 'FAIL' : 'PASS',
      afterLoginUrl.includes('/login') ? 'Still on login' : `Redirected: ${afterLoginUrl}`);
    console.log(`  Login -> ${afterLoginUrl}`);

    // ========== 2. KNOWLEDGE BASE ==========
    console.log('\n=== 2. KNOWLEDGE BASE ===');

    // 2a. Documents tab (default)
    await page.goto(`${BASE_URL}/knowledge-base`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);
    await screenshot(page, 'kb-page');

    const kbBody = await page.textContent('body').catch(() => '');

    addResult('knowledge-base', 'Page renders', kbBody?.includes('База знаний') ? 'PASS' : 'WARN',
      kbBody?.includes('База знаний') ? 'Title found' : 'Title missing');

    const kbTabs = ['Документы', 'FAQ', 'Статистика'];
    const foundKbTabs = kbTabs.filter(t => kbBody?.includes(t));
    addResult('knowledge-base', 'Tabs present', foundKbTabs.length >= 3 ? 'PASS' : 'WARN',
      `Tabs: ${foundKbTabs.join(', ')}`);

    addResult('knowledge-base', 'Category filter', kbBody?.includes('Все категории') ? 'PASS' : 'WARN',
      kbBody?.includes('Все категории') ? 'Present' : 'Missing');

    const isEmpty = kbBody?.includes('Статей пока нет');
    addResult('knowledge-base', 'Articles list (Documents)', isEmpty ? 'WARN' : 'PASS',
      isEmpty ? 'Empty: "Статей пока нет. Создайте первую!"' : 'Articles present');

    addResult('knowledge-base', 'Upload button', kbBody?.includes('Загрузить документ') ? 'PASS' : 'WARN',
      kbBody?.includes('Загрузить документ') ? 'Present' : 'Missing');

    // Search - look for it on the Documents tab FIRST before switching tabs
    const searchOnDocs = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      return inputs.map(i => ({
        placeholder: i.placeholder || '',
        type: i.type || '',
        visible: i.offsetParent !== null,
        name: i.name || ''
      }));
    });
    console.log(`  Inputs on KB page: ${JSON.stringify(searchOnDocs)}`);
    
    let searchFound = false;
    for (const info of searchOnDocs) {
      if (info.visible && (info.placeholder.includes('Поиск') || info.placeholder.includes('поиск') || info.type === 'search')) {
        const inp = await page.$(`input[placeholder="${info.placeholder}"]`);
        if (inp) {
          await inp.fill('инструкция');
          await page.waitForTimeout(1500);
          await screenshot(page, 'kb-search');
          addResult('knowledge-base', 'Search', 'PASS', `Search input: "${info.placeholder}"`);
          searchFound = true;
          await inp.fill('');
        }
        break;
      }
    }
    if (!searchFound) {
      addResult('knowledge-base', 'Search', 'WARN', `No search input visible. Inputs: ${searchOnDocs.map(i => `"${i.placeholder}" visible=${i.visible}`).join(', ')}`);
    }

    // 2b. FAQ tab
    const faqBtn = await page.$('button:has-text("FAQ")');
    if (faqBtn) {
      await faqBtn.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await screenshot(page, 'kb-faq-tab');
      const faqBody = await page.textContent('body').catch(() => '');
      const faqEmpty = faqBody?.includes('FAQ пока нет') || faqBody?.includes('Вопросов пока нет') || faqBody?.includes('пока нет');
      addResult('knowledge-base', 'FAQ tab', 'PASS', faqEmpty ? 'Empty state' : 'FAQ content loaded');
    }

    // 2c. Statistics tab
    const statsBtn = await page.$('button:has-text("Статистика")');
    if (statsBtn) {
      await statsBtn.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await screenshot(page, 'kb-stats-tab');
      const statsBody = await page.textContent('body').catch(() => '');
      const hasStats = statsBody?.includes('Статистика') || statsBody?.includes('Документов') || statsBody?.includes('Вопросов') || statsBody?.includes('0');
      addResult('knowledge-base', 'Statistics tab', hasStats ? 'PASS' : 'WARN', hasStats ? 'Statistics visible' : 'No stats content');
    }

    // KB network errors
    const kbNet = networkErrors.filter(e => e.url?.includes('knowledge'));
    addResult('knowledge-base', 'Network errors', kbNet.length === 0 ? 'PASS' : 'FAIL',
      kbNet.length === 0 ? 'None' : `${kbNet.length} errors`);

    // ========== 3. TASKS ==========
    console.log('\n=== 3. TASKS / INBOX ===');

    await page.goto(`${BASE_URL}/tasks`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);
    await screenshot(page, 'tasks-inbox');

    const tasksUrl = page.url();
    addResult('tasks', 'Page loads', tasksUrl.includes('/tasks') ? 'PASS' : 'WARN', `URL: ${tasksUrl}`);

    const tasksBody = await page.textContent('body').catch(() => '');

    addResult('tasks', 'Header', tasksBody?.includes('Входящие задания') ? 'PASS' : 'WARN',
      tasksBody?.includes('Входящие задания') ? '"Входящие задания" found' : 'Missing');

    const countMatch = tasksBody?.match(/\((\d+)\)/);
    const showMatch = tasksBody?.match(/Показано (\d+) из (\d+)/);
    addResult('tasks', 'Task count', countMatch ? 'PASS' : 'WARN',
      `Badge: (${countMatch?.[1] || '?'}), Shown: ${showMatch ? `${showMatch[1]}/${showMatch[2]}` : 'N/A'}`);

    const taskTabs = ['Мои задачи', 'Доступные', 'Все'];
    addResult('tasks', 'Tab filters', taskTabs.filter(t => tasksBody?.includes(t)).length >= 3 ? 'PASS' : 'WARN',
      `Tabs: ${taskTabs.filter(t => tasksBody?.includes(t)).join(', ')}`);

    const statusFilters = ['Ожидают', 'В работе', 'Завершенные', 'Делегированные'];
    addResult('tasks', 'Status filters', statusFilters.filter(s => tasksBody?.includes(s)).length >= 3 ? 'PASS' : 'WARN',
      `Filters: ${statusFilters.filter(s => tasksBody?.includes(s)).join(', ')}`);

    const sortOptions = ['По приоритету', 'По дедлайну', 'По дате создания'];
    addResult('tasks', 'Sort options', sortOptions.filter(s => tasksBody?.includes(s)).length >= 2 ? 'PASS' : 'WARN',
      `Sorts: ${sortOptions.filter(s => tasksBody?.includes(s)).join(', ')}`);

    // Task cards
    const taskCards = await page.evaluate(() => {
      const container = document.querySelector('.space-y-3');
      if (!container) return [];
      return Array.from(container.children).map(child => {
        const rect = child.getBoundingClientRect();
        return {
          text: child.textContent?.trim()?.substring(0, 120) || '',
          x: Math.round(rect.x), y: Math.round(rect.y),
          w: Math.round(rect.width), h: Math.round(rect.height)
        };
      });
    });

    console.log(`  Task cards: ${taskCards.length}`);
    for (const c of taskCards.slice(0, 3)) {
      console.log(`    "${c.text.substring(0, 80)}"`);
    }
    addResult('tasks', 'Task cards', taskCards.length > 0 ? 'PASS' : 'WARN', `${taskCards.length} cards`);

    // ========== 3a. Click first task ==========
    if (taskCards.length > 0) {
      const t = taskCards[0];
      console.log(`  Clicking task at (${t.x + t.w/2}, ${t.y + t.h/2})...`);
      await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2);
      await page.waitForTimeout(3000); // Give more time for modal to load

      // Dump all fixed/overlay elements
      const overlayInfo = await page.evaluate(() => {
        const fixed = Array.from(document.querySelectorAll('*')).filter(el => {
          const style = getComputedStyle(el);
          return (style.position === 'fixed' || style.position === 'absolute') && 
                 el.offsetParent !== null && 
                 el.getBoundingClientRect().width > 300 &&
                 el.getBoundingClientRect().height > 300;
        });
        return fixed.map(el => ({
          tag: el.tagName,
          className: el.className?.toString()?.substring(0, 80) || '',
          text: el.textContent?.substring(0, 300) || '',
          rect: {
            x: Math.round(el.getBoundingClientRect().x),
            y: Math.round(el.getBoundingClientRect().y),
            w: Math.round(el.getBoundingClientRect().width),
            h: Math.round(el.getBoundingClientRect().height)
          },
          buttons: Array.from(el.querySelectorAll('button')).filter(b => b.offsetParent !== null).map(b => b.textContent?.trim()?.substring(0, 40)).filter(Boolean)
        }));
      });

      console.log(`  Overlay/fixed elements: ${overlayInfo.length}`);
      for (const o of overlayInfo) {
        console.log(`    <${o.tag} class="${o.className}"> ${o.rect.w}x${o.rect.h} buttons=[${o.buttons.join(', ')}]`);
        console.log(`      text: "${o.text.substring(0, 150)}"`);
      }

      await screenshot(page, 'task-after-click');

      // Also check if URL changed
      const afterClickUrl = page.url();
      if (afterClickUrl !== tasksUrl) {
        console.log(`  URL changed: ${afterClickUrl}`);
      }

      // Determine if modal or detail page opened
      const taskDetailModal = overlayInfo.find(o => 
        o.className.includes('fixed') || o.className.includes('modal') || o.className.includes('z-50') ||
        o.buttons.length > 0
      );

      if (taskDetailModal) {
        addResult('tasks', 'Task detail (modal)', 'PASS', 
          `Modal: ${taskDetailModal.rect.w}x${taskDetailModal.rect.h}, buttons: [${taskDetailModal.buttons.join(', ')}]`);

        // Action analysis
        const actionKw = ['принять', 'выполн', 'делегир', 'назнач', 'взять', 'завершить', 'отправить'];
        const actions = taskDetailModal.buttons.filter(b => actionKw.some(k => b.toLowerCase().includes(k)));
        addResult('tasks', 'Task actions (modal)', actions.length > 0 ? 'PASS' : 'WARN',
          actions.length > 0 ? `Actions: ${actions.join(', ')}` : `All buttons: ${taskDetailModal.buttons.join(', ')}`);

        // Metadata
        const txt = taskDetailModal.text;
        const meta = [];
        if (txt.includes('Процесс') || txt.includes('Process')) meta.push('Процесс');
        if (txt.includes('Статус') || txt.includes('Ожидает') || txt.includes('В работе')) meta.push('Статус');
        if (txt.includes('Приоритет')) meta.push('Приоритет');
        if (txt.includes('Срок') || txt.includes('Дедлайн')) meta.push('Дедлайн');
        if (txt.includes('Исполнитель') || txt.includes('Назначен')) meta.push('Исполнитель');
        if (/[A-Z]{2,3}-\d+/.test(txt)) meta.push('ID заявки');
        addResult('tasks', 'Task metadata', meta.length > 0 ? 'PASS' : 'WARN',
          meta.length > 0 ? `Found: ${meta.join(', ')}` : 'No metadata');

        // Comments
        if (txt.includes('Комментари') || txt.includes('комментари')) {
          addResult('tasks', 'Comments section', 'PASS', 'Present');
        }

        await screenshot(page, 'task-detail-modal');
        await closeModal(page);
      } else if (afterClickUrl !== tasksUrl) {
        // Task detail is a separate page
        addResult('tasks', 'Task detail (page)', 'PASS', `Page: ${afterClickUrl}`);
        await screenshot(page, 'task-detail-page');

        const detailBody = await page.textContent('body').catch(() => '');
        const detailButtons = await page.evaluate(() => 
          Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null)
            .map(b => b.textContent?.trim()?.substring(0, 50)).filter(Boolean)
        );

        const actionKw = ['принять', 'выполн', 'делегир', 'назнач', 'взять', 'завершить', 'отправить'];
        const actions = detailButtons.filter(b => actionKw.some(k => b.toLowerCase().includes(k)));
        addResult('tasks', 'Task actions', actions.length > 0 ? 'PASS' : 'WARN',
          actions.length > 0 ? `Actions: ${actions.join(', ')}` : `Buttons: ${detailButtons.join(' | ')}`);

        // Navigate back
        await page.goto(`${BASE_URL}/tasks`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(2000);
      } else {
        // Maybe inline detail — check if anything changed
        const newBody = await page.textContent('body').catch(() => '');
        if (newBody.length > tasksBody.length + 100) {
          addResult('tasks', 'Task detail (inline)', 'PASS', 'Additional content appeared after click');
        } else {
          addResult('tasks', 'Task detail', 'WARN', 'No visible change after clicking task card');
        }
      }
    }

    // ========== 3b. Tab switching ==========
    console.log('  Switching tabs...');
    
    for (const tabName of ['Доступные', 'Все']) {
      const btn = await page.$(`button:has-text("${tabName}")`);
      if (btn) {
        await btn.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(2000);
        await screenshot(page, `tasks-tab-${tabName === 'Доступные' ? 'available' : 'all'}`);
        const body = await page.textContent('body').catch(() => '');
        const match = body?.match(/Показано (\d+) из (\d+)/);
        addResult('tasks', `"${tabName}" tab`, 'PASS', match ? `${match[1]}/${match[2]} tasks` : 'Switched');
      }
    }

    // Task network errors
    const taskNet = networkErrors.filter(e => e.url?.includes('task') || e.url?.includes('bpmn') || e.url?.includes('inbox'));
    addResult('tasks', 'Network errors', taskNet.length === 0 ? 'PASS' : 'FAIL',
      taskNet.length === 0 ? 'None' : `${taskNet.length} errors`);

    // ========== 4. OVERALL ==========
    console.log('\n=== 4. OVERALL ===');

    RESULTS.consoleErrors = consoleErrors.map(e => ({ url: e.url, text: e.text?.substring(0, 200) }));
    RESULTS.networkErrors = networkErrors.map(e => ({ url: e.url, status: e.status, failure: e.failure }));

    const postLoginConsoleErrors = consoleErrors.filter(e => !e.url?.includes('/login'));
    const nonRscNetworkErrors = networkErrors.filter(e => !e.url?.includes('_rsc'));

    console.log(`  Console errors: ${consoleErrors.length} (${postLoginConsoleErrors.length} post-login)`);
    for (const e of postLoginConsoleErrors.slice(0, 3)) {
      console.log(`    ${e.text?.substring(0, 120)}`);
    }
    console.log(`  Network errors: ${networkErrors.length} (${nonRscNetworkErrors.length} non-RSC)`);
    for (const e of nonRscNetworkErrors.slice(0, 3)) {
      console.log(`    [${e.status || 'ERR'}] ${e.url}`);
    }

    addResult('overall', 'Console errors (post-login)', postLoginConsoleErrors.length === 0 ? 'PASS' : 'WARN',
      `${postLoginConsoleErrors.length} (${consoleErrors.length} total incl. login 401s)`);
    addResult('overall', 'Network errors (non-RSC)', nonRscNetworkErrors.length === 0 ? 'PASS' : 'WARN',
      `${nonRscNetworkErrors.length} (${networkErrors.length} total incl. RSC dev errors)`);

  } catch (err) {
    console.error('FATAL:', err.message);
    console.error(err.stack?.substring(0, 500));
    addResult('fatal', 'Script execution', 'FAIL', err.message);
    await screenshot(page, 'fatal-error').catch(() => {});
  } finally {
    await browser.close();
  }

  // Write results
  const resultsPath = path.join(SCREENSHOT_DIR, 'audit-kb-bpmn-result.json');
  fs.writeFileSync(resultsPath, JSON.stringify(RESULTS, null, 2));

  // Summary
  console.log('\n=============================================');
  console.log('     AUDIT KB & BPMN — FINAL RESULTS');
  console.log('=============================================');
  console.log(`  PASSED:   ${RESULTS.summary.passed}`);
  console.log(`  FAILED:   ${RESULTS.summary.failed}`);
  console.log(`  WARNINGS: ${RESULTS.summary.warnings}`);
  console.log('=============================================');

  for (const [section, checks] of Object.entries(RESULTS.sections)) {
    console.log(`\n  [${section.toUpperCase()}]`);
    for (const c of checks) {
      const icon = c.status === 'PASS' ? 'OK  ' : c.status === 'FAIL' ? 'FAIL' : 'WARN';
      console.log(`    [${icon}] ${c.check}: ${c.details.substring(0, 140)}`);
    }
  }

  console.log(`\nJSON: ${resultsPath}`);
  console.log(`Screenshots: ${SCREENSHOT_DIR}/`);
  console.log('Done.');
}

main();
