/**
 * Multi-user BPMN test + DMN evaluation + full task lifecycle
 */

const BASE = 'http://localhost:3000/api';

async function getToken(email) {
  const resp = await fetch(BASE + '/auth/dev/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await resp.json();
  return data.accessToken;
}

function api(token) {
  return async (method, path, body) => {
    const opts = {
      method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(BASE + path, opts);
    return { status: resp.status, data: await resp.json().catch(() => null), ok: resp.status < 400 };
  };
}

const results = { total: 0, passed: 0, failed: 0, errors: [] };
function test(name, ok, details = '') {
  results.total++;
  if (ok) { results.passed++; console.log('✅ ' + name); }
  else { results.failed++; console.log('❌ ' + name + (details ? ' — ' + details : '')); results.errors.push(name); }
}

async function run() {
  console.log('🚀 Multi-User BPMN + DMN Test\n');

  // ===== AUTH AS 2 USERS =====
  console.log('📋 Phase 1: Multi-user Auth');
  const tokenAdmin = await getToken('youredik@gmail.com');
  const tokenUser = await getToken('andrey@stankoff.ru'); // Менеджер

  const adminApi = api(tokenAdmin);
  const userApi = api(tokenUser);

  const adminMe = await adminApi('GET', '/auth/me');
  const userMe = await userApi('GET', '/auth/me');
  test('Admin auth', adminMe.ok, adminMe.data?.email);
  test('User auth', userMe.ok, userMe.data?.email);

  const adminId = adminMe.data?.id;
  const userId = userMe.data?.id;

  // ===== FIND WORKSPACE WITH PROCESSES =====
  console.log('\n📋 Phase 2: Find workspaces with active processes');
  const workspaces = await adminApi('GET', '/workspaces');

  // Find workspaces with user tasks
  let taskWorkspace = null;
  let allTasks = [];

  for (const ws of workspaces.data || []) {
    const tasks = await adminApi('GET', `/bpmn/tasks?workspaceId=${ws.id}`);
    const taskList = Array.isArray(tasks.data) ? tasks.data : (tasks.data?.tasks || []);
    if (taskList.length > 0) {
      console.log(`  ${ws.name}: ${taskList.length} tasks`);
      if (!taskWorkspace) {
        taskWorkspace = ws;
        allTasks = taskList;
      }
    }
  }

  test('Found workspace with tasks', !!taskWorkspace, taskWorkspace?.name);

  // ===== USER TASKS LIFECYCLE =====
  if (taskWorkspace && allTasks.length > 0) {
    console.log('\n📋 Phase 3: User Task Lifecycle');
    console.log(`  Workspace: ${taskWorkspace.name}`);
    console.log(`  Tasks found: ${allTasks.length}`);

    // List tasks by status
    const byStatus = {};
    allTasks.forEach(t => { byStatus[t.status] = (byStatus[t.status] || 0) + 1; });
    console.log('  Status breakdown:', JSON.stringify(byStatus));

    // Find an unclaimed task
    let unclaimed = allTasks.find(t => t.status === 'created');

    if (unclaimed) {
      console.log(`\n  Testing task: ${unclaimed.elementName || unclaimed.id}`);

      // Admin claims it
      const claim = await adminApi('POST', `/bpmn/tasks/${unclaimed.id}/claim`);
      test('Admin claims task', claim.ok);

      // Verify claimed
      const afterClaim = await adminApi('GET', `/bpmn/tasks/${unclaimed.id}`);
      test('Task claimed by admin', afterClaim.data?.status === 'claimed' && afterClaim.data?.assigneeId === adminId);

      // Admin adds comment
      const comment = await adminApi('POST', `/bpmn/tasks/${unclaimed.id}/comments`, {
        content: '[QA] Задача взята в работу для тестирования lifecycle',
      });
      test('Admin adds comment', comment.ok);

      // Admin delegates to user
      const delegate = await adminApi('POST', `/bpmn/tasks/${unclaimed.id}/delegate`, {
        toUserId: userId,
      });
      test('Admin delegates to user', delegate.ok);

      // Verify delegated
      const afterDelegate = await adminApi('GET', `/bpmn/tasks/${unclaimed.id}`);
      test('Task delegated', afterDelegate.data?.assigneeId === userId);

      // User adds comment
      const userComment = await userApi('POST', `/bpmn/tasks/${unclaimed.id}/comments`, {
        content: '[QA] Выполняю задачу после делегирования',
      });
      test('User adds comment', userComment.ok);

      // User completes task
      const complete = await userApi('POST', `/bpmn/tasks/${unclaimed.id}/complete`, {
        formData: { decision: 'approved', comment: 'QA multi-user test — approved by delegate' },
      });
      test('User completes delegated task', complete.ok);

      // Verify completed
      const afterComplete = await adminApi('GET', `/bpmn/tasks/${unclaimed.id}`);
      test('Task completed', afterComplete.data?.status === 'completed');

      // Check history
      const history = afterComplete.data?.history;
      if (Array.isArray(history)) {
        console.log(`  Task history entries: ${history.length}`);
        test('Task has history', history.length >= 3, `entries: ${history.length}`);
      }
    } else {
      console.log('  No unclaimed tasks — trying with new process instance');
    }
  }

  // ===== START NEW PROCESS & WAIT FOR TASK =====
  console.log('\n📋 Phase 4: Start process & complete tasks');

  // Find Заявки клиентов workspace (has support-ticket process)
  const zkWs = workspaces.data?.find(w => w.name?.includes('Заявки'));
  if (zkWs) {
    const defs = await adminApi('GET', `/bpmn/definitions/${zkWs.id}`);
    const defList = Array.isArray(defs.data) ? defs.data : (defs.data?.data || []);

    if (defList.length > 0 && defList[0].deployedKey) {
      console.log(`  Starting process in "${zkWs.name}": ${defList[0].name}`);

      const start = await adminApi('POST', '/bpmn/instances/start', {
        definitionId: defList[0].id,
        variables: { workspaceId: zkWs.id, testRun: true },
      });
      test('Start new process', start.ok, `key: ${start.data?.processInstanceKey}`);

      // Wait for tasks to appear
      if (start.ok) {
        await new Promise(r => setTimeout(r, 3000)); // Wait for worker to create user tasks

        const newTasks = await adminApi('GET', `/bpmn/tasks?workspaceId=${zkWs.id}&status=created`);
        const newTaskList = Array.isArray(newTasks.data) ? newTasks.data : (newTasks.data?.tasks || []);
        console.log(`  New tasks after start: ${newTaskList.length}`);

        if (newTaskList.length > 0) {
          const task = newTaskList[0];
          console.log(`  Task: ${task.elementName || task.elementId}`);

          // Full lifecycle: claim → comment → complete
          await adminApi('POST', `/bpmn/tasks/${task.id}/claim`);
          await adminApi('POST', `/bpmn/tasks/${task.id}/comments`, { content: '[QA] Auto-test task' });
          const comp = await adminApi('POST', `/bpmn/tasks/${task.id}/complete`, {
            formData: { decision: 'approved' },
          });
          test('Complete fresh task', comp.ok);

          // Wait and check next tasks appeared
          await new Promise(r => setTimeout(r, 2000));
          const nextTasks = await adminApi('GET', `/bpmn/tasks?workspaceId=${zkWs.id}&status=created`);
          const nextList = Array.isArray(nextTasks.data) ? nextTasks.data : (nextTasks.data?.tasks || []);
          console.log(`  Tasks after completion: ${nextList.length} (process progressed)`);
        }
      }
    }
  }

  // ===== DMN EVALUATION =====
  console.log('\n📋 Phase 5: DMN Tables & Evaluation');

  // Search all workspaces for DMN tables
  let dmnFound = false;
  for (const ws of workspaces.data || []) {
    const tables = await adminApi('GET', `/dmn/tables?workspaceId=${ws.id}`);
    const tableList = Array.isArray(tables.data) ? tables.data : [];

    if (tableList.length > 0) {
      console.log(`  Found ${tableList.length} DMN table(s) in "${ws.name}"`);
      dmnFound = true;

      for (const table of tableList) {
        const detail = await adminApi('GET', `/dmn/tables/${table.id}`);
        test(`DMN table: ${detail.data?.name}`, detail.ok, `rules: ${detail.data?.rules?.length}`);

        // Try evaluate with sample data
        if (detail.data?.inputColumns?.length > 0) {
          const inputData = {};
          for (const col of detail.data.inputColumns) {
            // Use first rule's values as sample
            if (detail.data.rules?.length > 0) {
              const firstRule = detail.data.rules[0];
              inputData[col.id] = firstRule.inputs?.[col.id] ?? 'medium';
            } else {
              inputData[col.id] = 'medium';
            }
          }

          const evalResp = await adminApi('POST', '/dmn/evaluate', {
            decisionTableId: table.id,
            inputData,
          });
          test(`DMN evaluate: ${table.name}`, evalResp.ok,
            `matched: ${evalResp.data?.matchedRules?.length || 0}, output: ${JSON.stringify(evalResp.data?.finalOutput || evalResp.data?.output || {}).substring(0, 80)}`);
        }

        // Stats
        const stats = await adminApi('GET', `/dmn/tables/${table.id}/statistics`);
        test(`DMN stats: ${table.name}`, stats.ok);
      }
      break;
    }
  }

  if (!dmnFound) {
    console.log('  No DMN tables found in any workspace');
  }

  // ===== SLA =====
  console.log('\n📋 Phase 6: SLA across workspaces');
  let slaCount = 0;
  for (const ws of workspaces.data?.slice(0, 8) || []) {
    const sla = await adminApi('GET', `/sla/definitions?workspaceId=${ws.id}`);
    const slaList = Array.isArray(sla.data) ? sla.data : [];
    if (slaList.length > 0) {
      slaCount += slaList.length;
      console.log(`  ${ws.name}: ${slaList.length} SLA definition(s)`);

      // Dashboard
      const dash = await adminApi('GET', `/sla/dashboard?workspaceId=${ws.id}`);
      test(`SLA dashboard: ${ws.name}`, dash.ok);
    }
  }
  test('SLA definitions found', slaCount > 0, `total: ${slaCount}`);

  // ===== BATCH OPERATIONS =====
  console.log('\n📋 Phase 7: Batch operations');
  const batchTasks = await adminApi('GET', `/bpmn/tasks?status=created`);
  const batchList = Array.isArray(batchTasks.data) ? batchTasks.data : (batchTasks.data?.tasks || []);

  if (batchList.length >= 2) {
    const ids = batchList.slice(0, 2).map(t => t.id);
    const batch = await adminApi('POST', '/bpmn/tasks/batch/claim', { taskIds: ids });
    test('Batch claim', batch.ok, `claimed: ${ids.length}`);
  } else {
    console.log('  Not enough unclaimed tasks for batch test');
  }

  // ===== PROCESS TRIGGERS =====
  console.log('\n📋 Phase 8: Process trigger check (entity creation)');
  // Count instances before and after entity creation in workspace with trigger
  if (zkWs) {
    const before = await adminApi('GET', `/bpmn/instances/workspace/${zkWs.id}`);
    const beforeList = Array.isArray(before.data) ? before.data : (before.data?.data || []);
    console.log(`  Instances before: ${beforeList.length}`);
    // NOTE: Actually creating entity would require workspace entity type info — skip for now
    console.log('  (Trigger test via entity creation requires entity schema — documented for manual test)');
  }

  // ===== SUMMARY =====
  console.log('\n' + '='.repeat(60));
  console.log('MULTI-USER BPMN + DMN TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`Total: ${results.total} | Passed: ${results.passed} | Failed: ${results.failed}`);
  if (results.errors.length > 0) {
    console.log('\nFailed:');
    results.errors.forEach(e => console.log('  ❌ ' + e));
  }
  console.log('='.repeat(60));
}

run().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
