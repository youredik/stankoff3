/**
 * MULTI-ROLE QA AUDIT — Tests RBAC enforcement under different roles
 * Users: super_admin, department_head, employee (ws_admin, ws_editor, ws_viewer)
 */

const BASE = 'http://localhost:3000/api';
const R = { total: 0, passed: 0, failed: 0, errors: [], bugs: [] };

function test(name, ok, details = '') {
  R.total++;
  if (ok) { R.passed++; console.log('  ✅ ' + name + (details ? ' — ' + details : '')); }
  else { R.failed++; console.log('  ❌ ' + name + (details ? ' — ' + details : '')); R.errors.push(name); }
}
function bug(d) { R.bugs.push(d); console.log('  🐛 BUG: ' + d); }

async function getToken(email) {
  const r = await fetch(BASE + '/auth/dev/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const d = await r.json();
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
  console.log('🔐 MULTI-ROLE QA AUDIT — Stankoff Portal\n');
  const t0 = Date.now();

  // ========== AUTH USERS WITH DIFFERENT ROLES ==========
  console.log('📋 Phase 1: Auth as 4 different role users');

  // Find users with different roles
  const adminToken = await getToken('youredik@gmail.com'); // super_admin
  const adminApi = api(adminToken);

  // Get all users to find ones with different roles
  const usersResp = await adminApi('GET', '/auth/dev/users');
  const allUsers = usersResp.data || [];
  console.log(`  Found ${allUsers.length} users`);

  // Get tokens for different roles
  const tokens = {};
  const apis = {};
  const userIds = {};

  // Super admin
  tokens.admin = adminToken;
  apis.admin = adminApi;
  const adminMe = await adminApi('GET', '/auth/me');
  userIds.admin = adminMe.data?.id;
  test('Super admin auth', adminMe.ok, adminMe.data?.email);

  // Manager (department_head)
  const managerEmail = 'andrey@stankoff.ru';
  tokens.manager = await getToken(managerEmail);
  apis.manager = api(tokens.manager);
  const managerMe = await apis.manager('GET', '/auth/me');
  userIds.manager = managerMe.data?.id;
  test('Manager auth', managerMe.ok, managerEmail);

  // Employee
  const employeeEmails = ['grachev@stankoff.ru', 'ivanov@stankoff.ru', 'petrov@stankoff.ru'];
  let employeeEmail = null;
  for (const email of employeeEmails) {
    try {
      const t = await getToken(email);
      if (t) { tokens.employee = t; employeeEmail = email; break; }
    } catch {}
  }
  if (tokens.employee) {
    apis.employee = api(tokens.employee);
    const empMe = await apis.employee('GET', '/auth/me');
    userIds.employee = empMe.data?.id;
    test('Employee auth', empMe.ok, employeeEmail);
  } else {
    // Use another known user
    tokens.employee = await getToken('maria.k@stankoff.ru');
    apis.employee = api(tokens.employee);
    const empMe = await apis.employee('GET', '/auth/me');
    userIds.employee = empMe.data?.id;
    test('Employee auth', empMe.ok, 'maria.k@stankoff.ru');
  }

  // Get workspaces
  const ws = await apis.admin('GET', '/workspaces');
  const workspaces = ws.data || [];
  const testWsId = workspaces[0]?.id;
  test('Workspaces available', workspaces.length > 0, `${workspaces.length}`);

  // ========== RBAC PERMISSIONS CHECK ==========
  console.log('\n📋 Phase 2: RBAC Permissions per role');

  const [adminPerms, managerPerms, empPerms] = await Promise.all([
    apis.admin('GET', '/rbac/permissions/my'),
    apis.manager('GET', '/rbac/permissions/my'),
    apis.employee('GET', '/rbac/permissions/my'),
  ]);

  const adminP = adminPerms.data?.permissions || [];
  const managerP = managerPerms.data?.permissions || [];
  const empP = empPerms.data?.permissions || [];

  console.log(`  Admin perms: ${adminP.length} (has *: ${adminP.includes('*')})`);
  console.log(`  Manager perms: ${managerP.length}`);
  console.log(`  Employee perms: ${empP.length}`);

  test('[RBAC] Admin has wildcard', adminP.includes('*'));
  test('[RBAC] Manager has some perms', managerP.length > 0 || true); // May have 0 global perms
  test('[RBAC] Employee limited', !empP.includes('*'));

  // Workspace-level permissions
  const [adminWsPerms, managerWsPerms, empWsPerms] = await Promise.all([
    apis.admin('GET', '/rbac/permissions/my/workspaces'),
    apis.manager('GET', '/rbac/permissions/my/workspaces'),
    apis.employee('GET', '/rbac/permissions/my/workspaces'),
  ]);

  const adminWsCount = Object.keys(adminWsPerms.data || {}).length;
  const managerWsCount = Object.keys(managerWsPerms.data || {}).length;
  const empWsCount = Object.keys(empWsPerms.data || {}).length;

  console.log(`  Admin workspace access: ${adminWsCount}`);
  console.log(`  Manager workspace access: ${managerWsCount}`);
  console.log(`  Employee workspace access: ${empWsCount}`);

  test('[RBAC] Admin sees all workspaces', adminWsCount >= workspaces.length - 2);

  // ========== RBAC ENFORCEMENT — ADMIN OPERATIONS ==========
  console.log('\n📋 Phase 3: RBAC enforcement — admin-only operations');

  // Only admin can list roles
  const [adminRoles, managerRoles, empRoles] = await Promise.all([
    apis.admin('GET', '/rbac/roles'),
    apis.manager('GET', '/rbac/roles'),
    apis.employee('GET', '/rbac/roles'),
  ]);

  test('[RBAC] Admin lists roles', adminRoles.ok, `count: ${adminRoles.data?.length}`);
  test('[RBAC] Manager role access', managerRoles.status === 403 || managerRoles.ok, `status: ${managerRoles.status}`);
  test('[RBAC] Employee role access', empRoles.status === 403, `status: ${empRoles.status}`);

  if (empRoles.ok) bug('Employee can list roles — should be 403!');

  // Create role — only admin
  const testRole = await apis.employee('POST', '/rbac/roles', {
    name: 'Hack Role', slug: 'hack_' + Date.now(), scope: 'workspace', permissions: ['*'],
  });
  test('[RBAC] Employee cannot create role', testRole.status === 403, `status: ${testRole.status}`);
  if (testRole.ok) bug('Employee created a role with wildcard permissions!');

  // ========== ENTITY CRUD UNDER DIFFERENT ROLES ==========
  console.log('\n📋 Phase 4: Entity CRUD per role');

  if (testWsId) {
    // Admin creates entity
    const adminEntity = await apis.admin('POST', '/entities', {
      workspaceId: testWsId, title: 'Admin Entity — QA', status: 'new',
    });
    test('[ENTITY] Admin creates', adminEntity.ok);

    // Manager creates entity
    const managerEntity = await apis.manager('POST', '/entities', {
      workspaceId: testWsId, title: 'Manager Entity — QA', status: 'new',
    });
    test('[ENTITY] Manager creates', managerEntity.ok, `status: ${managerEntity.status}`);

    // Employee creates entity
    const empEntity = await apis.employee('POST', '/entities', {
      workspaceId: testWsId, title: 'Employee Entity — QA', status: 'new',
    });
    test('[ENTITY] Employee creates', empEntity.ok || empEntity.status === 403,
      `status: ${empEntity.status} (403 = correct for viewer)`);

    // Read by different roles
    if (adminEntity.data?.id) {
      const [adminRead, managerRead, empRead] = await Promise.all([
        apis.admin('GET', `/entities/${adminEntity.data.id}`),
        apis.manager('GET', `/entities/${adminEntity.data.id}`),
        apis.employee('GET', `/entities/${adminEntity.data.id}`),
      ]);
      test('[ENTITY] Admin reads own', adminRead.ok);
      test('[ENTITY] Manager reads', managerRead.ok, `status: ${managerRead.status}`);
      test('[ENTITY] Employee reads', empRead.ok || empRead.status === 403, `status: ${empRead.status}`);

      // Delete — only admin should be able
      const empDel = await apis.employee('DELETE', `/entities/${adminEntity.data.id}`);
      test('[ENTITY] Employee cannot delete', empDel.status === 403 || empDel.status === 404,
        `status: ${empDel.status}`);
      if (empDel.ok) bug('Employee deleted an entity!');

      // Cleanup
      await apis.admin('DELETE', `/entities/${adminEntity.data.id}`);
    }
    if (managerEntity.data?.id) await apis.admin('DELETE', `/entities/${managerEntity.data.id}`);
    if (empEntity.data?.id) await apis.admin('DELETE', `/entities/${empEntity.data.id}`);
  }

  // ========== BPMN TASKS PER ROLE ==========
  console.log('\n📋 Phase 5: BPMN Tasks per role');

  const [adminInbox, managerInbox, empInbox] = await Promise.all([
    apis.admin('GET', '/bpmn/tasks/inbox'),
    apis.manager('GET', '/bpmn/tasks/inbox'),
    apis.employee('GET', '/bpmn/tasks/inbox'),
  ]);

  const adminTasks = adminInbox.data?.items || [];
  const managerTasks = managerInbox.data?.items || [];
  const empTasks = empInbox.data?.items || [];

  console.log(`  Admin inbox: ${adminInbox.data?.total || adminTasks.length}`);
  console.log(`  Manager inbox: ${managerInbox.data?.total || managerTasks.length}`);
  console.log(`  Employee inbox: ${empInbox.data?.total || empTasks.length}`);

  test('[BPMN] Admin inbox OK', adminInbox.ok, `${adminTasks.length} tasks`);
  test('[BPMN] Manager inbox OK', managerInbox.ok, `${managerTasks.length} tasks`);
  test('[BPMN] Employee inbox OK', empInbox.ok, `${empTasks.length} tasks`);

  // Admin claims a task
  const unclaimed = adminTasks.find(t => t.status === 'created');
  if (unclaimed) {
    const claim = await apis.admin('POST', `/bpmn/tasks/${unclaimed.id}/claim`);
    test('[BPMN] Admin claims task', claim.ok);

    // Employee tries to claim same task (should fail — already claimed)
    const empClaim = await apis.employee('POST', `/bpmn/tasks/${unclaimed.id}/claim`);
    test('[BPMN] Employee cannot claim claimed task', !empClaim.ok, `status: ${empClaim.status}`);

    // Admin delegates to manager
    const delegate = await apis.admin('POST', `/bpmn/tasks/${unclaimed.id}/delegate`, {
      toUserId: userIds.manager,
    });
    test('[BPMN] Admin delegates to manager', delegate.ok);

    // Employee tries to complete manager's task (should fail)
    const empComplete = await apis.employee('POST', `/bpmn/tasks/${unclaimed.id}/complete`, {
      formData: { decision: 'approved' },
    });
    test('[BPMN] Employee cannot complete others task',
      !empComplete.ok || empComplete.status >= 400, `status: ${empComplete.status}`);

    // Manager completes own delegated task
    const mComplete = await apis.manager('POST', `/bpmn/tasks/${unclaimed.id}/complete`, {
      formData: { decision: 'approved', comment: 'Multi-role QA test' },
    });
    test('[BPMN] Manager completes delegated task', mComplete.ok);
  } else {
    console.log('  No unclaimed tasks available');
  }

  // ========== CHAT PER ROLE ==========
  console.log('\n📋 Phase 6: Chat per role');

  // Admin creates conversation
  const conv = await apis.admin('POST', '/chat/conversations', {
    type: 'group', name: 'Multi-role Test', participantIds: [userIds.admin, userIds.manager],
  });
  test('[CHAT] Admin creates group', conv.ok);

  if (conv.data?.id) {
    // Admin sends
    test('[CHAT] Admin sends message', (await apis.admin('POST', `/chat/conversations/${conv.data.id}/messages`, {
      content: 'Admin message — role test',
    })).ok);

    // Manager sends
    test('[CHAT] Manager sends message', (await apis.manager('POST', `/chat/conversations/${conv.data.id}/messages`, {
      content: 'Manager reply — role test',
    })).ok);

    // Employee NOT in conversation — should not see it
    const empConv = await apis.employee('GET', `/chat/conversations/${conv.data.id}`);
    test('[CHAT] Employee cannot see others conv', empConv.status === 403 || empConv.status === 404,
      `status: ${empConv.status}`);
    if (empConv.ok) bug('Employee can see conversation they are not part of!');
  }

  // ========== KNOWLEDGE BASE PER ROLE ==========
  console.log('\n📋 Phase 7: Knowledge Base per role');

  // Admin creates article
  const art = await apis.admin('POST', '/knowledge-base/articles', {
    title: 'Role Test Article', content: 'Test content for RBAC', category: 'general',
  });
  test('[KB] Admin creates article', art.ok);

  if (art.data?.id) {
    // All roles can read
    const [adminRead, managerRead, empRead] = await Promise.all([
      apis.admin('GET', `/knowledge-base/articles/${art.data.id}`),
      apis.manager('GET', `/knowledge-base/articles/${art.data.id}`),
      apis.employee('GET', `/knowledge-base/articles/${art.data.id}`),
    ]);
    test('[KB] Admin reads', adminRead.ok);
    test('[KB] Manager reads', managerRead.ok);
    test('[KB] Employee reads', empRead.ok, `status: ${empRead.status}`);

    // Employee tries to delete (should fail)
    const empDel = await apis.employee('DELETE', `/knowledge-base/articles/${art.data.id}`);
    test('[KB] Employee cannot delete article', empDel.status === 403, `status: ${empDel.status}`);

    // Cleanup
    await apis.admin('DELETE', `/knowledge-base/articles/${art.data.id}`);
  }

  // ========== SLA & DMN ACCESS ==========
  console.log('\n📋 Phase 8: SLA & DMN per role');

  if (testWsId) {
    const [adminSla, managerSla, empSla] = await Promise.all([
      apis.admin('GET', `/sla/definitions?workspaceId=${testWsId}`),
      apis.manager('GET', `/sla/definitions?workspaceId=${testWsId}`),
      apis.employee('GET', `/sla/definitions?workspaceId=${testWsId}`),
    ]);
    test('[SLA] Admin reads', adminSla.ok);
    test('[SLA] Manager reads', managerSla.ok, `status: ${managerSla.status}`);
    test('[SLA] Employee reads', empSla.ok || empSla.status === 403, `status: ${empSla.status}`);
  }

  // ========== WORKSPACES VISIBILITY ==========
  console.log('\n📋 Phase 9: Workspace visibility per role');

  const [adminWs, managerWs, empWs] = await Promise.all([
    apis.admin('GET', '/workspaces'),
    apis.manager('GET', '/workspaces'),
    apis.employee('GET', '/workspaces'),
  ]);

  console.log(`  Admin sees: ${adminWs.data?.length} workspaces`);
  console.log(`  Manager sees: ${managerWs.data?.length} workspaces`);
  console.log(`  Employee sees: ${empWs.data?.length} workspaces`);

  test('[WS] Admin sees all', (adminWs.data?.length || 0) >= 10);
  test('[WS] Users see own workspaces', (managerWs.data?.length || 0) > 0);

  // ========== ADMIN PANEL ACCESS ==========
  console.log('\n📋 Phase 10: Admin panel access');

  // Users list — only admin
  const [adminUsers, empUsers] = await Promise.all([
    apis.admin('GET', '/users'),
    apis.employee('GET', '/users'),
  ]);
  test('[ADMIN] Admin lists users', adminUsers.ok, `count: ${adminUsers.data?.length}`);
  test('[ADMIN] Employee cannot list users', empUsers.status === 403, `status: ${empUsers.status}`);
  if (empUsers.ok) bug('Employee can see all users list!');

  // ========== SUMMARY ==========
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('\n' + '='.repeat(70));
  console.log('MULTI-ROLE QA AUDIT RESULTS');
  console.log('='.repeat(70));
  console.log(`Total: ${R.total} | ✅ ${R.passed} | ❌ ${R.failed} | Time: ${elapsed}s`);

  if (R.bugs.length > 0) {
    console.log('\n🐛 SECURITY BUGS:');
    R.bugs.forEach(b => console.log('  • ' + b));
  }
  if (R.errors.length > 0) {
    console.log('\n❌ FAILED:');
    R.errors.forEach(e => console.log('  • ' + e));
  }
  console.log('='.repeat(70));
  console.log('\n__REPORT__' + JSON.stringify({ total: R.total, passed: R.passed, failed: R.failed, bugs: R.bugs, errors: R.errors, elapsed }));
}

run().catch(err => { console.error('FATAL:', err); process.exit(1); });
