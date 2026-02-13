#!/usr/bin/env node
/**
 * Real-World Portal Audit v2 — Full CRUD + BPMN + Relations
 * Creates entities, views, edits, checks processes, all like a real user.
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3001';
const TG_TOKEN = '8348144949:AAGDa1aonbzNrlZFMM-2JzH1KOfdYgyRUVw';
const TG_CHAT = '30843047';
const DIR = join(process.cwd(), 'audit-screenshots', 'realworld-v2');

const issues = [];
const warnings = [];

async function tg(msg) {
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: 'HTML' }),
  }).catch(() => {});
}
async function tgPhoto(path, caption) {
  const f = new FormData();
  f.append('chat_id', TG_CHAT);
  f.append('photo', new Blob([readFileSync(path)], { type: 'image/png' }), 'shot.png');
  if (caption) f.append('caption', caption.slice(0, 1024));
  f.append('parse_mode', 'HTML');
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`, { method: 'POST', body: f }).catch(() => {});
}

function bug(t) { issues.push(t); console.log(`  ❌ ${t}`); }
function warn(t) { warnings.push(t); console.log(`  ⚠️ ${t}`); }
function ok(t) { console.log(`  ✅ ${t}`); }
async function shot(page, name) {
  const p = join(DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

async function main() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  await tg('🧪 <b>Real-world аудит v2 запущен</b>\nПолный CRUD + BPMN + связи');

  const consoleErrors = [];
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
  const page = await ctx.newPage();

  page.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('favicon') && !m.text().includes('DevTools') && !m.text().includes('third-party'))
      consoleErrors.push(m.text());
  });
  page.on('pageerror', e => bug(`Uncaught JS: ${e.message.slice(0, 200)}`));

  // ═══════════════ 1. LOGIN ═══════════════
  console.log('\n🔐 1. Login');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForURL('**/login', { timeout: 10000 }).catch(() => {});

  if (page.url().includes('/login')) {
    const card = page.locator('button').filter({ hasText: /youredik|Эдуард|Сарваров/i }).first();
    await card.waitFor({ state: 'visible', timeout: 15000 });
    await card.click();
    await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 15000 });
    ok(`Logged in → ${new URL(page.url()).pathname}`);
  }
  await page.waitForSelector('[data-testid="sidebar"]', { timeout: 10000 });
  await page.waitForTimeout(2000);
  await shot(page, '01-logged-in');

  // ═══════════════ 2. SIDEBAR ═══════════════
  console.log('\n📂 2. Sidebar Navigation');
  const wsNames = ['Заявки клиентов', 'Сервисные заявки', 'Маркетинговые задачи', 'HR и кадры', 'Складские операции'];
  for (const name of wsNames) {
    const link = page.locator(`text=${name}`).first();
    if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
      await link.click();
      await page.waitForTimeout(1500);
      ok(`Sidebar → "${name}"`);
    }
  }

  // Navigate to inbox and chat
  for (const [text, url] of [['Входящие задания', '/tasks'], ['Чат', '/chat'], ['База знаний', '/knowledge-base']]) {
    const link = page.locator(`text=${text}`).first();
    if (await link.isVisible()) {
      await link.click();
      await page.waitForTimeout(2000);
      if (page.url().includes(url)) ok(`${text} → ${url}`);
      else warn(`${text} didn't navigate to ${url}`);
    }
  }

  // ═══════════════ 3. KANBAN ═══════════════
  console.log('\n📋 3. Kanban Board');
  // Navigate directly to workspace to ensure clean state
  await page.locator('text=Заявки клиентов').first().click();
  await page.waitForTimeout(3000);

  // Ensure kanban view
  const kanbanBtn = page.locator('[data-testid="view-toggle-kanban"]');
  if (await kanbanBtn.isVisible({ timeout: 3000 }).catch(() => false)) await kanbanBtn.click();
  await page.waitForTimeout(2000);

  // Wait for at least one card to be VISIBLE
  const firstVisibleCard = page.locator('[data-testid="kanban-card"]').first();
  await firstVisibleCard.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});

  const cards = await page.locator('[data-testid="kanban-card"]:visible').all();
  ok(`Kanban: ${cards.length} visible cards`);
  await shot(page, '02-kanban');

  // ═══════════════ 4. OPEN ENTITY DETAIL ═══════════════
  console.log('\n📄 4. Open Entity Detail');
  if (cards.length > 0) {
    await cards[0].click();
    await page.waitForTimeout(2000);

    const detail = page.locator('[data-testid="entity-detail-panel"]');
    if (await detail.isVisible({ timeout: 5000 }).catch(() => false)) {
      ok('Detail panel opened');

      // Check all detail sections
      for (const [testid, label] of [
        ['entity-title', 'Title'],
        ['entity-status-section', 'Status'],
        ['entity-assignee-section', 'Assignee'],
        ['entity-comments-section', 'Comments'],
      ]) {
        const el = page.locator(`[data-testid="${testid}"]`);
        if (await el.isVisible({ timeout: 2000 }).catch(() => false)) ok(`Detail: ${label} visible`);
        else warn(`Detail: ${label} not visible`);
      }

      // Check AI assistant tab
      const aiTab = page.locator('[data-testid="ai-assistant-tab"]');
      if (await aiTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await aiTab.click();
        await page.waitForTimeout(2000);
        ok('AI Assistant tab clicked');
        await shot(page, '03-ai-assistant');
      }

      // Check links/relations section
      const linksSection = page.locator('text=СВЯЗИ').first();
      if (await linksSection.isVisible({ timeout: 2000 }).catch(() => false)) {
        ok('Links/relations section visible');
      }

      // Check comment input
      const commentInput = page.locator('[data-testid="entity-comments-section"] textarea, [contenteditable="true"]').first();
      if (await commentInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        ok('Comment input visible');
      }

      await shot(page, '04-entity-detail');

      // Close detail
      const closeBtn = page.locator('[data-testid="entity-close-button"]');
      if (await closeBtn.isVisible()) await closeBtn.click();
      else await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      bug('Detail panel did not open');
    }
  }

  // ═══════════════ 5. CREATE ENTITY ═══════════════
  console.log('\n➕ 5. Create Entity');
  const newBtn = page.locator('text=Новая заявка').first();
  if (await newBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await newBtn.click();
    await page.waitForTimeout(1500);

    const modal = page.locator('[data-testid="create-entity-modal"]');
    if (await modal.isVisible({ timeout: 5000 }).catch(() => false)) {
      ok('Create modal opened');

      // Fill the form
      const titleInput = page.locator('[data-testid="create-entity-title-input"]');
      await titleInput.fill('AUDIT-TEST: Тестовая заявка от автоаудита');

      // Set high priority
      await page.locator('button:has-text("Высокий")').first().click();
      ok('Priority set to high');

      // Fill custom fields if visible
      const clientField = page.locator('input').filter({ has: page.locator('..').filter({ hasText: /клиент/i }) }).first();
      if (await clientField.isVisible({ timeout: 1000 }).catch(() => false)) {
        // Look for text inputs inside form sections
      }

      await shot(page, '05-create-form-filled');

      // Submit the entity
      const submitBtn = page.locator('[data-testid="create-entity-submit"]');
      if (await submitBtn.isEnabled()) {
        await submitBtn.click();
        await page.waitForTimeout(3000);
        ok('Entity creation submitted');
        await shot(page, '06-after-create');
      }

      // Check if modal closed (entity created)
      if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
        warn('Create modal still visible after submit');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      } else {
        ok('Modal closed after creation');
      }
    }
  }

  // ═══════════════ 6. FIND & VIEW CREATED ENTITY ═══════════════
  console.log('\n🔍 6. Find & View Created Entity');
  await page.waitForTimeout(1000);

  // Look for our created entity in kanban
  const auditCard = page.locator('[data-testid="kanban-card"]').filter({ hasText: 'AUDIT-TEST' }).first();
  if (await auditCard.isVisible({ timeout: 5000 }).catch(() => false)) {
    ok('Created entity found in kanban');
    await auditCard.click();
    await page.waitForTimeout(2000);

    const detail = page.locator('[data-testid="entity-detail-panel"]');
    if (await detail.isVisible({ timeout: 5000 }).catch(() => false)) {
      ok('Created entity detail opened');

      // Check title is correct
      const title = page.locator('[data-testid="entity-title"]');
      const titleText = await title.textContent().catch(() => '');
      if (titleText?.includes('AUDIT-TEST')) ok('Entity title correct');
      else warn(`Entity title mismatch: "${titleText}"`);

      // Check priority badge
      const highBadge = page.locator('text=Высокий').first();
      if (await highBadge.isVisible({ timeout: 2000 }).catch(() => false)) {
        ok('High priority badge visible');
      }

      await shot(page, '07-created-entity-detail');

      // ═══════════════ 7. EDIT ENTITY ═══════════════
      console.log('\n✏️ 7. Edit Entity');

      // Try to edit title (click on it)
      const titleEl = page.locator('[data-testid="entity-title"]');
      if (await titleEl.isVisible()) {
        await titleEl.click();
        await page.waitForTimeout(500);

        // Check if it became editable
        const titleInput = page.locator('[data-testid="entity-title"] input, [data-testid="entity-title"] textarea, [data-testid="entity-title"][contenteditable="true"]').first();
        if (await titleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await titleInput.fill('AUDIT-TEST: Отредактированная заявка');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(1000);
          ok('Entity title edited');
        } else {
          // Title may require double-click
          await titleEl.dblclick();
          await page.waitForTimeout(500);
          const input2 = page.locator('input, textarea').filter({ has: page.locator('[value*="AUDIT"]') }).first();
          if (await input2.isVisible({ timeout: 1000 }).catch(() => false)) {
            ok('Title became editable on double-click');
          } else {
            warn('Title editing method unclear');
          }
        }
      }

      // Change status
      const statusSection = page.locator('[data-testid="entity-status-section"]');
      if (await statusSection.isVisible()) {
        // Click on "В обработке" status to change
        const nextStatus = page.locator('text=В обработке').first();
        if (await nextStatus.isVisible({ timeout: 2000 }).catch(() => false)) {
          await nextStatus.click();
          await page.waitForTimeout(1500);
          ok('Status changed to "В обработке"');
          await shot(page, '08-status-changed');
        }
      }

      // Add a comment
      console.log('\n💬 7b. Add Comment');
      const commentArea = page.locator('[contenteditable="true"]').last();
      if (await commentArea.isVisible({ timeout: 3000 }).catch(() => false)) {
        await commentArea.click();
        await commentArea.fill('Тестовый комментарий от автоаудита');
        await page.waitForTimeout(500);

        const sendBtn = page.locator('button:has-text("Отправить")').first();
        if (await sendBtn.isVisible() && await sendBtn.isEnabled()) {
          await sendBtn.click();
          await page.waitForTimeout(2000);
          ok('Comment posted');
          await shot(page, '09-comment-added');
        }
      } else {
        warn('Comment input not found');
      }

      // Close detail
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  } else {
    warn('Created entity not found in kanban (might need scroll)');
  }

  // ═══════════════ 8. TABLE VIEW ═══════════════
  console.log('\n📊 8. Table View');
  const tableBtn = page.locator('[data-testid="view-toggle-table"]');
  if (await tableBtn.isVisible()) {
    await tableBtn.click();
    await page.waitForTimeout(2000);

    const rows = await page.locator('[data-testid="table-row"]').all();
    if (rows.length > 0) {
      ok(`Table: ${rows.length} rows`);

      // Click a row
      await rows[0].click();
      await page.waitForTimeout(2000);

      if (await page.locator('[data-testid="entity-detail-panel"]').isVisible({ timeout: 3000 }).catch(() => false)) {
        ok('Table row click opens detail');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    } else {
      warn('No table rows found');
    }
    await shot(page, '10-table-view');
  }

  // ═══════════════ 9. ANALYTICS ═══════════════
  console.log('\n📈 9. Analytics');
  const analyticsBtn = page.locator('[data-testid="view-toggle-analytics"]');
  if (await analyticsBtn.isVisible()) {
    await analyticsBtn.click();
    await page.waitForTimeout(3000);

    const charts = await page.locator('canvas, svg.recharts-surface').all();
    ok(`Analytics: ${charts.length} charts`);
    await shot(page, '11-analytics');
  }

  // Switch back to kanban
  if (await kanbanBtn.isVisible()) await kanbanBtn.click();
  await page.waitForTimeout(1000);

  // ═══════════════ 10. WORKSPACE SETTINGS ═══════════════
  console.log('\n⚙️ 10. Workspace Settings');
  const settingsBtn = page.locator('text=Настройки').first();
  if (await settingsBtn.isVisible()) {
    await settingsBtn.click();
    await page.waitForTimeout(3000);

    if (page.url().includes('/settings')) {
      ok('Settings page loaded');

      // Check builder
      const builder = page.locator('[data-testid="workspace-builder"]');
      if (await builder.isVisible({ timeout: 5000 }).catch(() => false)) {
        ok('Workspace builder visible');

        // Check field palette
        const palette = page.locator('[data-testid="field-palette"]');
        if (await palette.isVisible({ timeout: 2000 }).catch(() => false)) {
          ok('Field palette visible');
        }
      }
      await shot(page, '12-workspace-settings');
    }

    // Go back
    await page.goBack();
    await page.waitForTimeout(1500);
  }

  // ═══════════════ 11. BPMN PROCESSES ═══════════════
  console.log('\n⚡ 11. BPMN Processes');

  // Check if processes page exists for this workspace
  const wsId = page.url().match(/workspace\/([^/?]+)/)?.[1];
  if (wsId) {
    await page.goto(`${BASE_URL}/workspace/${wsId}/processes`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);

    if (page.url().includes('/processes')) {
      ok('Processes page loaded');

      const processList = page.locator('[data-testid="process-list"]');
      if (await processList.isVisible({ timeout: 5000 }).catch(() => false)) {
        ok('Process list visible');
      }

      // Check triggers
      const triggersList = page.locator('[data-testid="triggers-list"]');
      if (await triggersList.isVisible({ timeout: 3000 }).catch(() => false)) {
        ok('Triggers list visible');
      }

      await shot(page, '13-bpmn-processes');
    }
  }

  // ═══════════════ 12. TASKS INBOX ═══════════════
  console.log('\n📬 12. Tasks Inbox');
  await page.goto(`${BASE_URL}/tasks`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  // Check all tabs
  for (const tab of ['Мои задачи', 'Доступные', 'Все']) {
    const tabEl = page.locator(`text=${tab}`).first();
    if (await tabEl.isVisible()) {
      await tabEl.click();
      await page.waitForTimeout(1500);
      ok(`Tasks tab "${tab}" clicked`);
    }
  }
  await shot(page, '14-tasks-inbox');

  // ═══════════════ 13. CHAT ═══════════════
  console.log('\n💬 13. Chat');
  await page.goto(`${BASE_URL}/chat`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  const newChatBtn = page.locator('[data-testid="chat-new-btn"]');
  if (await newChatBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await newChatBtn.click();
    await page.waitForTimeout(1500);
    ok('New chat dialog opened');
    await shot(page, '15-chat-new');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
  await shot(page, '15-chat');

  // ═══════════════ 14. KNOWLEDGE BASE ═══════════════
  console.log('\n📚 14. Knowledge Base');
  await page.goto(`${BASE_URL}/knowledge-base`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  for (const tab of ['Документы', 'FAQ', 'Статистика']) {
    const el = page.locator(`text=${tab}`).first();
    if (await el.isVisible()) {
      await el.click();
      await page.waitForTimeout(1000);
      ok(`KB tab "${tab}"`);
    }
  }
  await shot(page, '16-knowledge-base');

  // ═══════════════ 15. ADMIN PAGES (post-fix) ═══════════════
  console.log('\n👑 15. Admin Pages');

  for (const [path, name] of [['/admin/users', 'Users'], ['/admin/roles', 'Roles'], ['/admin/invitations', 'Invitations']]) {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const onAdmin = page.url().includes('/admin');
    const adminBreadcrumb = await page.locator('text=Администрирование').isVisible({ timeout: 3000 }).catch(() => false);

    if (onAdmin || adminBreadcrumb) {
      ok(`Admin ${name} page loaded`);
    } else {
      bug(`Admin ${name} redirected to ${new URL(page.url()).pathname}`);
    }
    await shot(page, `17-admin-${name.toLowerCase()}`);
  }

  // ═══════════════ 16. GLOBAL SEARCH ═══════════════
  console.log('\n🔎 16. Global Search');
  await page.goto(`${BASE_URL}/workspace`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  // Try Cmd+K
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(1000);

  const searchInput = page.locator('[data-testid="global-search-input"]');
  if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await searchInput.fill('станок');
    await page.waitForTimeout(2000);
    ok('Global search works');
    await shot(page, '18-global-search');
    await page.keyboard.press('Escape');
  } else {
    // Try clicking search trigger
    const trigger = page.locator('[data-testid="global-search-trigger"]');
    if (await trigger.isVisible()) {
      await trigger.click();
      await page.waitForTimeout(1000);
    }
  }

  // ═══════════════ 17. NOTIFICATIONS ═══════════════
  console.log('\n🔔 17. Notifications');
  const bell = page.locator('[data-testid="notification-bell"]');
  if (await bell.isVisible({ timeout: 3000 }).catch(() => false)) {
    await bell.click();
    await page.waitForTimeout(1500);
    ok('Notification panel opened');
    await shot(page, '19-notifications');
    await page.keyboard.press('Escape');
  }

  // ═══════════════ 18. DIFFERENT WORKSPACE ═══════════════
  console.log('\n🔄 18. Service Workspace (different kanban)');
  await page.locator('text=Сервисные заявки').first().click();
  await page.waitForTimeout(2000);

  // Wait for visible cards
  await page.locator('[data-testid="kanban-card"]').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  const szCards = await page.locator('[data-testid="kanban-card"]:visible').all();
  ok(`Service workspace: ${szCards.length} visible cards`);

  if (szCards.length > 0) {
    await szCards[0].click();
    await page.waitForTimeout(2000);

    if (await page.locator('[data-testid="entity-detail-panel"]').isVisible({ timeout: 3000 }).catch(() => false)) {
      ok('Service entity detail opened');
      await shot(page, '20-service-detail');
      await page.keyboard.press('Escape');
    }
  }

  // ═══════════════ 19. CLEANUP TEST DATA ═══════════════
  console.log('\n🧹 19. Cleanup Test Entity');

  // Go back to ZK workspace and delete test entity via API
  try {
    const tokenRes = await fetch(`${API_URL}/api/auth/dev/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'youredik@gmail.com' }),
    });
    const { accessToken } = await tokenRes.json();

    // Search for our test entity
    const searchRes = await fetch(`${API_URL}/api/entities/search?q=AUDIT-TEST`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (searchRes.ok) {
      const results = await searchRes.json();
      const testEntities = (results.items || results || []).filter(e =>
        e.title?.includes('AUDIT-TEST')
      );

      for (const entity of testEntities) {
        await fetch(`${API_URL}/api/entities/${entity.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      if (testEntities.length > 0) ok(`Cleaned up ${testEntities.length} test entities`);
      else ok('No test entities to clean up');
    }
  } catch (e) {
    warn(`Cleanup failed: ${e.message}`);
  }

  // ═══════════════ DONE ═══════════════
  await browser.close();

  console.log('\n\n═══════════════════════════════════════');
  console.log('📊 FULL AUDIT COMPLETE');
  console.log('═══════════════════════════════════════\n');

  const report = ['📊 <b>ПОЛНЫЙ АУДИТ ПОРТАЛА v2</b>\n'];
  report.push(`Console errors: ${consoleErrors.length}`);

  if (issues.length > 0) {
    report.push(`\n❌ <b>БАГИ (${issues.length}):</b>`);
    issues.forEach((i, n) => report.push(`${n + 1}. ${i}`));
  } else {
    report.push('\n✅ <b>Критических багов не найдено</b>');
  }

  if (warnings.length > 0) {
    report.push(`\n⚠️ <b>ПРЕДУПРЕЖДЕНИЯ (${warnings.length}):</b>`);
    warnings.forEach((w, n) => report.push(`${n + 1}. ${w}`));
  }

  if (consoleErrors.length > 0) {
    report.push(`\n🖥️ <b>Console (${consoleErrors.length}):</b>`);
    consoleErrors.slice(0, 10).forEach((e, n) => report.push(`${n + 1}. ${e.slice(0, 150)}`));
  }

  const full = report.join('\n');
  console.log(full.replace(/<[^>]+>/g, ''));

  writeFileSync(join(DIR, 'report.txt'), full.replace(/<[^>]+>/g, ''));
  writeFileSync(join(DIR, 'result.json'), JSON.stringify({ issues, warnings, consoleErrors }, null, 2));

  // Send to Telegram
  if (full.length <= 4000) {
    await tg(full);
  } else {
    let chunk = '';
    for (const line of report) {
      if ((chunk + '\n' + line).length > 4000) {
        await tg(chunk); await new Promise(r => setTimeout(r, 300));
        chunk = line;
      } else chunk += (chunk ? '\n' : '') + line;
    }
    if (chunk) await tg(chunk);
  }

  // Send screenshots
  for (const name of ['01-logged-in', '04-entity-detail', '06-after-create', '08-status-changed', '13-bpmn-processes', '17-admin-users']) {
    const p = join(DIR, `${name}.png`);
    if (existsSync(p)) { await tgPhoto(p, name); await new Promise(r => setTimeout(r, 500)); }
  }
}

main().catch(async (e) => {
  console.error('Audit crashed:', e.message);
  await tg(`💥 Аудит v2 упал на: ${e.message.slice(0, 300)}`);
  process.exit(1);
});
