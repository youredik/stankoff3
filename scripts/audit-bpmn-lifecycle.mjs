/**
 * Full BPMN Lifecycle Test
 * Tests: templates, deployment, process start, user tasks, DMN, triggers
 */

const BASE = 'http://localhost:3000/api';
let TOKEN = '';
let userId = '';
let wsId = '';  // workspaceId for testing

async function api(method, path, body) {
  const opts = {
    method,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(BASE + path, opts);
  const data = await resp.json().catch(() => null);
  return { status: resp.status, data, ok: resp.status < 400 };
}

function log(emoji, msg) { console.log(`${emoji} ${msg}`); }
function pass(msg) { log('✅', msg); }
function fail(msg) { log('❌', msg); }
function info(msg) { log('📋', msg); }
function warn(msg) { log('⚠️', msg); }

const results = { total: 0, passed: 0, failed: 0, errors: [] };

function test(name, ok, details = '') {
  results.total++;
  if (ok) { results.passed++; pass(name); }
  else { results.failed++; fail(name + (details ? ' — ' + details : '')); results.errors.push(name); }
}

async function run() {
  log('🚀', 'Starting Full BPMN Lifecycle Test');
  log('', '='.repeat(60));

  // ========== 1. AUTH ==========
  info('Phase 1: Authentication');
  const auth = await api('POST', '/auth/dev/login', { email: 'youredik@gmail.com' });
  TOKEN = auth.data?.accessToken;
  test('Auth login', !!TOKEN);

  const me = await api('GET', '/auth/me');
  userId = me.data?.id;
  test('Auth /me', me.ok && !!userId, userId);

  // ========== 2. ZEEBE HEALTH ==========
  info('Phase 2: Zeebe Health');
  const health = await api('GET', '/bpmn/health');
  test('Zeebe connected', health.data?.connected === true);
  test('Zeebe brokers', health.data?.brokers >= 1);

  // ========== 3. TEMPLATES ==========
  info('Phase 3: Process Templates');
  const templates = await api('GET', '/bpmn/templates');
  test('Templates list', templates.ok && Array.isArray(templates.data), `count: ${templates.data?.length}`);

  const categories = await api('GET', '/bpmn/templates/categories');
  test('Template categories', categories.ok && Array.isArray(categories.data), `count: ${categories.data?.length}`);

  if (templates.data?.length > 0) {
    const tmplId = templates.data[0].id;
    const tmpl = await api('GET', `/bpmn/templates/${tmplId}`);
    test('Template detail', tmpl.ok && !!tmpl.data?.bpmnXml, `name: ${tmpl.data?.name}`);
  }

  // ========== 4. WORKSPACES ==========
  info('Phase 4: Find Test Workspace');
  const workspaces = await api('GET', '/workspaces');
  test('Workspaces list', workspaces.ok && workspaces.data?.length > 0, `count: ${workspaces.data?.length}`);

  // Find IT workspace (Разработка Stankoff Portal) — created by current user
  const itWs = workspaces.data?.find(w => w.name?.includes('Разработка') || w.name?.includes('IT'));
  const hrWs = workspaces.data?.find(w => w.name?.includes('HR'));
  wsId = (itWs || hrWs || workspaces.data[0])?.id;
  info(`Using workspace: ${(itWs || hrWs || workspaces.data[0])?.name} (${wsId})`);

  // ========== 5. PROCESS DEFINITIONS ==========
  info('Phase 5: Process Definitions');
  const defs = await api('GET', `/bpmn/definitions/${wsId}`);
  test('Definitions list', defs.ok, `count: ${Array.isArray(defs.data) ? defs.data.length : defs.data?.data?.length || '?'}`);

  const defsList = Array.isArray(defs.data) ? defs.data : (defs.data?.data || []);
  let testDefId = null;
  let testDefDeployedKey = null;

  if (defsList.length > 0) {
    testDefId = defsList[0].id;
    testDefDeployedKey = defsList[0].deployedKey;
    const defDetail = await api('GET', `/bpmn/definition/${testDefId}`);
    test('Definition detail', defDetail.ok && !!defDetail.data?.bpmnXml, `name: ${defDetail.data?.name}, deployed: ${!!defDetail.data?.deployedKey}`);

    // Versions
    const versions = await api('GET', `/bpmn/definition/${testDefId}/versions`);
    test('Definition versions', versions.ok, `count: ${Array.isArray(versions.data) ? versions.data.length : '?'}`);
  } else {
    warn('No definitions found — will create from template');

    // Create from template
    if (templates.data?.length > 0) {
      const tmpl = templates.data.find(t => t.id === 'simple-approval') || templates.data[0];
      const fullTmpl = await api('GET', `/bpmn/templates/${tmpl.id}`);

      if (fullTmpl.ok && fullTmpl.data?.bpmnXml) {
        const createDef = await api('POST', `/bpmn/definitions/${wsId}`, {
          name: 'Test: ' + tmpl.name,
          processId: 'test-lifecycle-' + Date.now(),
          bpmnXml: fullTmpl.data.bpmnXml,
          description: 'Lifecycle test process',
        });
        test('Create definition', createDef.ok, `id: ${createDef.data?.id}`);
        testDefId = createDef.data?.id;

        if (testDefId) {
          const deploy = await api('POST', `/bpmn/definition/${testDefId}/deploy`, { changelog: 'Test deploy' });
          test('Deploy definition', deploy.ok, `key: ${deploy.data?.deployedKey}`);
          testDefDeployedKey = deploy.data?.deployedKey;
        }
      }
    }
  }

  // ========== 6. START PROCESS INSTANCE ==========
  info('Phase 6: Start Process Instance');
  let instanceId = null;
  let instanceKey = null;

  if (testDefId) {
    // Get an entity in this workspace
    const members = await api('GET', `/workspaces/${wsId}/members`);
    info(`Workspace members: ${members.data?.length || 0}`);

    const startResp = await api('POST', '/bpmn/instances/start', {
      definitionId: testDefId,
      variables: {
        entityId: null, // No entity required for basic test
        workspaceId: wsId,
        testRun: true,
      },
    });
    test('Start process instance', startResp.ok, `key: ${startResp.data?.processInstanceKey}`);
    instanceId = startResp.data?.id;
    instanceKey = startResp.data?.processInstanceKey;

    if (instanceId) {
      // Check timeline
      const timeline = await api('GET', `/bpmn/instances/${instanceId}/timeline`);
      test('Instance timeline', timeline.ok, `activities: ${Array.isArray(timeline.data) ? timeline.data.length : '?'}`);
    }
  }

  // ========== 7. EXISTING PROCESS INSTANCES ==========
  info('Phase 7: Existing Process Instances');
  const instances = await api('GET', `/bpmn/instances/workspace/${wsId}`);
  test('Workspace instances', instances.ok, `count: ${Array.isArray(instances.data) ? instances.data.length : instances.data?.data?.length || '?'}`);

  const instList = Array.isArray(instances.data) ? instances.data : (instances.data?.data || []);
  const activeInstances = instList.filter(i => i.status === 'active');
  info(`Active instances: ${activeInstances.length}, Total: ${instList.length}`);

  // ========== 8. USER TASKS ==========
  info('Phase 8: User Tasks');
  const inbox = await api('GET', '/bpmn/tasks/inbox');
  const inboxTasks = Array.isArray(inbox.data) ? inbox.data : (inbox.data?.tasks || inbox.data?.data || []);
  test('Task inbox', inbox.ok, `tasks: ${inboxTasks.length}`);

  const taskStats = await api('GET', `/bpmn/tasks/statistics?workspaceId=${wsId}`);
  test('Task statistics', taskStats.ok, JSON.stringify(taskStats.data || {}).substring(0, 100));

  // Search tasks
  const taskSearch = await api('GET', `/bpmn/tasks?workspaceId=${wsId}`);
  const searchTasks = Array.isArray(taskSearch.data) ? taskSearch.data : (taskSearch.data?.tasks || taskSearch.data?.data || []);
  test('Task search', taskSearch.ok, `found: ${searchTasks.length}`);

  // Try full user task lifecycle on first available task
  const allTasks = [...inboxTasks, ...searchTasks];
  const unclaimedTask = allTasks.find(t => t.status === 'created');
  const claimedTask = allTasks.find(t => t.status === 'claimed' && t.assigneeId === userId);

  if (unclaimedTask) {
    info(`Testing task lifecycle on: ${unclaimedTask.elementName || unclaimedTask.id}`);

    // Get task detail
    const detail = await api('GET', `/bpmn/tasks/${unclaimedTask.id}`);
    test('Task detail', detail.ok, `element: ${detail.data?.elementName}`);

    // Get comments
    const comments = await api('GET', `/bpmn/tasks/${unclaimedTask.id}/comments`);
    test('Task comments', comments.ok, `count: ${Array.isArray(comments.data) ? comments.data.length : '?'}`);

    // Add comment
    const addComment = await api('POST', `/bpmn/tasks/${unclaimedTask.id}/comments`, {
      content: '[QA Test] Lifecycle audit comment — ' + new Date().toISOString(),
    });
    test('Add task comment', addComment.ok);

    // Claim task
    const claim = await api('POST', `/bpmn/tasks/${unclaimedTask.id}/claim`);
    test('Claim task', claim.ok, `status after: ${claim.data?.status}`);

    // Verify claimed
    const afterClaim = await api('GET', `/bpmn/tasks/${unclaimedTask.id}`);
    test('Task is claimed', afterClaim.data?.status === 'claimed' && afterClaim.data?.assigneeId === userId);

    // Complete task with form data
    const complete = await api('POST', `/bpmn/tasks/${unclaimedTask.id}/complete`, {
      formData: { decision: 'approved', comment: 'QA lifecycle test — auto-approved' },
    });
    test('Complete task', complete.ok, `status: ${complete.data?.status}`);

    // Verify completed
    const afterComplete = await api('GET', `/bpmn/tasks/${unclaimedTask.id}`);
    test('Task is completed', afterComplete.data?.status === 'completed');
  } else if (claimedTask) {
    info(`Found claimed task: ${claimedTask.elementName || claimedTask.id} — testing complete`);

    // Complete already-claimed task
    const complete = await api('POST', `/bpmn/tasks/${claimedTask.id}/complete`, {
      formData: { decision: 'approved', comment: 'QA lifecycle test' },
    });
    test('Complete claimed task', complete.ok, `status: ${complete.data?.status}`);
  } else {
    warn('No unclaimed/claimable tasks found — testing with different user');

    // Try getting tasks for other users
    const allWsTasks = await api('GET', `/bpmn/tasks?workspaceId=${wsId}&status=created`);
    const uncreated = Array.isArray(allWsTasks.data) ? allWsTasks.data : (allWsTasks.data?.tasks || []);
    info(`Available unclaimed tasks in workspace: ${uncreated.length}`);
  }

  // ========== 9. DELEGATE TASK (different user) ==========
  info('Phase 9: Task Delegation');
  const secondUser = await api('GET', '/users');
  const users = Array.isArray(secondUser.data) ? secondUser.data : [];
  const otherUser = users.find(u => u.id !== userId && u.email?.includes('stankoff'));

  if (otherUser) {
    // Find a task to delegate
    const myTasks = await api('GET', `/bpmn/tasks?assigneeId=${userId}&status=claimed`);
    const myTaskList = Array.isArray(myTasks.data) ? myTasks.data : (myTasks.data?.tasks || []);

    if (myTaskList.length > 0) {
      const delegateResp = await api('POST', `/bpmn/tasks/${myTaskList[0].id}/delegate`, {
        toUserId: otherUser.id,
      });
      test('Delegate task', delegateResp.ok, `to: ${otherUser.email}`);
    } else {
      info('No claimed tasks to delegate — skipping');
    }
  }

  // ========== 10. DMN TABLES ==========
  info('Phase 10: DMN Decision Tables');
  const dmnTables = await api('GET', `/dmn/tables?workspaceId=${wsId}`);
  const tables = Array.isArray(dmnTables.data) ? dmnTables.data : [];
  test('DMN tables list', dmnTables.ok, `count: ${tables.length}`);

  if (tables.length > 0) {
    const tableId = tables[0].id;
    const tableDetail = await api('GET', `/dmn/tables/${tableId}`);
    test('DMN table detail', tableDetail.ok, `name: ${tableDetail.data?.name}, rules: ${tableDetail.data?.rules?.length}`);

    // Evaluate DMN
    if (tableDetail.data?.inputColumns?.length > 0) {
      const inputData = {};
      for (const col of tableDetail.data.inputColumns) {
        // Use sample values based on type
        if (col.dataType === 'number') inputData[col.id || col.name] = 50;
        else if (col.dataType === 'boolean') inputData[col.id || col.name] = true;
        else inputData[col.id || col.name] = 'high'; // string default
      }

      const evalResp = await api('POST', '/dmn/evaluate', {
        decisionTableId: tableId,
        inputData,
      });
      test('DMN evaluate', evalResp.ok, `matchedRules: ${evalResp.data?.matchedRules?.length || 0}`);

      if (evalResp.ok) {
        info(`DMN result: ${JSON.stringify(evalResp.data?.finalOutput || evalResp.data?.output || {}).substring(0, 100)}`);
      }
    }

    // Statistics
    const stats = await api('GET', `/dmn/tables/${tableId}/statistics`);
    test('DMN statistics', stats.ok);
  } else {
    // Check all workspaces for DMN
    for (const ws of workspaces.data.slice(0, 5)) {
      const t = await api('GET', `/dmn/tables?workspaceId=${ws.id}`);
      const tList = Array.isArray(t.data) ? t.data : [];
      if (tList.length > 0) {
        info(`Found DMN tables in workspace "${ws.name}": ${tList.length}`);
        const tableId = tList[0].id;
        const detail = await api('GET', `/dmn/tables/${tableId}`);
        test('DMN table (other ws)', detail.ok, `name: ${detail.data?.name}`);
        break;
      }
    }
  }

  // ========== 11. SLA ==========
  info('Phase 11: SLA Definitions');
  const sla = await api('GET', `/sla/definitions?workspaceId=${wsId}`);
  test('SLA definitions', sla.ok, `count: ${Array.isArray(sla.data) ? sla.data.length : '?'}`);

  // Try SLA dashboard per workspace
  const slaDash = await api('GET', `/sla/dashboard?workspaceId=${wsId}`);
  test('SLA dashboard', slaDash.ok);

  // ========== 12. STATISTICS ==========
  info('Phase 12: Process Statistics');
  if (testDefId) {
    const defStats = await api('GET', `/bpmn/statistics/definition/${testDefId}`);
    test('Definition statistics', defStats.ok);
  }

  const wsStats = await api('GET', `/bpmn/statistics/workspace/${wsId}`);
  test('Workspace statistics', wsStats.ok);

  // ========== 13. CANCEL TEST INSTANCE ==========
  if (instanceKey) {
    info('Phase 13: Cancel Test Instance');
    const cancel = await api('POST', `/bpmn/instances/${instanceKey}/cancel`);
    test('Cancel test instance', cancel.ok, `key: ${instanceKey}`);
  }

  // ========== SUMMARY ==========
  console.log('\n' + '='.repeat(60));
  console.log(`BPMN LIFECYCLE TEST RESULTS`);
  console.log('='.repeat(60));
  console.log(`Total: ${results.total} | Passed: ${results.passed} | Failed: ${results.failed}`);
  if (results.errors.length > 0) {
    console.log('\nFailed tests:');
    results.errors.forEach(e => console.log('  ❌ ' + e));
  }
  console.log('='.repeat(60));
}

run().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
