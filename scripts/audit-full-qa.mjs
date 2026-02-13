/**
 * FULL QA AUDIT — All modules in parallel
 * Tests: BPMN lifecycle, RBAC, DMN, Chat, Entity CRUD, Knowledge Base, SLA
 */

const BASE = 'http://localhost:3000/api';
const results = { total: 0, passed: 0, failed: 0, errors: [], bugs: [] };

function test(name, ok, details = '') {
  results.total++;
  if (ok) { results.passed++; console.log('  ✅ ' + name); }
  else { results.failed++; console.log('  ❌ ' + name + (details ? ' — ' + details : '')); results.errors.push(name); }
}

function bug(desc) { results.bugs.push(desc); console.log('  🐛 BUG: ' + desc); }

async function getToken(email) {
  const r = await fetch(BASE + '/auth/dev/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return (await r.json()).accessToken;
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
  console.log('🚀 FULL QA AUDIT — Stankoff Portal\n');
  const t0 = Date.now();

  // Auth as 3 users
  const adminToken = await getToken('youredik@gmail.com');
  const managerToken = await getToken('andrey@stankoff.ru');
  const employeeToken = await getToken('maria.k@stankoff.ru');

  const admin = api(adminToken);
  const manager = api(managerToken);
  const employee = api(employeeToken);

  const adminMe = await admin('GET', '/auth/me');
  const managerMe = await manager('GET', '/auth/me');
  test('Admin auth', adminMe.ok, adminMe.data?.email);
  test('Manager auth', managerMe.ok, managerMe.data?.email);

  const adminId = adminMe.data?.id;
  const managerId = managerMe.data?.id;

  // Get workspaces
  const wsResp = await admin('GET', '/workspaces');
  const workspaces = wsResp.data || [];

  // ============ RUN ALL TESTS IN PARALLEL ============
  const [bpmnResult, rbacResult, dmnResult, chatResult, entityResult, kbResult, slaResult] = await Promise.allSettled([
    // 1. BPMN LIFECYCLE
    (async () => {
      console.log('\n📋 [BPMN] Full Lifecycle Test');

      // Health
      const health = await admin('GET', '/bpmn/health');
      test('[BPMN] Zeebe connected', health.data?.connected === true);

      // Templates
      const templates = await admin('GET', '/bpmn/templates');
      test('[BPMN] Templates', templates.ok, `count: ${templates.data?.length}`);

      // Inbox
      const inbox = await admin('GET', '/bpmn/tasks/inbox');
      const items = inbox.data?.items || [];
      test('[BPMN] Inbox has tasks', items.length > 0, `count: ${items.length}`);
      if (items.length === 0) bug('Inbox empty after fixes — check user groups');

      // Task lifecycle on first task
      if (items.length > 0) {
        const task = items.find(t => t.status === 'created');
        if (task) {
          console.log(`  Testing task: ${task.elementName || task.elementId}`);

          // Detail
          const detail = await admin('GET', `/bpmn/tasks/${task.id}`);
          test('[BPMN] Task detail', detail.ok, `element: ${detail.data?.elementName}`);

          // Comments
          const comments = await admin('GET', `/bpmn/tasks/${task.id}/comments`);
          test('[BPMN] Task comments list', comments.ok);

          // Add comment
          const addComment = await admin('POST', `/bpmn/tasks/${task.id}/comments`, {
            content: '[QA] Full audit test comment — ' + new Date().toISOString(),
          });
          test('[BPMN] Add comment', addComment.ok);

          // Claim
          const claim = await admin('POST', `/bpmn/tasks/${task.id}/claim`);
          test('[BPMN] Claim task', claim.ok);

          // Verify claimed
          const afterClaim = await admin('GET', `/bpmn/tasks/${task.id}`);
          test('[BPMN] Task claimed correctly', afterClaim.data?.status === 'claimed' && afterClaim.data?.assigneeId === adminId);

          // Delegate to manager
          const delegate = await admin('POST', `/bpmn/tasks/${task.id}/delegate`, { toUserId: managerId });
          test('[BPMN] Delegate to manager', delegate.ok);

          // Manager sees task
          const managerInbox = await manager('GET', '/bpmn/tasks/inbox');
          const managerItems = managerInbox.data?.items || [];
          const delegatedTask = managerItems.find(t => t.id === task.id);
          test('[BPMN] Manager sees delegated task', !!delegatedTask);

          // Manager completes
          const complete = await manager('POST', `/bpmn/tasks/${task.id}/complete`, {
            formData: { decision: 'approved', comment: 'QA test — completed by delegate' },
          });
          test('[BPMN] Manager completes task', complete.ok);

          // Verify completed
          const afterComplete = await admin('GET', `/bpmn/tasks/${task.id}`);
          test('[BPMN] Task completed', afterComplete.data?.status === 'completed');
        }
      }

      // Statistics
      const stats = await admin('GET', `/bpmn/tasks/statistics?workspaceId=${workspaces[0]?.id}`);
      test('[BPMN] Task statistics', stats.ok);

      // Process instances
      for (const ws of workspaces.slice(0, 3)) {
        const inst = await admin('GET', `/bpmn/instances/workspace/${ws.id}`);
        if (inst.ok) {
          const data = inst.data?.data || inst.data || [];
          if (Array.isArray(data) && data.length > 0) {
            test(`[BPMN] Instances in "${ws.name}"`, true, `count: ${data.length}`);
            // Timeline of first instance
            const timeline = await admin('GET', `/bpmn/instances/${data[0].id}/timeline`);
            test(`[BPMN] Instance timeline`, timeline.ok);
            break;
          }
        }
      }
    })(),

    // 2. RBAC
    (async () => {
      console.log('\n📋 [RBAC] Role-Based Access Control Test');

      // Roles list
      const roles = await admin('GET', '/rbac/roles');
      test('[RBAC] Roles list', roles.ok && Array.isArray(roles.data), `count: ${roles.data?.length}`);

      const roleList = roles.data || [];
      const globalRoles = roleList.filter(r => r.scope === 'global');
      const wsRoles = roleList.filter(r => r.scope === 'workspace');
      const sectionRoles = roleList.filter(r => r.scope === 'section');
      test('[RBAC] Global roles', globalRoles.length >= 3, `count: ${globalRoles.length}`);
      test('[RBAC] Workspace roles', wsRoles.length >= 3, `count: ${wsRoles.length}`);
      test('[RBAC] Section roles', sectionRoles.length >= 2, `count: ${sectionRoles.length}`);

      // Role detail
      if (roleList.length > 0) {
        const role = await admin('GET', `/rbac/roles/${roleList[0].id}`);
        test('[RBAC] Role detail', role.ok && !!role.data?.slug, `slug: ${role.data?.slug}`);
      }

      // Permission registry
      const perms = await admin('GET', '/rbac/permissions');
      test('[RBAC] Permission registry', perms.ok && Array.isArray(perms.data), `count: ${perms.data?.length}`);

      const categories = await admin('GET', '/rbac/permissions/categories');
      test('[RBAC] Permission categories', categories.ok);

      // My permissions
      const myPerms = await admin('GET', '/rbac/permissions/my');
      test('[RBAC] Admin permissions (should have *)', myPerms.ok, `permissions: ${myPerms.data?.permissions?.length || '?'}`);

      const hasSuperAdmin = myPerms.data?.permissions?.includes('*');
      test('[RBAC] Admin has wildcard (*)', hasSuperAdmin);

      // My workspace permissions
      const wsPerms = await admin('GET', '/rbac/permissions/my/workspaces');
      test('[RBAC] Workspace permissions map', wsPerms.ok);

      // Manager permissions (should NOT have *)
      const managerPerms = await manager('GET', '/rbac/permissions/my');
      test('[RBAC] Manager permissions', managerPerms.ok);
      const managerHasWildcard = managerPerms.data?.permissions?.includes('*');
      test('[RBAC] Manager does NOT have wildcard', !managerHasWildcard);

      // Create custom role
      const customRole = await admin('POST', '/rbac/roles', {
        name: 'QA Test Role',
        slug: 'qa_test_role_' + Date.now(),
        scope: 'workspace',
        permissions: ['workspace:entity:read', 'workspace:comment:read'],
        description: 'Temporary role for QA testing',
      });
      test('[RBAC] Create custom role', customRole.ok, `id: ${customRole.data?.id}`);

      if (customRole.ok && customRole.data?.id) {
        // Update role
        const updated = await admin('PUT', `/rbac/roles/${customRole.data.id}`, {
          permissions: ['workspace:entity:read', 'workspace:entity:create', 'workspace:comment:read'],
        });
        test('[RBAC] Update role permissions', updated.ok);

        // Delete role
        const deleted = await admin('DELETE', `/rbac/roles/${customRole.data.id}`);
        test('[RBAC] Delete custom role', deleted.ok);
      }

      // Try deleting system role (should fail)
      if (roleList.length > 0) {
        const sysRole = roleList.find(r => r.isSystem);
        if (sysRole) {
          const delSys = await admin('DELETE', `/rbac/roles/${sysRole.id}`);
          test('[RBAC] Cannot delete system role', !delSys.ok || delSys.status >= 400, `status: ${delSys.status}`);
        }
      }

      // Employee permissions (minimal)
      if (employeeToken) {
        const empPerms = await employee('GET', '/rbac/permissions/my');
        test('[RBAC] Employee permissions (minimal)', empPerms.ok);

        // Employee should NOT be able to manage roles
        const empRoles = await employee('GET', '/rbac/roles');
        test('[RBAC] Employee cannot list roles', empRoles.status === 403, `status: ${empRoles.status}`);
      }
    })(),

    // 3. DMN EVALUATE
    (async () => {
      console.log('\n📋 [DMN] Decision Tables Test');

      let dmnTableId = null;
      let dmnWsId = null;

      for (const ws of workspaces) {
        const tables = await admin('GET', `/dmn/tables?workspaceId=${ws.id}`);
        const tList = Array.isArray(tables.data) ? tables.data : [];
        if (tList.length > 0) {
          dmnTableId = tList[0].id;
          dmnWsId = ws.id;
          test('[DMN] Found tables', true, `${tList.length} in "${ws.name}"`);
          break;
        }
      }

      if (dmnTableId) {
        // Detail
        const detail = await admin('GET', `/dmn/tables/${dmnTableId}`);
        test('[DMN] Table detail', detail.ok, `name: ${detail.data?.name}, rules: ${detail.data?.rules?.length}`);

        // Evaluate
        if (detail.data?.inputColumns?.length > 0 && detail.data?.rules?.length > 0) {
          const inputData = {};
          for (const col of detail.data.inputColumns) {
            const firstRule = detail.data.rules[0];
            const val = firstRule.inputs?.[col.id];
            if (col.dataType === 'number') inputData[col.id] = typeof val === 'number' ? val : 100;
            else if (col.dataType === 'boolean') inputData[col.id] = true;
            else inputData[col.id] = val || 'medium';
          }

          console.log('  Input data:', JSON.stringify(inputData));
          const evalResp = await admin('POST', '/dmn/evaluate', {
            decisionTableId: dmnTableId,
            inputData,
          });
          test('[DMN] Evaluate', evalResp.ok, evalResp.ok ?
            `matched: ${evalResp.data?.matchedRules?.length}, output: ${JSON.stringify(evalResp.data?.finalOutput || evalResp.data?.output || {}).substring(0, 80)}` :
            `error: ${JSON.stringify(evalResp.data).substring(0, 100)}`);

          if (!evalResp.ok) bug('DMN evaluate still failing: ' + JSON.stringify(evalResp.data).substring(0, 200));
        }

        // Stats
        const stats = await admin('GET', `/dmn/tables/${dmnTableId}/statistics`);
        test('[DMN] Statistics', stats.ok);
      } else {
        console.log('  No DMN tables found');
      }
    })(),

    // 4. CHAT
    (async () => {
      console.log('\n📋 [CHAT] Conversations & Messages Test');

      // List conversations
      const convs = await admin('GET', '/chat/conversations');
      test('[CHAT] Conversations list', convs.ok, `count: ${Array.isArray(convs.data) ? convs.data.length : convs.data?.items?.length || '?'}`);

      // Create conversation
      const newConv = await admin('POST', '/chat/conversations', {
        name: 'QA Test Chat — ' + new Date().toISOString(),
        type: 'group',
        memberIds: [adminId, managerId],
      });
      test('[CHAT] Create conversation', newConv.ok, `id: ${newConv.data?.id}`);

      if (newConv.ok && newConv.data?.id) {
        const convId = newConv.data.id;

        // Send message
        const msg = await admin('POST', `/chat/conversations/${convId}/messages`, {
          content: 'Привет! Это автоматический QA тест чата.',
        });
        test('[CHAT] Send message', msg.ok);

        // Get messages
        const msgs = await admin('GET', `/chat/conversations/${convId}/messages`);
        const msgList = Array.isArray(msgs.data) ? msgs.data : (msgs.data?.items || []);
        test('[CHAT] Get messages', msgs.ok && msgList.length > 0, `count: ${msgList.length}`);

        // Manager reads conversation
        const managerMsgs = await manager('GET', `/chat/conversations/${convId}/messages`);
        test('[CHAT] Manager sees messages', managerMsgs.ok);

        // Manager sends reply
        const reply = await manager('POST', `/chat/conversations/${convId}/messages`, {
          content: 'Ответ от менеджера — QA тест.',
        });
        test('[CHAT] Manager reply', reply.ok);

        // Mark read
        const markRead = await admin('POST', `/chat/conversations/${convId}/read`);
        test('[CHAT] Mark as read', markRead.ok || markRead.status === 404);

        // Conversation detail
        const detail = await admin('GET', `/chat/conversations/${convId}`);
        test('[CHAT] Conversation detail', detail.ok);
      }

      // Direct message
      const dm = await admin('POST', '/chat/conversations', {
        type: 'direct',
        memberIds: [managerId],
      });
      test('[CHAT] Create DM', dm.ok, `id: ${dm.data?.id}`);
    })(),

    // 5. ENTITY CRUD
    (async () => {
      console.log('\n📋 [ENTITY] CRUD + Kanban Test');

      // Find workspace with entities
      let entityWs = null;
      let entityList = [];
      for (const ws of workspaces.slice(0, 5)) {
        const entities = await admin('GET', `/entity?workspaceId=${ws.id}&limit=5`);
        const eList = entities.data?.items || entities.data?.data || (Array.isArray(entities.data) ? entities.data : []);
        if (eList.length > 0) {
          entityWs = ws;
          entityList = eList;
          break;
        }
      }

      test('[ENTITY] Found workspace with entities', !!entityWs, entityWs?.name);

      if (entityWs) {
        // List entities
        const list = await admin('GET', `/entity?workspaceId=${entityWs.id}&limit=20`);
        test('[ENTITY] List entities', list.ok, `total: ${list.data?.total || list.data?.length}`);

        // Entity detail
        if (entityList.length > 0) {
          const detail = await admin('GET', `/entity/${entityList[0].id}`);
          test('[ENTITY] Detail', detail.ok, `title: ${detail.data?.title?.substring(0, 40)}`);

          // Comments
          const comments = await admin('GET', `/entity/${entityList[0].id}/comments`);
          test('[ENTITY] Comments', comments.ok);

          // Add comment
          const addComment = await admin('POST', `/entity/${entityList[0].id}/comments`, {
            content: 'QA тест — автоматический комментарий к заявке',
          });
          test('[ENTITY] Add comment', addComment.ok);
        }

        // Create entity
        const newEntity = await admin('POST', '/entity', {
          workspaceId: entityWs.id,
          title: 'QA Test Entity — ' + new Date().toISOString(),
          data: { description: 'Created by automated QA test' },
        });
        test('[ENTITY] Create entity', newEntity.ok, `id: ${newEntity.data?.id}`);

        if (newEntity.ok && newEntity.data?.id) {
          // Update
          const updated = await admin('PATCH', `/entity/${newEntity.data.id}`, {
            title: 'QA Test Entity — Updated',
            data: { description: 'Updated by QA test', priority: 'high' },
          });
          test('[ENTITY] Update entity', updated.ok);

          // Kanban — change status
          const statusUpdate = await admin('PATCH', `/entity/${newEntity.data.id}`, {
            data: { status: 'in_progress' },
          });
          test('[ENTITY] Status update (kanban)', statusUpdate.ok);

          // Delete
          const deleted = await admin('DELETE', `/entity/${newEntity.data.id}`);
          test('[ENTITY] Delete entity', deleted.ok);
        }

        // Kanban board data
        const kanban = await admin('GET', `/entity/kanban?workspaceId=${entityWs.id}`);
        test('[ENTITY] Kanban board', kanban.ok);
      }
    })(),

    // 6. KNOWLEDGE BASE
    (async () => {
      console.log('\n📋 [KB] Knowledge Base Test');

      // Articles
      const articles = await admin('GET', '/knowledge-base/articles');
      const artList = articles.data?.items || (Array.isArray(articles.data) ? articles.data : []);
      test('[KB] Articles list', articles.ok, `count: ${artList.length}`);

      // Categories
      const cats = await admin('GET', '/knowledge-base/categories');
      test('[KB] Categories', cats.ok);

      // Create article
      const newArt = await admin('POST', '/knowledge-base/articles', {
        title: 'QA Test Article — ' + Date.now(),
        content: 'Тестовая статья для проверки базы знаний. Содержит текст для проверки поиска и RAG.',
        category: 'general',
      });
      test('[KB] Create article', newArt.ok, `id: ${newArt.data?.id}`);

      if (newArt.ok && newArt.data?.id) {
        // Read article
        const art = await admin('GET', `/knowledge-base/articles/${newArt.data.id}`);
        test('[KB] Article detail', art.ok, `title: ${art.data?.title?.substring(0, 40)}`);

        // Update
        const updated = await admin('PATCH', `/knowledge-base/articles/${newArt.data.id}`, {
          content: 'Обновлённая тестовая статья — QA audit.',
        });
        test('[KB] Update article', updated.ok);

        // Delete
        const deleted = await admin('DELETE', `/knowledge-base/articles/${newArt.data.id}`);
        test('[KB] Delete article', deleted.ok);
      }

      // Search
      const search = await admin('GET', '/knowledge-base/search?q=станок');
      test('[KB] Search', search.ok);

      // AI chat (if available)
      const aiChat = await admin('POST', '/knowledge-base/ask', {
        question: 'Какие типы станков есть?',
      });
      test('[KB] AI Ask (RAG)', aiChat.ok || aiChat.status === 503, `status: ${aiChat.status}`);
    })(),

    // 7. SLA
    (async () => {
      console.log('\n📋 [SLA] Definitions & Dashboard Test');

      let slaCount = 0;
      for (const ws of workspaces.slice(0, 8)) {
        const sla = await admin('GET', `/sla/definitions?workspaceId=${ws.id}`);
        const slaList = Array.isArray(sla.data) ? sla.data : [];
        if (slaList.length > 0) {
          slaCount += slaList.length;
          test(`[SLA] Definitions in "${ws.name}"`, true, `count: ${slaList.length}`);

          // Dashboard
          const dash = await admin('GET', `/sla/dashboard?workspaceId=${ws.id}`);
          test(`[SLA] Dashboard "${ws.name}"`, dash.ok);

          // Detail
          const detail = await admin('GET', `/sla/definitions/${slaList[0].id}`);
          test('[SLA] Definition detail', detail.ok, `name: ${detail.data?.name}`);
        }
      }
      test('[SLA] Total definitions found', slaCount > 0, `total: ${slaCount}`);
    })(),
  ]);

  // ============ SUMMARY ============
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(70));
  console.log('FULL QA AUDIT RESULTS');
  console.log('='.repeat(70));
  console.log(`Total: ${results.total} | Passed: ${results.passed} | Failed: ${results.failed} | Time: ${elapsed}s`);

  if (results.bugs.length > 0) {
    console.log('\n🐛 BUGS FOUND:');
    results.bugs.forEach(b => console.log('  • ' + b));
  }

  if (results.errors.length > 0) {
    console.log('\n❌ FAILED:');
    results.errors.forEach(e => console.log('  • ' + e));
  }

  // Module breakdown
  const modules = ['BPMN', 'RBAC', 'DMN', 'CHAT', 'ENTITY', 'KB', 'SLA'];
  console.log('\n📊 Module Breakdown:');
  for (const mod of modules) {
    const total = results.total; // approximate
    const settled = [bpmnResult, rbacResult, dmnResult, chatResult, entityResult, kbResult, slaResult];
    const idx = modules.indexOf(mod);
    const status = settled[idx]?.status === 'fulfilled' ? '✅' : '💥 CRASHED';
    if (settled[idx]?.status === 'rejected') {
      console.log(`  ${mod}: ${status} — ${settled[idx].reason?.message}`);
    } else {
      console.log(`  ${mod}: ${status}`);
    }
  }

  console.log('='.repeat(70));

  // Output as JSON for Telegram
  const report = {
    total: results.total,
    passed: results.passed,
    failed: results.failed,
    bugs: results.bugs,
    errors: results.errors,
    elapsed,
  };
  console.log('\n__REPORT_JSON__' + JSON.stringify(report));
}

run().catch(err => {
  console.error('FATAL:', err.message, err.stack);
  process.exit(1);
});
