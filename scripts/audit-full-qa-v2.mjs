/**
 * FULL QA AUDIT v2 — Corrected API paths
 * Tests: BPMN lifecycle, RBAC, DMN, Chat, Entity CRUD, Knowledge Base, SLA
 */

const BASE = 'http://localhost:3000/api';
const results = { total: 0, passed: 0, failed: 0, errors: [], bugs: [] };

function test(name, ok, details = '') {
  results.total++;
  if (ok) { results.passed++; console.log('  ✅ ' + name + (details ? ' — ' + details : '')); }
  else { results.failed++; console.log('  ❌ ' + name + (details ? ' — ' + details : '')); results.errors.push(name + (details ? ' — ' + details : '')); }
}

function bug(desc) { results.bugs.push(desc); console.log('  🐛 BUG: ' + desc); }

async function getToken(email) {
  const r = await fetch(BASE + '/auth/dev/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const d = await r.json();
  if (!d.accessToken) throw new Error('Auth failed for ' + email);
  return d.accessToken;
}

function api(token) {
  return async (method, path, body) => {
    const opts = { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(BASE + path, opts);
    return { status: resp.status, data: await resp.json().catch(() => null), ok: resp.status < 400 };
  };
}

async function run() {
  console.log('🚀 FULL QA AUDIT v2 — Stankoff Portal\n');
  const t0 = Date.now();

  const adminToken = await getToken('youredik@gmail.com');
  const managerToken = await getToken('andrey@stankoff.ru');

  const admin = api(adminToken);
  const manager = api(managerToken);

  const adminMe = await admin('GET', '/auth/me');
  const managerMe = await manager('GET', '/auth/me');
  test('Admin auth', adminMe.ok, adminMe.data?.email);
  test('Manager auth', managerMe.ok, managerMe.data?.email);

  const adminId = adminMe.data?.id;
  const managerId = managerMe.data?.id;

  const wsResp = await admin('GET', '/workspaces');
  const workspaces = wsResp.data || [];
  test('Workspaces loaded', workspaces.length > 0, `count: ${workspaces.length}`);

  // Run all tests in parallel
  const settled = await Promise.allSettled([
    // ============ 1. BPMN LIFECYCLE ============
    (async () => {
      console.log('\n📋 [BPMN] Full Lifecycle');

      const health = await admin('GET', '/bpmn/health');
      test('[BPMN] Zeebe health', health.data?.connected === true);

      const templates = await admin('GET', '/bpmn/templates');
      test('[BPMN] Templates', templates.ok, `${templates.data?.length}`);

      // Inbox
      const inbox = await admin('GET', '/bpmn/tasks/inbox');
      const items = inbox.data?.items || [];
      test('[BPMN] Inbox tasks', items.length > 0, `count: ${items.length}`);

      if (items.length === 0) {
        bug('Inbox still empty — possible SQL error');
        if (inbox.status === 500) bug('Inbox returns 500: ' + JSON.stringify(inbox.data).substring(0, 100));
        return;
      }

      const task = items.find(t => t.status === 'created');
      if (!task) { console.log('  No unclaimed tasks, skipping lifecycle'); return; }

      console.log(`  Task: ${task.elementName || task.elementId}`);

      // Detail
      const detail = await admin('GET', `/bpmn/tasks/${task.id}`);
      test('[BPMN] Task detail', detail.ok);

      // Comments
      test('[BPMN] Comments list', (await admin('GET', `/bpmn/tasks/${task.id}/comments`)).ok);

      // Add comment
      test('[BPMN] Add comment', (await admin('POST', `/bpmn/tasks/${task.id}/comments`, {
        content: '[QA v2] Test comment — ' + new Date().toISOString(),
      })).ok);

      // Claim
      const claim = await admin('POST', `/bpmn/tasks/${task.id}/claim`);
      test('[BPMN] Claim', claim.ok);

      // Verify
      const afterClaim = await admin('GET', `/bpmn/tasks/${task.id}`);
      test('[BPMN] Verified claimed', afterClaim.data?.status === 'claimed' && afterClaim.data?.assigneeId === adminId);

      // Delegate
      const delegate = await admin('POST', `/bpmn/tasks/${task.id}/delegate`, { toUserId: managerId });
      test('[BPMN] Delegate', delegate.ok);

      // Manager inbox
      const mInbox = await manager('GET', '/bpmn/tasks/inbox');
      const mItems = mInbox.data?.items || [];
      test('[BPMN] Manager sees delegated', mItems.some(t => t.id === task.id));

      // Manager completes
      const complete = await manager('POST', `/bpmn/tasks/${task.id}/complete`, {
        formData: { decision: 'approved', comment: 'QA v2 delegate test' },
      });
      test('[BPMN] Manager completes', complete.ok);

      // Verify completed
      const afterComplete = await admin('GET', `/bpmn/tasks/${task.id}`);
      test('[BPMN] Verified completed', afterComplete.data?.status === 'completed');

      // Stats
      test('[BPMN] Statistics', (await admin('GET', `/bpmn/tasks/statistics?workspaceId=${workspaces[0]?.id}`)).ok);

      // Process instances
      for (const ws of workspaces.slice(0, 5)) {
        const inst = await admin('GET', `/bpmn/instances/workspace/${ws.id}`);
        const data = inst.data?.data || (Array.isArray(inst.data) ? inst.data : []);
        if (data.length > 0) {
          test('[BPMN] Instances exist', true, `${ws.name}: ${data.length}`);
          test('[BPMN] Timeline', (await admin('GET', `/bpmn/instances/${data[0].id}/timeline`)).ok);
          break;
        }
      }
    })(),

    // ============ 2. RBAC ============
    (async () => {
      console.log('\n📋 [RBAC] Roles & Permissions');

      const roles = await admin('GET', '/rbac/roles');
      test('[RBAC] Roles list', roles.ok, `count: ${roles.data?.length}`);

      const roleList = roles.data || [];
      test('[RBAC] Global roles ≥ 3', roleList.filter(r => r.scope === 'global').length >= 3);
      test('[RBAC] Workspace roles ≥ 3', roleList.filter(r => r.scope === 'workspace').length >= 3);
      test('[RBAC] Section roles ≥ 2', roleList.filter(r => r.scope === 'section').length >= 2);

      // Role detail
      if (roleList[0]) {
        test('[RBAC] Role detail', (await admin('GET', `/rbac/roles/${roleList[0].id}`)).ok);
      }

      // Permissions
      const perms = await admin('GET', '/rbac/permissions');
      test('[RBAC] Permission registry', perms.ok, `count: ${perms.data?.length}`);
      test('[RBAC] Permission categories', (await admin('GET', '/rbac/permissions/categories')).ok);

      // My permissions
      const myPerms = await admin('GET', '/rbac/permissions/my');
      test('[RBAC] Admin has *', myPerms.data?.permissions?.includes('*'));

      test('[RBAC] Workspace perms map', (await admin('GET', '/rbac/permissions/my/workspaces')).ok);

      // Manager check
      const mPerms = await manager('GET', '/rbac/permissions/my');
      test('[RBAC] Manager no wildcard', !mPerms.data?.permissions?.includes('*'));

      // Create custom role
      const slug = 'qa_test_' + Date.now();
      const custom = await admin('POST', '/rbac/roles', {
        name: 'QA Test', slug, scope: 'workspace',
        permissions: ['workspace:entity:read'], description: 'Auto QA',
      });
      test('[RBAC] Create custom role', custom.ok);

      if (custom.data?.id) {
        test('[RBAC] Update role', (await admin('PUT', `/rbac/roles/${custom.data.id}`, {
          permissions: ['workspace:entity:read', 'workspace:entity:create'],
        })).ok);
        test('[RBAC] Delete role', (await admin('DELETE', `/rbac/roles/${custom.data.id}`)).ok);
      }

      // System role deletion fails
      const sys = roleList.find(r => r.isSystem);
      if (sys) {
        const del = await admin('DELETE', `/rbac/roles/${sys.id}`);
        test('[RBAC] System role protected', del.status >= 400);
      }

      // Assign global role
      const empRole = roleList.find(r => r.slug === 'employee');
      if (empRole) {
        const assign = await admin('POST', '/rbac/assign/global', { userId: managerId, roleId: empRole.id });
        test('[RBAC] Assign global role', assign.ok);
      }
    })(),

    // ============ 3. DMN ============
    (async () => {
      console.log('\n📋 [DMN] Decision Tables');

      let tableId = null;
      for (const ws of workspaces) {
        const t = await admin('GET', `/dmn/tables?workspaceId=${ws.id}`);
        if (Array.isArray(t.data) && t.data.length > 0) {
          tableId = t.data[0].id;
          test('[DMN] Tables found', true, `${t.data.length} in ${ws.name}`);
          break;
        }
      }

      if (!tableId) { console.log('  No DMN tables'); return; }

      const detail = await admin('GET', `/dmn/tables/${tableId}`);
      test('[DMN] Table detail', detail.ok, `rules: ${detail.data?.rules?.length}`);

      if (detail.data?.inputColumns?.length > 0 && detail.data?.rules?.length > 0) {
        const inputData = {};
        for (const col of detail.data.inputColumns) {
          const rule = detail.data.rules[0];
          const val = rule.inputs?.[col.id];
          if (col.dataType === 'number') inputData[col.id] = typeof val === 'number' ? val : 100;
          else inputData[col.id] = val || 'medium';
        }

        const ev = await admin('POST', '/dmn/evaluate', { decisionTableId: tableId, inputData });
        test('[DMN] Evaluate', ev.ok,
          ev.ok ? `matched: ${ev.data?.matchedRules?.length}` : `error: ${JSON.stringify(ev.data).substring(0, 100)}`);
        if (!ev.ok) bug('DMN evaluate: ' + JSON.stringify(ev.data).substring(0, 200));
      }

      test('[DMN] Statistics', (await admin('GET', `/dmn/tables/${tableId}/statistics`)).ok);
    })(),

    // ============ 4. CHAT ============
    (async () => {
      console.log('\n📋 [CHAT] Conversations & Messages');

      const convs = await admin('GET', '/chat/conversations');
      test('[CHAT] List conversations', convs.ok, `count: ${convs.data?.length || convs.data?.items?.length}`);

      // Create group conversation
      const group = await admin('POST', '/chat/conversations', {
        name: 'QA Test Group — ' + Date.now(),
        type: 'group',
        participantIds: [adminId, managerId],
      });
      test('[CHAT] Create group', group.ok, `id: ${group.data?.id}`);

      if (group.data?.id) {
        const cid = group.data.id;

        // Send message
        const msg = await admin('POST', `/chat/conversations/${cid}/messages`, {
          content: 'Привет! QA тест чата.',
        });
        test('[CHAT] Send message', msg.ok);

        // Get messages
        const msgs = await admin('GET', `/chat/conversations/${cid}/messages`);
        const msgList = Array.isArray(msgs.data) ? msgs.data : (msgs.data?.items || []);
        test('[CHAT] Get messages', msgList.length > 0, `count: ${msgList.length}`);

        // Manager reads
        const mMsgs = await manager('GET', `/chat/conversations/${cid}/messages`);
        test('[CHAT] Manager sees messages', mMsgs.ok);

        // Manager replies
        test('[CHAT] Manager reply', (await manager('POST', `/chat/conversations/${cid}/messages`, {
          content: 'Ответ менеджера — QA.',
        })).ok);

        // Mark read
        const read = await admin('POST', `/chat/conversations/${cid}/read`);
        test('[CHAT] Mark read', read.ok || read.status < 500);

        // Detail
        test('[CHAT] Conversation detail', (await admin('GET', `/chat/conversations/${cid}`)).ok);

        // Unread counts
        const unread = await admin('GET', '/chat/unread-counts');
        test('[CHAT] Unread counts', unread.ok);

        // Search
        const search = await admin('GET', '/chat/search?q=QA');
        test('[CHAT] Search', search.ok);
      }

      // DM
      const dm = await admin('POST', '/chat/conversations', {
        type: 'direct', participantIds: [managerId],
      });
      test('[CHAT] Create DM', dm.ok, `id: ${dm.data?.id}`);
    })(),

    // ============ 5. ENTITY CRUD ============
    (async () => {
      console.log('\n📋 [ENTITY] CRUD + Kanban');

      let entityWs = null;
      let entities = [];

      for (const ws of workspaces.slice(0, 5)) {
        const list = await admin('GET', `/entities?workspaceId=${ws.id}&limit=5`);
        const items = list.data?.items || (Array.isArray(list.data) ? list.data : []);
        if (items.length > 0) {
          entityWs = ws;
          entities = items;
          break;
        }
      }

      test('[ENTITY] Workspace with entities', !!entityWs, entityWs?.name);
      if (!entityWs) return;

      // List
      const list = await admin('GET', `/entities?workspaceId=${entityWs.id}&limit=20`);
      test('[ENTITY] List', list.ok, `total: ${list.data?.total}`);

      // Detail
      if (entities[0]) {
        const detail = await admin('GET', `/entities/${entities[0].id}`);
        test('[ENTITY] Detail', detail.ok, `title: ${detail.data?.title?.substring(0, 40)}`);
      }

      // Create
      const newE = await admin('POST', '/entities', {
        workspaceId: entityWs.id,
        title: 'QA Test Entity — ' + Date.now(),
        data: { description: 'QA auto test' },
      });
      test('[ENTITY] Create', newE.ok, `id: ${newE.data?.id}`);

      if (newE.data?.id) {
        // Update
        test('[ENTITY] Update', (await admin('PUT', `/entities/${newE.data.id}`, {
          title: 'QA Updated', data: { description: 'updated' },
        })).ok);

        // Status change
        test('[ENTITY] Status change', (await admin('PATCH', `/entities/${newE.data.id}/status`, {
          status: 'in_progress',
        })).ok);

        // Delete
        test('[ENTITY] Delete', (await admin('DELETE', `/entities/${newE.data.id}`)).ok);
      }

      // Kanban
      const kanban = await admin('GET', `/entities/kanban?workspaceId=${entityWs.id}`);
      test('[ENTITY] Kanban', kanban.ok);

      // Search
      const search = await admin('GET', `/entities/search?workspaceId=${entityWs.id}&q=test`);
      test('[ENTITY] Search', search.ok);
    })(),

    // ============ 6. KNOWLEDGE BASE ============
    (async () => {
      console.log('\n📋 [KB] Knowledge Base');

      const arts = await admin('GET', '/knowledge-base/articles');
      test('[KB] Articles list', arts.ok, `count: ${arts.data?.items?.length || arts.data?.length}`);

      test('[KB] Categories', (await admin('GET', '/knowledge-base/categories')).ok);

      // Create
      const newArt = await admin('POST', '/knowledge-base/articles', {
        title: 'QA Article — ' + Date.now(),
        content: 'Тестовая статья для QA аудита.',
        category: 'general',
      });
      test('[KB] Create article', newArt.ok, `id: ${newArt.data?.id}`);

      if (newArt.data?.id) {
        test('[KB] Article detail', (await admin('GET', `/knowledge-base/articles/${newArt.data.id}`)).ok);

        // Update via PUT
        const upd = await admin('PUT', `/knowledge-base/articles/${newArt.data.id}`, {
          title: 'QA Updated Article',
          content: 'Обновлённая тестовая статья.',
        });
        test('[KB] Update (PUT)', upd.ok);

        test('[KB] Delete', (await admin('DELETE', `/knowledge-base/articles/${newArt.data.id}`)).ok);
      }

      // Stats
      test('[KB] Stats', (await admin('GET', '/knowledge-base/stats')).ok);

      // AI Search (via AI module)
      const aiSearch = await admin('POST', '/ai/search', { query: 'станок' });
      test('[KB] AI Search', aiSearch.ok || aiSearch.status === 503, `status: ${aiSearch.status}`);
    })(),

    // ============ 7. SLA ============
    (async () => {
      console.log('\n📋 [SLA] Definitions & Dashboard');

      let slaCount = 0;
      for (const ws of workspaces.slice(0, 8)) {
        const sla = await admin('GET', `/sla/definitions?workspaceId=${ws.id}`);
        const list = Array.isArray(sla.data) ? sla.data : [];
        if (list.length > 0) {
          slaCount += list.length;
          test(`[SLA] Defs "${ws.name}"`, true, `${list.length}`);
          test(`[SLA] Dashboard "${ws.name}"`, (await admin('GET', `/sla/dashboard?workspaceId=${ws.id}`)).ok);
          test('[SLA] Def detail', (await admin('GET', `/sla/definitions/${list[0].id}`)).ok);
        }
      }
      test('[SLA] Total definitions', slaCount > 0, `${slaCount}`);
    })(),
  ]);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // ============ SUMMARY ============
  console.log('\n' + '='.repeat(70));
  console.log('FULL QA AUDIT v2 — RESULTS');
  console.log('='.repeat(70));
  console.log(`Total: ${results.total} | ✅ ${results.passed} | ❌ ${results.failed} | Time: ${elapsed}s`);

  if (results.bugs.length > 0) {
    console.log('\n🐛 BUGS:');
    results.bugs.forEach(b => console.log('  • ' + b));
  }
  if (results.errors.length > 0) {
    console.log('\n❌ FAILED:');
    results.errors.forEach(e => console.log('  • ' + e));
  }

  const mods = ['BPMN', 'RBAC', 'DMN', 'CHAT', 'ENTITY', 'KB', 'SLA'];
  console.log('\n📊 Modules:');
  settled.forEach((s, i) => {
    console.log(`  ${mods[i]}: ${s.status === 'fulfilled' ? '✅' : '💥 ' + s.reason?.message}`);
  });

  console.log('='.repeat(70));
  console.log('\n__REPORT__' + JSON.stringify({ total: results.total, passed: results.passed, failed: results.failed, bugs: results.bugs, errors: results.errors, elapsed }));
}

run().catch(err => { console.error('FATAL:', err); process.exit(1); });
